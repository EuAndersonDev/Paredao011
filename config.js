const CONFIG = Object.freeze({
    ORIGIN_CEP: "08260280",
    HOURLY_RATE_BRL: 160,
    EXTRA_HOUR_RATE_BRL: 160,
    CAR_KM_PER_LITER: 6,
    GASOLINE_PRICE_BRL_PER_LITER: 7,
    TOLL_VEHICLE_MULTIPLIER: 2,
    RESERVATION_DEPOSIT_PERCENT: 40,
    COOLDOWN_SECONDS: 60,
    WHATSAPP_PHONE: "5511983569830"
});

if (typeof module !== "undefined" && module.exports) {
    module.exports = CONFIG;
}