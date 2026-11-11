// Characterization tests: the refactored pure functions must reproduce, to the cent and to the
// character, what the original simulator UI produced (tests/fixtures/golden-quotes.json).
const test = require("node:test");
const assert = require("node:assert/strict");

const CONFIG = require("../src/config.js");
const format = require("../src/lib/format.js");
const datetime = require("../src/lib/datetime.js");
const pricing = require("../src/lib/pricing.js");
const whatsapp = require("../src/lib/whatsapp.js");
const golden = require("./fixtures/golden-quotes.json");

// Mirrors the simulator flow (src/simulator/simulator.js) without the DOM.
function quoteFor(scenario) {
    const start = datetime.wallTimeToTimestamp(scenario.start.date, scenario.start.time);
    const end = datetime.wallTimeToTimestamp(scenario.end.date, scenario.end.time, true);
    if (end.timestamp <= start.timestamp) return { error: "O fim do evento deve ser posterior ao início." };

    const hours = datetime.durationHours(start, end);
    const tollsBRL = scenario.trip.tollsStatus === "unknown"
        ? pricing.manualTollsBRL(format.parseMoneyInput(scenario.manualToll), CONFIG)
        : scenario.trip.tollsBRL;
    const quote = { ...golden.form, start, end, hours };
    const price = pricing.calculatePrice({ hours, outboundKm: scenario.trip.outboundKm, returnKm: scenario.trip.returnKm, tollsBRL }, CONFIG);
    const href = whatsapp.buildLink(CONFIG.WHATSAPP_PHONE, whatsapp.buildMessageLines(quote, price, CONFIG));
    return { price, hoursText: `${format.hours(hours)} horas`, totalText: format.currency(price.totalBRL), href };
}

for (const scenario of golden.scenarios) {
    // Typing the manual toll key by key hits a known UI bug (docs/AUDIT.md); the pure
    // functions are only checked for the pasted ("fill") case.
    if (scenario.manualTollEntry === "type") continue;

    test(`golden: ${scenario.id}`, () => {
        const result = quoteFor(scenario);
        if (scenario.expected.whatsappHref === null) {
            assert.equal(result.error, scenario.expected.status);
            return;
        }
        assert.equal(result.totalText, scenario.expected.total);
        assert.equal(result.hoursText, scenario.expected.hours);
        assert.equal(result.href, scenario.expected.whatsappHref);
    });
}

test("breakdown adds up: labor + fuel + tolls, 40% deposit, balance", () => {
    const price = pricing.calculatePrice({ hours: 5, outboundKm: 30, returnKm: 30, tollsBRL: 20 }, CONFIG);
    assert.equal(price.laborBRL, 5 * CONFIG.HOURLY_RATE_BRL);
    assert.equal(price.fuelBRL, (60 / CONFIG.CAR_KM_PER_LITER) * CONFIG.GASOLINE_PRICE_BRL_PER_LITER);
    assert.equal(price.totalBRL, price.laborBRL + price.fuelBRL + 20);
    assert.equal(price.depositBRL, price.totalBRL * CONFIG.RESERVATION_DEPOSIT_PERCENT / 100);
    assert.equal(price.balanceBRL, price.totalBRL - price.depositBRL);
});

test("zero tolls add nothing", () => {
    const withTolls = pricing.calculatePrice({ hours: 4, outboundKm: 10, returnKm: 10, tollsBRL: 0 }, CONFIG);
    assert.equal(withTolls.totalBRL, withTolls.laborBRL + withTolls.fuelBRL);
});

test("manual toll counts the car and the trailer", () => {
    assert.equal(pricing.manualTollsBRL(12.5, CONFIG), 12.5 * CONFIG.TOLL_VEHICLE_MULTIPLIER);
});

test("pricing is pure: same input, same output, input untouched", () => {
    const input = Object.freeze({ hours: 3, outboundKm: 12, returnKm: 13, tollsBRL: 7 });
    assert.deepEqual(pricing.calculatePrice(input, CONFIG), pricing.calculatePrice(input, CONFIG));
});
