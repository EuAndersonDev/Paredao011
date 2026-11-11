// Price calculation (pure). Prices and fees come from src/config.js.
(function (root) {
    "use strict";

    // input: { hours, outboundKm, returnKm, tollsBRL }
    //   hours      event duration in hours
    //   outboundKm route distance base -> event; returnKm event -> base
    //   tollsBRL   tolls for the round trip, already including the trailer
    // Returns the full breakdown. The order of the operations is kept exactly as in the
    // original simulator so results are identical to the cent.
    function calculatePrice(input, config) {
        const laborBRL = input.hours * config.HOURLY_RATE_BRL;
        const roundTripKm = input.outboundKm + input.returnKm;
        const fuelBRL = (roundTripKm / config.CAR_KM_PER_LITER) *
            config.GASOLINE_PRICE_BRL_PER_LITER;
        const tollsBRL = input.tollsBRL;
        const totalBRL = laborBRL + fuelBRL + tollsBRL;
        const depositBRL = totalBRL * config.RESERVATION_DEPOSIT_PERCENT / 100;
        const balanceBRL = totalBRL - depositBRL;

        return {
            hours: input.hours,
            roundTripKm,
            laborBRL,
            fuelBRL,
            tollsBRL,
            totalBRL,
            depositBRL,
            balanceBRL
        };
    }

    // The customer types the car toll (round trip); the trailer pays the same again.
    function manualTollsBRL(carRoundTripBRL, config) {
        return carRoundTripBRL * config.TOLL_VEHICLE_MULTIPLIER;
    }

    const api = { calculatePrice, manualTollsBRL };
    if (typeof module === "object" && module.exports) module.exports = api;
    else (root.Paredao = root.Paredao || {}).pricing = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
