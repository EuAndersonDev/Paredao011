// Minimal Upstash Redis client over its REST API (no dependencies).
// Configured by the Vercel Marketplace integration "Upstash for Redis", which adds
// KV_REST_API_URL / KV_REST_API_TOKEN (older setups: UPSTASH_REDIS_REST_URL / _TOKEN).
// When it is not configured, every call resolves to null and the site keeps working.
const TIMEOUT_MS = 1500;

function credentials() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/+$/, ""), token } : null;
}

function isConfigured() {
  return credentials() !== null;
}

// commands: [["HINCRBY", "key", "field", 1], ...] -> array of results (or null if unavailable)
async function pipeline(commands) {
  const creds = credentials();
  if (!creds || !commands.length) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${creds.url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${creds.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(commands),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`REDIS_HTTP_${response.status}`);
    const data = await response.json();
    return data.map((item) => (item && "result" in item ? item.result : null));
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { pipeline, isConfigured };
