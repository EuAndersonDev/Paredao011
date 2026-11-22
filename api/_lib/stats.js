// Anonymous usage statistics for the daily report, stored in Postgres (Neon).
// site_events: one row per quote (successful /api/trip) and per confirmation (click on
//   "Confirmar Orçamento no WhatsApp"), with city/UF, round-trip km, duration and value.
// recent_quote_ceps: CEP -> city for 2 days, so a confirmation can be tied to its city.
// No name, address, street or neighbourhood is stored.
// Recording never throws and gives up after a short timeout: the simulator must not depend on it.
const db = require("./db.js");

const RECORD_TIMEOUT_MS = 2500;
const CEP_TTL = "2 days";
const KEEP_EVENTS = "400 days";
const KM_BUCKETS = [[20, "até 20 km"], [50, "20–50 km"], [100, "50–100 km"], [Infinity, "mais de 100 km"]];

function kmBucket(km) {
  return KM_BUCKETS.find(([limit]) => km <= limit)[1];
}

// Same buckets in SQL, built from KM_BUCKETS so there is a single definition.
const KM_BUCKET_SQL = `CASE ${KM_BUCKETS.filter(([l]) => l !== Infinity).map(([l, name]) => `WHEN round_trip_km <= ${l} THEN '${name}'`).join(" ")} ELSE '${KM_BUCKETS[KM_BUCKETS.length - 1][1]}' END`;

function cleanPlace(city, uf) {
  const c = String(city || "").replace(/[\r\n]/g, " ").trim().slice(0, 60);
  const u = String(uf || "").replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 2);
  return c && u ? { city: c, uf: u } : { city: "Não identificada", uf: "??" };
}

function withTimeout(promise) {
  let timer;
  const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve(null), RECORD_TIMEOUT_MS); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function safe(fn) {
  if (!db.isConfigured()) return null;
  try {
    return await withTimeout(fn());
  } catch {
    return null;
  }
}

function recordQuote({ cep, city, uf, roundTripKm, now = new Date() }) {
  const place = cleanPlace(city, uf);
  return safe(async () => {
    await db.query(
      "INSERT INTO site_events (created_at, kind, uf, city, round_trip_km) VALUES ($1, 'quote', $2, $3, $4)",
      [now.toISOString(), place.uf, place.city, Math.round(roundTripKm * 10) / 10]
    );
    await db.query(
      `INSERT INTO recent_quote_ceps (cep, uf, city, seen_at) VALUES ($1, $2, $3, $4)
       ON CONFLICT (cep) DO UPDATE SET uf = EXCLUDED.uf, city = EXCLUDED.city, seen_at = EXCLUDED.seen_at`,
      [cep, place.uf, place.city, now.toISOString()]
    );
    return true;
  });
}

// Returns true when recorded; false when the CEP was not quoted in the last 2 days (ignored,
// so made-up requests can't inflate the numbers) or when the database is unavailable.
async function recordConfirm({ cep, hours, totalBRL, now = new Date() }) {
  const result = await safe(async () => {
    const rows = await db.query(
      `SELECT uf, city FROM recent_quote_ceps WHERE cep = $1 AND seen_at > $2::timestamptz - interval '${CEP_TTL}'`,
      [cep, now.toISOString()]
    );
    if (!rows.length) return false;
    await db.query(
      "INSERT INTO site_events (created_at, kind, uf, city, hours, total_brl) VALUES ($1, 'confirm', $2, $3, $4, $5)",
      [now.toISOString(), rows[0].uf, rows[0].city, Math.round(hours * 100) / 100, Math.round(totalBRL * 100) / 100]
    );
    return true;
  });
  return result === true;
}

// Aggregates the window [hours[0], hours[last] + 1 h). Same shape as the report expects:
// totals, cities as "UF|Cidade" -> count, km ranges, and perHour aligned with `hours`.
async function readHours(hours) {
  const start = hours[0].toISOString();
  const end = new Date(hours[hours.length - 1].getTime() + 3600000).toISOString();
  const range = "created_at >= $1 AND created_at < $2";

  const [totals] = await db.query(
    `SELECT count(*) FILTER (WHERE kind = 'quote') AS quotes,
            count(*) FILTER (WHERE kind = 'confirm') AS confirms,
            coalesce(sum(total_brl) FILTER (WHERE kind = 'confirm'), 0) AS value,
            coalesce(sum(hours) FILTER (WHERE kind = 'confirm'), 0) AS hours
       FROM site_events WHERE ${range}`, [start, end]);
  const cities = await db.query(
    `SELECT kind, uf, city, count(*) AS n FROM site_events WHERE ${range} GROUP BY kind, uf, city`, [start, end]);
  const km = await db.query(
    `SELECT ${KM_BUCKET_SQL} AS bucket, count(*) AS n FROM site_events WHERE ${range} AND kind = 'quote' GROUP BY 1`, [start, end]);
  const perHour = await db.query(
    `SELECT floor(extract(epoch FROM created_at) / 3600) AS h,
            count(*) FILTER (WHERE kind = 'quote') AS quotes,
            count(*) FILTER (WHERE kind = 'confirm') AS confirms
       FROM site_events WHERE ${range} GROUP BY 1`, [start, end]);

  const total = {
    quotes: Number(totals.quotes),
    confirms: Number(totals.confirms),
    valueBRL: Number(totals.value),
    hours: Number(totals.hours),
    quoteCities: {},
    confirmCities: {},
    km: {},
    perHour: []
  };
  for (const row of cities) {
    const bucket = row.kind === "quote" ? total.quoteCities : total.confirmCities;
    bucket[`${row.uf}|${row.city}`] = Number(row.n);
  }
  for (const row of km) total.km[row.bucket] = Number(row.n);
  const byHour = new Map(perHour.map((row) => [Number(row.h), row]));
  for (const hour of hours) {
    const row = byHour.get(Math.floor(hour.getTime() / 3600000));
    total.perHour.push({ quotes: row ? Number(row.quotes) : 0, confirms: row ? Number(row.confirms) : 0 });
  }
  return total;
}

// Housekeeping, run with the daily report: forget CEPs after 2 days, events after ~13 months.
async function cleanup(now = new Date()) {
  await db.query(`DELETE FROM recent_quote_ceps WHERE seen_at < $1::timestamptz - interval '${CEP_TTL}'`, [now.toISOString()]);
  await db.query(`DELETE FROM site_events WHERE created_at < $1::timestamptz - interval '${KEEP_EVENTS}'`, [now.toISOString()]);
}

module.exports = { recordQuote, recordConfirm, readHours, cleanup, kmBucket, cleanPlace, isConfigured: db.isConfigured };
