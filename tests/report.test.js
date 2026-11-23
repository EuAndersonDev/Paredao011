// Tests for the anonymous statistics (api/_lib/stats.js), /api/event and /api/report.
// The SQL runs on a real embedded Postgres (PGlite) in place of Neon, and e-mails go through
// Nodemailer's JSON transport (no SMTP server). No network.
const test = require("node:test");
const assert = require("node:assert/strict");
const nodemailer = require("nodemailer");

process.env.CRON_SECRET = "cron-secret-test";
process.env.SMTP_USER = "paredaoonze@gmail.com";
process.env.SMTP_PASS = "app-password-test";
process.env.GOOGLE_MAPS_API_KEY = "maps-key-test";

const db = require("../api/_lib/db.js");
const mailer = require("../api/_lib/mailer.js");
const stats = require("../api/_lib/stats.js");
const eventHandler = require("../api/event.js");
const reportHandler = require("../api/report.js");
const tripHandler = require("../api/trip.js");

let pg;
let emails = [];

test.before(async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  pg = new PGlite();
  db._setRunner(async (text, params) => (await pg.query(text, params)).rows);
  const json = nodemailer.createTransport({ jsonTransport: true });
  mailer._setTransport({
    sendMail: async (options) => {
      const info = await json.sendMail(options);
      emails.push(JSON.parse(info.message));
      return info;
    }
  });
});

test.after(async () => { await pg.close(); });

test.beforeEach(async () => {
  emails = [];
  await db.query("SELECT 1"); // creates the tables on first use
  await pg.query("TRUNCATE site_events, recent_quote_ceps");
});

