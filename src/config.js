// Paredão 011 — the ONLY place for prices, fees, contact data and the site URL.
// Used by the browser (simulator), the Vercel Function (api/trip.js), the build and the tests.
// Values still written as {{PLACEHOLDER}} are treated as "not provided" by the build.
(function (root) {
    "use strict";

    var CONFIG = {
        // ===================== EDIT PRICES HERE =====================
        HOURLY_RATE_BRL: 190,               // valor por hora de evento (R$)
        CAR_KM_PER_LITER: 6,                // consumo do carro com a carretinha (km/l)
        GASOLINE_PRICE_BRL_PER_LITER: 7,    // preço da gasolina (R$/l)
        TOLL_VEHICLE_MULTIPLIER: 2,         // pedágio do carro x2 (carro + carretinha)
        RESERVATION_DEPOSIT_PERCENT: 40,    // sinal para reservar (%)
        // ============================================================

        // Ponto de partida das rotas (CEP da base). Usado só pela função /api/trip.
        ORIGIN_CEP: "08260280",

        // Contato. WhatsApp no formato internacional, só dígitos (55 + DDD + número).
        WHATSAPP_PHONE: "5511983569830",
        INSTAGRAM_URL: "https://www.instagram.com/paredao_011/",

        // Simulador: espera após "muitas tentativas" (HTTP 429), em segundos.
        COOLDOWN_SECONDS: 60,

        // Site e SEO. SITE_URL: endereço público, sem barra no final.
        SITE_URL: "https://paredao011.vercel.app",
        BUSINESS: {
            name: "Paredão 011",
            description: "Aluguel de paredão de som: locação de estrutura completa de som automotivo para festas e eventos na Grande São Paulo.",
            googleBusinessUrl: "{{GOOGLE_BUSINESS_URL}}",
            priceRange: "{{PRICE_RANGE}}",
            openingHours: "{{HOURS}}",            // formato schema.org, ex.: "Mo-Su 10:00-23:00"
            openingHoursLabel: "{{HOURS_LABEL}}", // texto visível, ex.: "Seg a dom, 10h às 23h"
            cities: ["{{CITY_LIST}}"],            // ex.: ["São Paulo", "Guarulhos"]
            googleSiteVerification: "{{GOOGLE_SITE_VERIFICATION}}"
        }
    };

    Object.freeze(CONFIG.BUSINESS.cities);
    Object.freeze(CONFIG.BUSINESS);
    Object.freeze(CONFIG);

    if (typeof module === "object" && module.exports) module.exports = CONFIG;
    else (root.Paredao = root.Paredao || {}).config = CONFIG;
})(typeof globalThis !== "undefined" ? globalThis : this);
