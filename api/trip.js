const CONFIG = Object.freeze({
  ORIGIN_CEP: "08260280",
  CACHE_TTL_MS: 6 * 60 * 60 * 1000,
  CACHE_MAX_ENTRIES: 200,
  NEGATIVE_TTL_MS: 10 * 60 * 1000,
  MAX_BODY_BYTES: 512,
  REQUEST_TIMEOUT_MS: 8000,
  TOLL_VEHICLE_MULTIPLIER: 2
});

let originAddressCache = null;
const resultCache = new Map();
const negativeCache = new Map();
const inFlightRequests = new Map();

function sendError(response, status, code) {
  return response.status(status).json({ error: code });
}

async function buscarEndereco(cep, signal) {
  const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal });
  if (!response.ok) throw new Error("UPSTREAM_ERROR");

  const data = await response.json();
  if (data.erro === true || data.erro === "true") return null;

  const addressParts = [
    data.logradouro,
    data.bairro,
    data.localidade && data.uf ? `${data.localidade} - ${data.uf}` : data.localidade || data.uf,
    cep,
    "Brasil"
  ].filter(Boolean);

  return addressParts.join(", ");
}

async function getOriginAddress(signal) {
  if (originAddressCache) return originAddressCache;
  const address = await buscarEndereco(CONFIG.ORIGIN_CEP, signal);
  if (!address) throw new Error("UPSTREAM_ERROR");
  originAddressCache = address;
  return address;
}

function construirBodyRoute(origin, destination) {
  return {
    origin: { address: origin },
    destination: { address: destination },
    travelMode: "DRIVE",
    routeModifiers: {
      vehicleInfo: { emissionType: "GASOLINE" }
    },
    extraComputations: ["TOLLS"],
    regionCode: "BR",
    languageCode: "pt-BR"
  };
}

async function buscarRota(origin, destination, apiKey, signal) {
  const response = await fetch(
    "https://routes.googleapis.com/directions/v2:computeRoutes",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "routes.distanceMeters,routes.travelAdvisory.tollInfo"
      },
      body: JSON.stringify(construirBodyRoute(origin, destination)),
      signal
    }
  );
  if (!response.ok) throw new Error("UPSTREAM_ERROR");

  const data = await response.json();
  const route = Array.isArray(data.routes) ? data.routes[0] : null;
  if (
    !route ||
    typeof route.distanceMeters !== "number" ||
    !Number.isFinite(route.distanceMeters) ||
    route.distanceMeters < 0
  ) {
    throw new Error("UPSTREAM_ERROR");
  }

  return {
    distanceKm: route.distanceMeters / 1000,
    tollInfo: route.travelAdvisory && route.travelAdvisory.tollInfo
  };
}

function totalizarPedagios(outbound, returning) {
  if (!outbound.tollInfo && !returning.tollInfo) {
    return { tollsBRL: 0, tollsStatus: "none" };
  }

  const tollInfos = [outbound.tollInfo, returning.tollInfo];
  if (tollInfos.some((tollInfo) =>
    !tollInfo ||
    !Array.isArray(tollInfo.estimatedPrice) ||
    tollInfo.estimatedPrice.length === 0
  )) {
    return { tollsBRL: null, tollsStatus: "unknown" };
  }

  let total = 0;
  for (const tollInfo of tollInfos) {
    for (const price of tollInfo.estimatedPrice) {
      if (price.currencyCode !== "BRL") {
        return { tollsBRL: null, tollsStatus: "unknown" };
      }

      const units = Number(price.units);
      const nanos = Number(price.nanos || 0);
      if (!Number.isFinite(units) || !Number.isFinite(nanos)) {
        return { tollsBRL: null, tollsStatus: "unknown" };
      }

      total += units + nanos / 1_000_000_000;
    }
  }

  return {
    tollsBRL: total * CONFIG.TOLL_VEHICLE_MULTIPLIER,
    tollsStatus: "priced"
  };
}

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return sendError(response, 405, "METHOD_NOT_ALLOWED");
  }

  const contentType = request.headers && request.headers["content-type"];
  if (typeof contentType !== "string" || !/^application\/json(?:\s*;|$)/i.test(contentType)) {
    return sendError(response, 415, "UNSUPPORTED_MEDIA_TYPE");
  }

  let serializedBody;
  if (typeof request.body === "string") {
    serializedBody = request.body;
  } else {
    try {
      serializedBody = JSON.stringify(request.body);
    } catch {
      return sendError(response, 400, "INVALID_CEP");
    }
  }

  if (
    typeof serializedBody === "string" &&
    Buffer.byteLength(serializedBody, "utf8") > CONFIG.MAX_BODY_BYTES
  ) {
    return sendError(response, 413, "BODY_TOO_LARGE");
  }

  let body;
  if (typeof request.body === "string") {
    try {
      body = JSON.parse(serializedBody);
    } catch {
      return sendError(response, 400, "INVALID_CEP");
    }
  } else {
    body = request.body;
  }

  if (!body || typeof body.cep !== "string") {
    return sendError(response, 400, "INVALID_CEP");
  }

  const cep = body.cep.replace(/\D/g, "");
  if (!/^\d{8}$/.test(cep)) {
    return sendError(response, 400, "INVALID_CEP");
  }

  const now = Date.now();
  const cachedResult = resultCache.get(cep);
  if (cachedResult) {
    if (cachedResult.expiresAt > now) {
      return response.status(200).json(cachedResult.body);
    }
    resultCache.delete(cep);
  }

  const negativeExpiresAt = negativeCache.get(cep);
  if (negativeExpiresAt) {
    if (negativeExpiresAt > now) {
      return sendError(response, 404, "CEP_NOT_FOUND");
    }
    negativeCache.delete(cep);
  }

  const inFlight = inFlightRequests.get(cep);
  if (inFlight) {
    const result = await inFlight;
    return response.status(result.status).json(result.body);
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return sendError(response, 500, "SERVICE_UNAVAILABLE");
  }

  const requestPromise = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT_MS);

    try {
      const destinationAddress = await buscarEndereco(cep, controller.signal);
      if (!destinationAddress) {
        negativeCache.set(cep, Date.now() + CONFIG.NEGATIVE_TTL_MS);
        return { status: 404, body: { error: "CEP_NOT_FOUND" } };
      }

      const originAddress = await getOriginAddress(controller.signal);
      const [outbound, returning] = await Promise.all([
        buscarRota(originAddress, destinationAddress, apiKey, controller.signal),
        buscarRota(destinationAddress, originAddress, apiKey, controller.signal)
      ]);

      const tolls = totalizarPedagios(outbound, returning);
      const result = {
        outboundKm: outbound.distanceKm,
        returnKm: returning.distanceKm,
        tollsBRL: tolls.tollsBRL,
        tollsStatus: tolls.tollsStatus
      };

      if (tolls.tollsStatus === "priced" || tolls.tollsStatus === "none") {
        if (resultCache.size >= CONFIG.CACHE_MAX_ENTRIES) {
          const oldestCep = resultCache.keys().next().value;
          if (oldestCep !== undefined) resultCache.delete(oldestCep);
        }
        resultCache.set(cep, {
          body: result,
          expiresAt: Date.now() + CONFIG.CACHE_TTL_MS
        });
      }

      return { status: 200, body: result };
    } catch {
      return { status: 502, body: { error: "UPSTREAM_ERROR" } };
    } finally {
      clearTimeout(timeout);
      inFlightRequests.delete(cep);
    }
  })();

  inFlightRequests.set(cep, requestPromise);
  const result = await requestPromise;
  return response.status(result.status).json(result.body);
};
