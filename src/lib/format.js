// Formatting and parsing helpers (pure). Works as a browser script and as a Node module.
(function (root) {
    "use strict";

    const currencyFormatter = new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL"
    });
    const hourFormatter = new Intl.NumberFormat("pt-BR", {
        maximumFractionDigits: 2
    });

    function currency(value) {
        return currencyFormatter.format(value);
    }

    function hours(value) {
        return hourFormatter.format(value);
    }

    // "2027-03-20" -> "20/03/2027"
    function dateForMessage(dateValue) {
        const [year, month, day] = dateValue.split("-");
        return `${day.padStart(2, "0")}/${month.padStart(2, "0")}/${year.padStart(4, "0")}`;
    }

    // "12,50" | "12.5" | "12" -> number; anything else -> null
    function parseMoneyInput(text) {
        const value = String(text).trim();
        if (!/^\d+(?:[,.]\d{1,2})?$/.test(value)) return null;
        const amount = Number(value.replace(",", "."));
        return Number.isFinite(amount) && amount >= 0 ? amount : null;
    }

    const api = { currency, hours, dateForMessage, parseMoneyInput };
    if (typeof module === "object" && module.exports) module.exports = api;
    else (root.Paredao = root.Paredao || {}).format = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
