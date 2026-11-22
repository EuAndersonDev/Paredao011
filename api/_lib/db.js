// Postgres (Neon) access for the statistics. Uses the DATABASE_URL created by the Neon
// integration on Vercel. When it is not set, isConfigured() is false and nothing is recorded.
// Tables are created automatically on first use (see db/schema.sql for the same SQL).
const { neon } = require("@neondatabase/serverless");

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS site_events (
     id bigserial PRIMARY KEY,
     created_at timestamptz NOT NULL DEFAULT now(),
     kind text NOT NULL CHECK (kind IN ('quote', 'confirm')),
     uf text,
     city text,
     round_trip_km numeric(8, 1),
     hours numeric(6, 2),
     total_brl numeric(12, 2)
   )`,
  "CREATE INDEX IF NOT EXISTS site_events_created_at_idx ON site_events (created_at)",
  `CREATE TABLE IF NOT EXISTS recent_quote_ceps (
     cep text PRIMARY KEY,
     uf text,
     city text,
     seen_at timestamptz NOT NULL DEFAULT now()
   )`
];

let runner = null;      // (text, params) => rows
let schemaReady = null; // Promise, once per instance

function connectionString() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
}

function isConfigured() {
  return Boolean(runner || connectionString());
}

function getRunner() {
  if (!runner) {
    const sql = neon(connectionString());
    runner = (text, params) => sql.query(text, params);
  }
  return runner;
}

async function query(text, params = []) {
  const run = getRunner();
  if (!schemaReady) {
    schemaReady = (async () => {
      for (const statement of SCHEMA) await run(statement, []);
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
  return run(text, params);
}

// Tests: plug another Postgres (PGlite) in place of Neon.
function _setRunner(fn) {
  runner = fn;
  schemaReady = null;
}

module.exports = { query, isConfigured, SCHEMA, _setRunner };
