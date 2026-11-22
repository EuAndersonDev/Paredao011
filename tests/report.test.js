// Tests for the anonymous statistics (api/_lib/stats.js), /api/event and /api/report,
// with an in-memory Redis REST server and Resend mocked (no network).
const test = require("node:test");
const assert = require("node:assert/strict");

process.env.KV_REST_API_URL = "https://redis.test";
process.env.KV_REST_API_TOKEN = "redis-token-test";
process.env.CRON_SECRET = "cron-secret-test";
process.env.RESEND_API_KEY = "resend-key-test";
process.env.GOOGLE_MAPS_API_KEY = "maps-key-test";

const stats = require("../api/_lib/stats.js");
const eventHandler = require("../api/event.js");
const reportHandler = require("../api/report.js");
const tripHandler = require("../api/trip.js");

let store = new Map();
let emails = [];

function redisExec([cmd, key, ...args]) {
  switch (cmd) {
    case "HINCRBY": {
      const hash = store.get(key) || new Map();
      hash.set(args[0], (hash.get(args[0]) || 0) + Number(args[1]));
      store.set(key, hash);
      return hash.get(args[0]);
    }
    case "EXPIRE": return 1;
    case "SET": store.set(key, args[0]); return "OK";
    case "GET": return store.has(key) ? store.get(key) : null;
    case "HGETALL": {
      const hash = store.get(key);
      return hash ? [...hash.entries()].flatMap(([f, v]) => [f, String(v)]) : [];
    }
    default: throw new Error(`unexpected ${cmd}`);
  }
}

global.fetch = async (url, options = {}) => {
  url = String(url);
  if (url === "https://redis.test/pipeline") {
    assert.equal(options.headers.Authorization, "Bearer redis-token-test");
    const commands = JSON.parse(options.body);
    return { ok: true, json: async () => commands.map((c) => ({ result: redisExec(c) })) };
  }
  if (url === "https://api.resend.com/emails") {
    emails.push({ headers: options.headers, body: JSON.parse(options.body) });
    return { ok: true, json: async () => ({ id: "email-1" }) };
  }
  if (url.includes("viacep.com.br")) {
    return { ok: true, json: async () => ({ logradouro: "Rua Exemplo", bairro: "Centro", localidade: "Guarulhos", uf: "SP" }) };
  }
  if (url.includes("routes.googleapis.com")) {
    return { ok: true, json: async () => ({ routes: [{ distanceMeters: 30000 }] }) };
  }
  throw new Error(`unexpected fetch ${url}`);
};

async function call(handler, { method = "GET", body, headers = {}, query = {} } = {}) {
  const out = { status: 200, body: null, headers: {}, sent: null };
  const res = {
    status(code) { out.status = code; return res; },
    setHeader(k, v) { out.headers[k] = v; return res; },
    json(data) { out.body = data; return res; },
    send(data) { out.sent = data; return res; },
    end() { return res; }
  };
  await handler({ method, body, headers: { "content-type": "application/json", ...headers }, query }, res);
  return out;
}

test.beforeEach(() => { store = new Map(); emails = []; });

test("a quote is counted with its city and distance range, nothing personal is stored", async () => {
  const result = await call(tripHandler, { method: "POST", body: { cep: "07010000" } });
  assert.equal(result.status, 200);
  assert.deepEqual(Object.keys(result.body).sort(), ["outboundKm", "returnKm", "tollsBRL", "tollsStatus"], "response unchanged");
  const day = store.get(stats.hourKey());
  assert.equal(day.get("q"), 1);
  assert.equal(day.get("qc:SP|Guarulhos"), 1);
  assert.equal(day.get("km:50–100 km"), 1);
  const everything = JSON.stringify([...store.entries()].map(([k, v]) => [k, v instanceof Map ? [...v] : v]));
  assert.doesNotMatch(everything, /Rua Exemplo|Centro/, "no street or neighbourhood is stored");
});

test("confirmation: counted only for a CEP that was quoted, with value and duration", async () => {
  await call(tripHandler, { method: "POST", body: { cep: "07020000" } });
  const ok = await call(eventHandler, { method: "POST", body: { type: "confirm", cep: "07020-000", hours: 5, totalBRL: 1174.6 } });
  assert.equal(ok.status, 204);
  const day = store.get(stats.hourKey());
  assert.equal(day.get("c"), 1);
  assert.equal(day.get("cc:SP|Guarulhos"), 1);
  assert.equal(day.get("v"), 117460);
  assert.equal(day.get("h"), 500);

  const unknown = await call(eventHandler, { method: "POST", body: { type: "confirm", cep: "99999999", hours: 5, totalBRL: 100 } });
  assert.equal(unknown.status, 202, "ignored: never quoted");
  assert.equal(store.get(stats.hourKey()).get("c"), 1);
});