global.fetch = async (url) => {
  url = String(url);
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

const rows = async (sql) => (await pg.query(sql)).rows;

test("a quote is stored as an anonymous row with city and distance; response unchanged", async () => {
  const result = await call(tripHandler, { method: "POST", body: { cep: "07010000" } });
  assert.equal(result.status, 200);
  assert.deepEqual(Object.keys(result.body).sort(), ["outboundKm", "returnKm", "tollsBRL", "tollsStatus"]);
  const events = await rows("SELECT kind, uf, city, round_trip_km FROM site_events");
  assert.deepEqual(events.map((e) => [e.kind, e.uf, e.city, Number(e.round_trip_km)]), [["quote", "SP", "Guarulhos", 60]]);
  const everything = JSON.stringify([await rows("SELECT * FROM site_events"), await rows("SELECT * FROM recent_quote_ceps")]);
  assert.doesNotMatch(everything, /Rua Exemplo|Centro/, "no street or neighbourhood is stored");
});

test("confirmation: stored only for a CEP quoted in the last 2 days, with value and duration", async () => {
  await call(tripHandler, { method: "POST", body: { cep: "07020000" } });
  const ok = await call(eventHandler, { method: "POST", body: { type: "confirm", cep: "07020-000", hours: 5, totalBRL: 1174.6 } });
  assert.equal(ok.status, 204);
  const [row] = await rows("SELECT uf, city, hours, total_brl FROM site_events WHERE kind = 'confirm'");
  assert.deepEqual([row.uf, row.city, Number(row.hours), Number(row.total_brl)], ["SP", "Guarulhos", 5, 1174.6]);

  const unknown = await call(eventHandler, { method: "POST", body: { type: "confirm", cep: "99999999", hours: 5, totalBRL: 100 } });
  assert.equal(unknown.status, 202, "ignored: never quoted");

  // a quote older than 2 days no longer allows a confirmation
  await stats.recordQuote({ cep: "08000000", city: "Suzano", uf: "SP", roundTripKm: 10, now: new Date(Date.now() - 3 * 86400000) });
  assert.equal(await stats.recordConfirm({ cep: "08000000", hours: 4, totalBRL: 500 }), false);
  assert.equal((await rows("SELECT count(*)::int AS n FROM site_events WHERE kind = 'confirm'"))[0].n, 1);
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

test("/api/report e-mails the last 24 hours to the business address via SMTP", async () => {
  const inWindow = reportHandler.hourWindow(new Date(), 24)[20];
  const before = reportHandler.hourWindow(new Date(), 24, 24)[5]; // previous 24 h: compared, not counted
  await stats.recordQuote({ cep: "07010000", city: "Guarulhos", uf: "SP", roundTripKm: 30, now: inWindow });
  await stats.recordQuote({ cep: "07010001", city: "Guarulhos", uf: "SP", roundTripKm: 30, now: inWindow });
  await stats.recordQuote({ cep: "01001000", city: "São Paulo", uf: "SP", roundTripKm: 90, now: inWindow });
  await stats.recordConfirm({ cep: "07010000", hours: 4, totalBRL: 1000, now: inWindow });
  await stats.recordQuote({ cep: "06000000", city: "Osasco", uf: "SP", roundTripKm: 40, now: before });

  const result = await call(reportHandler, { headers: { authorization: "Bearer cron-secret-test" } });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.sent, true);
  assert.equal(emails.length, 1);
  const mail = emails[0];
  assert.deepEqual(mail.to.map((t) => t.address), ["paredaoonze@gmail.com"]);
  assert.equal(mail.from.address, "paredaoonze@gmail.com", "sent from the Gmail account itself");
  assert.match(mail.subject, /Relatório diário · 3 orçamentos e 1 confirmado/);
  assert.match(mail.html, /Guarulhos – SP/);
  assert.match(mail.html, /São Paulo – SP/);
  assert.doesNotMatch(mail.html, /Osasco/, "previous day is not in this report");
  assert.match(mail.html, /\+200% vs período anterior/);
  assert.match(mail.html, /33% dos orçamentos/);
  assert.match(mail.html, /R\$\s1\.000,00/);
  assert.match(mail.html, /50–100 km/);
  assert.match(mail.html, /Hora a hora/);
  assert.match(mail.text, /Orçamentos calculados: 3/);
});

test("dry run returns the HTML without sending; longer periods group by day", async () => {
  const result = await call(reportHandler, { headers: { authorization: "Bearer cron-secret-test" }, query: { dry: "1", days: "30" } });
  assert.equal(result.status, 200);
  assert.match(result.sent, /Relatório de 30 dias do site/);
  assert.match(result.sent, /Sem dados no período/);
  assert.equal(emails.length, 0);
});

test("cleanup forgets CEPs after 2 days and keeps recent events", async () => {
  await stats.recordQuote({ cep: "08000000", city: "Suzano", uf: "SP", roundTripKm: 10, now: new Date(Date.now() - 3 * 86400000) });
  await stats.recordQuote({ cep: "08000001", city: "Suzano", uf: "SP", roundTripKm: 10 });
  await stats.cleanup();
  assert.deepEqual((await rows("SELECT cep FROM recent_quote_ceps")).map((r) => r.cep), ["08000001"]);
  assert.equal((await rows("SELECT count(*)::int AS n FROM site_events"))[0].n, 2);
});

test("city names are escaped in the e-mail", () => {
  const data = { quotes: 1, confirms: 0, valueBRL: 0, hours: 0, quoteCities: { "SP|<script>x</script>": 1 }, confirmCities: {}, km: {}, perHour: [{ quotes: 1, confirms: 0 }] };
  const { html } = reportHandler.buildReport(data, { ...data, quotes: 0, quoteCities: {} }, [new Date()]);
  assert.doesNotMatch(html, /<script>x/);
  assert.match(html, /&lt;script&gt;x/);
});

test("the daily window run at 18:xx covers 18:00 yesterday to 18:00 today (São Paulo)", () => {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" });
  const hours = reportHandler.hourWindow(new Date("2026-11-22T21:40:00Z"), 24); // 18:40 in São Paulo
  assert.equal(hours.length, 24);
  assert.equal(fmt.format(hours[0]), "2026-11-21, 18");
  assert.equal(fmt.format(hours[23]), "2026-11-22, 17");
  const previous = reportHandler.hourWindow(new Date("2026-11-22T21:40:00Z"), 24, 24);
  assert.equal(previous[23].getTime() + 3600000, hours[0].getTime(), "windows touch: nothing counted twice or lost");
});

test("cron runs every day at 18:00 in São Paulo", () => {
  const vercel = JSON.parse(require("node:fs").readFileSync(require("node:path").join(__dirname, "../vercel.json"), "utf8"));
  assert.deepEqual(vercel.crons, [{ path: "/api/report", schedule: "0 21 * * *" }]); // 21:00 UTC = 18:00 BRT
});

test("SMTP password: spaces and line breaks from copy/paste are removed", () => {
  assert.equal(mailer.cleanPassword("abcd efgh ijkl mnop\n"), "abcdefghijklmnop");
  assert.equal(mailer.cleanPassword(" a b c d "), "abcd");
  assert.equal(mailer.cleanPassword(undefined), "");
});
