// Tests for the Vercel Function api/trip.js with ViaCEP and Google Routes mocked (no network).
const test = require("node:test");
const assert = require("node:assert/strict");
const CONFIG = require("../src/config.js");

process.env.GOOGLE_MAPS_API_KEY = "test-key-not-real";
const handler = require("../api/trip.js");

const realFetch = global.fetch;
let calls = [];
let routes = () => ({ routes: [{ distanceMeters: 10000 }] });

function mockFetch({ notFound = [], failRoutes = false } = {}) {
    calls = [];
    global.fetch = async (url, options = {}) => {
        calls.push({ url: String(url), options });
        if (String(url).includes("viacep.com.br")) {
            const cep = /ws\/(\d+)\//.exec(url)[1];
            if (notFound.includes(cep)) return { ok: true, json: async () => ({ erro: true }) };
            return { ok: true, json: async () => ({ logradouro: "Rua Exemplo", bairro: "Centro", localidade: "São Paulo", uf: "SP" }) };
        }
        if (failRoutes) return { ok: false, json: async () => ({}) };
        return { ok: true, json: async () => routes(JSON.parse(options.body)) };
    };
}

async function call(body, { method = "POST", contentType = "application/json" } = {}) {
    const result = { status: 200, body: null, headers: {} };
    const response = {
        status(code) { result.status = code; return response; },
        setHeader(name, value) { result.headers[name] = value; return response; },
        json(data) { result.body = data; return response; }
    };
    await handler({ method, headers: contentType ? { "content-type": contentType } : {}, body }, response);
    return result;
}

test.after(() => { global.fetch = realFetch; });

test("rejects anything that is not a JSON POST with an 8-digit CEP", async () => {
    mockFetch();
    assert.equal((await call({ cep: "01001000" }, { method: "GET" })).status, 405);
    assert.equal((await call("x", { contentType: "text/plain" })).status, 415);
    assert.equal((await call({ cep: "1".repeat(2000) })).status, 413);
    assert.deepEqual((await call({ cep: "123" })).body, { error: "INVALID_CEP" });
    assert.deepEqual((await call({ cep: { $gt: "" } })).body, { error: "INVALID_CEP" });
    assert.deepEqual((await call("{not json")).body, { error: "INVALID_CEP" });
    assert.equal(calls.length, 0, "no upstream call for invalid input");
});

test("priced tolls: returns km and tolls for car + trailer, key only in the Google header", async () => {
    mockFetch();
    routes = () => ({
        routes: [{ distanceMeters: 42300, travelAdvisory: { tollInfo: { estimatedPrice: [{ currencyCode: "BRL", units: "9", nanos: 350000000 }] } } }]
    });
    const result = await call({ cep: "01001-000" });
    assert.equal(result.status, 200);
    assert.equal(result.body.outboundKm, 42.3);
    assert.equal(result.body.returnKm, 42.3);
    assert.equal(result.body.tollsStatus, "priced");
    assert.ok(Math.abs(result.body.tollsBRL - (9.35 + 9.35) * CONFIG.TOLL_VEHICLE_MULTIPLIER) < 1e-9);
    assert.deepEqual(Object.keys(result.body).sort(), ["outboundKm", "returnKm", "tollsBRL", "tollsStatus"]);

    const google = calls.filter((c) => c.url.includes("routes.googleapis.com"));
    assert.equal(google.length, 2, "outbound + return");
    assert.equal(google[0].options.headers["X-Goog-Api-Key"], "test-key-not-real");
    assert.ok(calls.every((c) => !c.url.includes("test-key-not-real")), "key never goes in a URL");
    assert.ok(calls.some((c) => c.url.includes(`/ws/${CONFIG.ORIGIN_CEP}/`)), "origin CEP comes from src/config.js");
});

test("a repeated CEP is served from the cache", async () => {
    mockFetch();
    const first = await call({ cep: "01001000" });
    assert.equal(calls.length, 0);
    assert.equal(first.status, 200);
});

test("no tolls on the route", async () => {
    mockFetch();
    routes = () => ({ routes: [{ distanceMeters: 5000 }] });
    const result = await call({ cep: "02002000" });
    assert.deepEqual(result.body, { outboundKm: 5, returnKm: 5, tollsBRL: 0, tollsStatus: "none" });
});

test("toll road without a price: status unknown, not cached", async () => {
    mockFetch();
    routes = () => ({ routes: [{ distanceMeters: 8000, travelAdvisory: { tollInfo: {} } }] });
    const result = await call({ cep: "03003000" });
    assert.equal(result.body.tollsStatus, "unknown");
    assert.equal(result.body.tollsBRL, null);
    await call({ cep: "03003000" });
    assert.ok(calls.filter((c) => c.url.includes("routes.googleapis.com")).length >= 4, "asked again");
});

test("unknown CEP: 404, remembered, and the remembered list stays bounded", async () => {
    const missing = Array.from({ length: 260 }, (_, i) => String(90000000 + i));
    mockFetch({ notFound: missing });
    assert.deepEqual((await call({ cep: missing[259] })).body, { error: "CEP_NOT_FOUND" });
    const before = calls.length;
    assert.equal((await call({ cep: missing[259] })).status, 404);
    assert.equal(calls.length, before, "second request does not call ViaCEP");

    for (const cep of missing.slice(0, 259)) await call({ cep });
    const afterFill = calls.length;
    await call({ cep: missing[259] }); // the oldest entry was evicted, so it is looked up again
    assert.equal(calls.length, afterFill + 1);
});

test("upstream failure becomes a 502 without details", async () => {
    mockFetch({ failRoutes: true });
    const result = await call({ cep: "04004000" });
    assert.equal(result.status, 502);
    assert.deepEqual(result.body, { error: "UPSTREAM_ERROR" });
});

test("missing key: 500 SERVICE_UNAVAILABLE", async () => {
    mockFetch();
    delete process.env.GOOGLE_MAPS_API_KEY;
    const result = await call({ cep: "05005000" });
    process.env.GOOGLE_MAPS_API_KEY = "test-key-not-real";
    assert.equal(result.status, 500);
    assert.deepEqual(result.body, { error: "SERVICE_UNAVAILABLE" });
});
