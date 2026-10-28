const APP_CONFIG = require("../config");

const CONFIG = Object.freeze({
  TO_EMAIL: "andersonaugustorei1227@gmail.com",
  RESEND_URL: "https://api.resend.com/emails",
  MAX_BODY_BYTES: 8192,
  REQUEST_TIMEOUT_MS: 8000,
  RESERVATION_DEPOSIT_PERCENT: APP_CONFIG.RESERVATION_DEPOSIT_PERCENT
});

function sendJson(response, status, body) {
  return response.status(status).json(body);
}

function isNonNegativeNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(value);
}

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return sendJson(response, 405, { error: "METHOD_NOT_ALLOWED" });
  }

  const contentType = request.headers && request.headers["content-type"];
  if (typeof contentType !== "string" || !/^application\/json(?:\s*;|$)/i.test(contentType)) {
    return sendJson(response, 415, { error: "UNSUPPORTED_MEDIA_TYPE" });
  }

  let serializedBody;
  if (typeof request.body === "string") {
    serializedBody = request.body;
  } else {
    try {
      serializedBody = JSON.stringify(request.body);
    } catch {
      return sendJson(response, 400, { error: "INVALID_QUOTE" });
    }
  }

  if (typeof serializedBody !== "string") {
    return sendJson(response, 400, { error: "INVALID_QUOTE" });
  }

  if (Buffer.byteLength(serializedBody, "utf8") > CONFIG.MAX_BODY_BYTES) {
    return sendJson(response, 413, { error: "BODY_TOO_LARGE" });
  }

  let quote;
  try {
    quote = typeof request.body === "string" ? JSON.parse(serializedBody) : request.body;
  } catch {
    return sendJson(response, 400, { error: "INVALID_QUOTE" });
  }

  if (
    !quote ||
    typeof quote.cep !== "string" ||
    !/^\d{8}$/.test(quote.cep) ||
    typeof quote.venueName !== "string" ||
    !quote.venueName.trim() ||
    typeof quote.eventAddress !== "string" ||
    !quote.eventAddress.trim() ||
    !/^\d{4}-\d{2}-\d{2}$/.test(quote.startDate) ||
    !/^\d{2}:\d{2}$/.test(quote.startTime) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(quote.endDate) ||
    !/^\d{2}:\d{2}$/.test(quote.endTime) ||
    !isNonNegativeNumber(quote.hours) ||
    !isNonNegativeNumber(quote.hourlyRateBRL) ||
    !isNonNegativeNumber(quote.laborBRL) ||
    !isNonNegativeNumber(quote.outboundKm) ||
    !isNonNegativeNumber(quote.returnKm) ||
    !isNonNegativeNumber(quote.fuelBRL) ||
    !isNonNegativeNumber(quote.tollsBRL) ||
    !["priced", "none", "manual"].includes(quote.tollsStatus)
  ) {
    return sendJson(response, 400, { error: "INVALID_QUOTE" });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !fromEmail) {
    return sendJson(response, 500, { error: "EMAIL_SERVICE_UNAVAILABLE" });
  }

  const totalBRL = quote.laborBRL + quote.fuelBRL + quote.tollsBRL;
  const depositBRL = totalBRL * CONFIG.RESERVATION_DEPOSIT_PERCENT / 100;
  const balanceBRL = totalBRL - depositBRL;
  const dateForEmail = (date) => {
    const [year, month, day] = date.split("-");
    return `${day}/${month}/${year}`;
  };
  const emailText = [
    "Novo orçamento do Paredão 011",
    "",
    `Local: ${quote.venueName.trim()}`,
    `Endereço: ${quote.eventAddress.trim()}`,
    `CEP consultado: ${quote.cep}`,
    `Início: ${dateForEmail(quote.startDate)} às ${quote.startTime}`,
    `Fim: ${dateForEmail(quote.endDate)} às ${quote.endTime}`,
    `Duração: ${quote.hours} horas`,
    "",
    "Detalhamento interno:",
    `Mão de obra (${formatCurrency(quote.hourlyRateBRL)}/hora): ${formatCurrency(quote.laborBRL)}`,
    `Distância de ida: ${quote.outboundKm} km`,
    `Distância de volta: ${quote.returnKm} km`,
    `Combustível: ${formatCurrency(quote.fuelBRL)}`,
    `Pedágios carro e carretinha: ${formatCurrency(quote.tollsBRL)} (${quote.tollsStatus})`,
    "",
    `Valor total: ${formatCurrency(totalBRL)}`,
    `Sinal (${CONFIG.RESERVATION_DEPOSIT_PERCENT}%): ${formatCurrency(depositBRL)}`,
    `Saldo no dia: ${formatCurrency(balanceBRL)}`
  ].join("\n");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT_MS);
  try {
    const resendResponse = await fetch(CONFIG.RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [CONFIG.TO_EMAIL],
        subject: `Novo orçamento - ${quote.venueName.trim()}`,
        text: emailText
      }),
      signal: controller.signal
    });

    if (!resendResponse.ok) {
      return sendJson(response, 502, { error: "EMAIL_DELIVERY_FAILED" });
    }

    return sendJson(response, 200, { sent: true });
  } catch {
    return sendJson(response, 502, { error: "EMAIL_DELIVERY_FAILED" });
  } finally {
    clearTimeout(timeout);
  }
};
