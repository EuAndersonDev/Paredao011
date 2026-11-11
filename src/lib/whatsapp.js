// WhatsApp quote message and link (pure). Every line is URL-encoded with encodeURIComponent.
(function (root) {
    "use strict";

    const format = typeof module === "object" && module.exports ?
        require("./format.js") :
        root.Paredao.format;

    // quote: { venueName, eventAddress, cep, start: {date, time}, end: {time} }
    // price: result of pricing.calculatePrice
    function buildMessageLines(quote, price, config) {
        return [
            " @Paredão_011 – Orçamento",
            "",
            ` - Nome do responsavel: ${quote.venueName}`,
            ` - Endereço: ${quote.eventAddress}`,
            ` - CEP: ${quote.cep}`,
            ` - Data: ${format.dateForMessage(quote.start.date)}`,
            ` - Horário: ${quote.start.time} às ${quote.end.time} — ${format.hours(price.hours)} horas`,
            "",
            ` - Valor: ${format.currency(price.totalBRL)}`,
            "",
            "Incluso:",
            "• Estrutura de som profissional",
            "• Montagem e desmontagem",
            "• Deslocamento",
            "• Acompanhamento durante o evento",
            "",
            ` - Reserva mediante sinal de ${config.RESERVATION_DEPOSIT_PERCENT}%: ${format.currency(price.depositBRL)}`,
            ` - Saldo no dia: ${format.currency(price.balanceBRL)}`,
            ""
        ];
    }

    function buildLink(phone, lines) {
        const text = lines.map((line) => encodeURIComponent(line)).join("%0A");
        return `https://wa.me/${encodeURIComponent(phone)}?text=${text}`;
    }

    const api = { buildMessageLines, buildLink };
    if (typeof module === "object" && module.exports) module.exports = api;
    else (root.Paredao = root.Paredao || {}).whatsapp = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
