// Regenerates tests/fixtures/golden-quotes.json after an INTENTIONAL price change in src/config.js.
// Usage: npm run test:update   (then review the diff and commit it)
// The scenarios and inputs stay the same; only the expected totals and WhatsApp links are recomputed.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const CONFIG = require(join(ROOT, "src/config.js"));
const format = require(join(ROOT, "src/lib/format.js"));
const datetime = require(join(ROOT, "src/lib/datetime.js"));
const pricing = require(join(ROOT, "src/lib/pricing.js"));
const whatsapp = require(join(ROOT, "src/lib/whatsapp.js"));

const file = join(ROOT, "tests/fixtures/golden-quotes.json");
const golden = JSON.parse(readFileSync(file, "utf8"));

for (const s of golden.scenarios) {
  const start = datetime.wallTimeToTimestamp(s.start.date, s.start.time);
  const end = datetime.wallTimeToTimestamp(s.end.date, s.end.time, true);
  if (end.timestamp <= start.timestamp) continue; // error scenario: nothing price-related to update

  // Known UI bug (docs/AUDIT.md): typing the manual toll key by key keeps only the first digit.
  const typed = s.manualTollEntry === "type" ? s.manualToll.slice(0, 1) : s.manualToll;
  const tollsBRL = s.trip.tollsStatus === "unknown"
    ? pricing.manualTollsBRL(format.parseMoneyInput(typed), CONFIG)
    : s.trip.tollsBRL;
  const hours = datetime.durationHours(start, end);
  const price = pricing.calculatePrice({ hours, outboundKm: s.trip.outboundKm, returnKm: s.trip.returnKm, tollsBRL }, CONFIG);
  const lines = whatsapp.buildMessageLines({ ...golden.form, start, end }, price, CONFIG);

  s.expected.total = format.currency(price.totalBRL);
  s.expected.hours = `${format.hours(hours)} horas`;
  s.expected.whatsappHref = whatsapp.buildLink(CONFIG.WHATSAPP_PHONE, lines);
}

golden._about = `Locks the simulator output for HOURLY_RATE_BRL=${CONFIG.HOURLY_RATE_BRL}. Originally recorded from the real UI; after an intentional price change regenerate with "npm run test:update" and review the diff.`;
writeFileSync(file, JSON.stringify(golden, null, 2) + "\n");
console.log(`Updated ${golden.scenarios.length} scenarios for HOURLY_RATE_BRL=${CONFIG.HOURLY_RATE_BRL}.`);
for (const s of golden.scenarios) console.log(`  ${s.id.padEnd(16)} ${s.expected.total}`);