test("/api/event rejects bad input", async () => {
  assert.equal((await call(eventHandler, { method: "GET" })).status, 405);
  for (const body of [{ type: "x", cep: "07020000", hours: 5, totalBRL: 10 }, { type: "confirm", cep: "1", hours: 5, totalBRL: 10 },
    { type: "confirm", cep: "07020000", hours: -1, totalBRL: 10 }, { type: "confirm", cep: "07020000", hours: 5, totalBRL: "abc" }, "{bad"]) {
    assert.equal((await call(eventHandler, { method: "POST", body })).status, 400, JSON.stringify(body));
  }
  assert.equal((await call(eventHandler, { method: "POST", body: "x".repeat(400) })).status, 413);
});

test("/api/report requires the cron secret", async () => {
  assert.equal((await call(reportHandler)).status, 401);
  assert.equal((await call(reportHandler, { headers: { authorization: "Bearer wrong" } })).status, 401);
  assert.equal(emails.length, 0);
});

test("/api/report sends last week's numbers to the business e-mail", async () => {
  // inside the last 24 h: 3 quotes (2 Guarulhos, 1 São Paulo), 1 confirmation of R$ 1.000 for 4 h
  const yesterday = reportHandler.hourWindow(new Date(), 24)[20];
  await stats.recordQuote({ cep: "07010000", city: "Guarulhos", uf: "SP", roundTripKm: 30, now: yesterday });
  await stats.recordQuote({ cep: "07010001", city: "Guarulhos", uf: "SP", roundTripKm: 30, now: yesterday });
  await stats.recordQuote({ cep: "01001000", city: "São Paulo", uf: "SP", roundTripKm: 90, now: yesterday });
  await stats.recordConfirm({ cep: "07010000", hours: 4, totalBRL: 1000, now: yesterday });

  const result = await call(reportHandler, { headers: { authorization: "Bearer cron-secret-test" } });
  assert.equal(result.status, 200);
  assert.equal(result.body.sent, true);
  assert.equal(emails.length, 1);
  const mail = emails[0].body;
  assert.deepEqual(mail.to, ["paredaoonze@gmail.com"]);
  assert.equal(mail.from, "Paredão 011 <onboarding@resend.dev>", "default sender when RESEND_FROM_EMAIL is not set");
  assert.equal(emails[0].headers.Authorization, "Bearer resend-key-test");
  assert.match(mail.subject, /Relatório diário · 3 orçamentos e 1 confirmado/);
  assert.match(mail.html, /Hora a hora/);
  assert.match(mail.html, /Guarulhos – SP/);
  assert.match(mail.html, /São Paulo – SP/);
  assert.match(mail.html, /33% dos orçamentos/);
  assert.match(mail.html, /R\$\s1\.000,00/);
  assert.match(mail.text, /Orçamentos calculados: 3/);
});

test("dry run returns the HTML without sending", async () => {
  const result = await call(reportHandler, { headers: { authorization: "Bearer cron-secret-test" }, query: { dry: "1", days: "30" } });
  assert.equal(result.status, 200);
  assert.match(result.sent, /Relatório de 30 dias do site/);
  assert.match(result.sent, /Sem dados no período/);
  assert.equal(emails.length, 0);
});

test("city names are escaped in the e-mail", () => {
  const empty = { quotes: 1, confirms: 0, valueBRL: 0, hours: 0, quoteCities: { "SP|<script>x</script>": 1 }, confirmCities: {}, km: {}, perHour: [{ quotes: 1, confirms: 0 }] };
  const prev = { ...empty, quotes: 0, quoteCities: {} };
  const { html } = reportHandler.buildReport(empty, prev, [new Date()]);
  assert.doesNotMatch(html, /<script>x/);
  assert.match(html, /&lt;script&gt;x/);
});

test("the daily window run at 18:xx covers 18:00 yesterday to 18:00 today (São Paulo)", () => {
  // 18:40 in São Paulo = 21:40 UTC
  const hours = reportHandler.hourWindow(new Date("2026-11-22T21:40:00Z"), 24);
  assert.equal(hours.length, 24);
  assert.equal(stats.hourKey(hours[0]), "stats:2026-11-21:18");
  assert.equal(stats.hourKey(hours[23]), "stats:2026-11-22:17");
  // the previous window ends exactly where this one starts: nothing counted twice or lost
  const previous = reportHandler.hourWindow(new Date("2026-11-22T21:40:00Z"), 24, 24);
  assert.equal(stats.hourKey(previous[23]), "stats:2026-11-21:17");
});

test("cron runs every day at 18:00 in São Paulo", () => {
  const vercel = JSON.parse(require("node:fs").readFileSync(require("node:path").join(__dirname, "../vercel.json"), "utf8"));
  assert.deepEqual(vercel.crons, [{ path: "/api/report", schedule: "0 21 * * *" }]); // 21:00 UTC = 18:00 BRT
});
