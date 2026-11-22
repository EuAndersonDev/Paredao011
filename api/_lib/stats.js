// Anonymous usage statistics for the weekly report.
// Only counters are stored, one Redis hash per day (São Paulo time):
//   q                 quotes calculated (successful /api/trip)
//   c                 quotes confirmed (click on "Confirmar Orçamento no WhatsApp")
//   qc:<UF>|<Cidade>  quotes per city        cc:<UF>|<Cidade>  confirmations per city
//   km:<faixa>        quotes per round-trip distance range
//   v                 sum of confirmed estimated values, in cents
//   h                 sum of confirmed event durations, in hundredths of an hour
// Plus a short-lived key cep:<cep> -> "<UF>|<Cidade>" (2 days) so a confirmation can be tied
// to the city looked up by /api/trip. No name, address or full CEP is kept in the counters.
const redis = require("./redis.js");

const DAY_TTL_SECONDS = 400 * 24 * 60 * 60; // keep ~13 months of daily counters
const CEP_TTL_SECONDS = 2 * 24 * 60 * 60;
const KM_BUCKETS = [[20, "até 20 km"], [50, "20–50 km"], [100, "50–100 km"], [Infinity, "mais de 100 km"]];

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

function dayKey(date = new Date()) {
  return `stats:${dayFormatter.format(date)}`;
}

function kmBucket(km) {
  return KM_BUCKETS.find(([limit]) => km <= limit)[1];
}

function cleanPlace(city, uf) {
  const c = String(city || "").replace(/[|\r\n]/g, " ").trim().slice(0, 60);
  const u = String(uf || "").replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 2);
  return c && u ? `${u}|${c}` : "??|Não identificada";
}

// Never throws: statistics must not break the simulator.
async function safe(commands) {
  try {
    return await redis.pipeline(commands);
  } catch {
    return null;
  }
}

function recordQuote({ cep, city, uf, roundTripKm, now = new Date() }) {
  const key = dayKey(now);
  const place = cleanPlace(city, uf);
  return safe([
    ["HINCRBY", key, "q", 1],
    ["HINCRBY", key, `qc:${place}`, 1],
    ["HINCRBY", key, `km:${kmBucket(roundTripKm)}`, 1],
    ["EXPIRE", key, DAY_TTL_SECONDS],
    ["SET", `cep:${cep}`, place, "EX", CEP_TTL_SECONDS]
  ]);
}

// Returns false when the CEP was never quoted recently (ignored: protects the numbers).
async function recordConfirm({ cep, hours, totalBRL, now = new Date() }) {
  const found = await safe([["GET", `cep:${cep}`]]);
  const place = found && found[0];
  if (!place) return false;
  const key = dayKey(now);
  await safe([
    ["HINCRBY", key, "c", 1],
    ["HINCRBY", key, `cc:${place}`, 1],
    ["HINCRBY", key, "v", Math.round(totalBRL * 100)],
    ["HINCRBY", key, "h", Math.round(hours * 100)],
    ["EXPIRE", key, DAY_TTL_SECONDS]
  ]);
  return true;
}

// Aggregates the daily hashes for the given dates.
async function readDays(dates) {
  const keys = dates.map((d) => dayKey(d));
  const rows = (await redis.pipeline(keys.map((k) => ["HGETALL", k]))) || keys.map(() => []);
  const total = { quotes: 0, confirms: 0, valueBRL: 0, hours: 0, quoteCities: {}, confirmCities: {}, km: {}, perDay: [] };

  rows.forEach((row, i) => {
    const fields = {};
    const list = Array.isArray(row) ? row : [];
    for (let j = 0; j + 1 < list.length; j += 2) fields[list[j]] = Number(list[j + 1]) || 0;
    const quotes = fields.q || 0;
    const confirms = fields.c || 0;
    total.quotes += quotes;
    total.confirms += confirms;
    total.valueBRL += (fields.v || 0) / 100;
    total.hours += (fields.h || 0) / 100;
    total.perDay.push({ day: keys[i].slice(6), quotes, confirms });
    for (const [field, value] of Object.entries(fields)) {
      const bucket = field.startsWith("qc:") ? total.quoteCities : field.startsWith("cc:") ? total.confirmCities : field.startsWith("km:") ? total.km : null;
      if (bucket) {
        const name = field.slice(3);
        bucket[name] = (bucket[name] || 0) + value;
      }
    }
  });
  return total;
}

module.exports = { recordQuote, recordConfirm, readDays, dayKey, kmBucket, cleanPlace, isConfigured: redis.isConfigured };
