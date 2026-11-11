const test = require("node:test");
const assert = require("node:assert/strict");
const CONFIG = require("../src/config.js");
const format = require("../src/lib/format.js");
const whatsapp = require("../src/lib/whatsapp.js");

const price = { hours: 5, totalBRL: 1000, depositBRL: 400, balanceBRL: 600 };
const quote = (venueName) => ({
    venueName,
    eventAddress: "Rua Exemplo, 100 & fundos",
    cep: "01001000",
    start: { date: "2027-03-20", time: "20:00" },
    end: { time: "01:00" }
});

test("every part of the message is URL-encoded", () => {
    const lines = whatsapp.buildMessageLines(quote("Ana #1 ?x=1&y=2 / <b>"), price, CONFIG);
    const href = whatsapp.buildLink(CONFIG.WHATSAPP_PHONE, lines);
    const [base, text] = href.split("?text=");
    assert.equal(base, `https://wa.me/${CONFIG.WHATSAPP_PHONE}`);
    assert.doesNotMatch(text, /[\s#&?<>/]/);
    assert.equal(decodeURIComponent(text), lines.join("\n"));
    assert.equal(text, encodeURIComponent(lines.join("\n")));
});

test("message keeps the original format", () => {
    const lines = whatsapp.buildMessageLines(quote("Cliente Teste"), price, CONFIG);
    assert.equal(lines[0], " @Paredão_011 – Orçamento");
    assert.equal(lines[2], " - Nome do responsavel: Cliente Teste");
    assert.equal(lines[5], " - Data: 20/03/2027");
    assert.equal(lines[6], " - Horário: 20:00 às 01:00 — 5 horas");
    assert.equal(lines[8], ` - Valor: ${format.currency(1000)}`);
    assert.equal(lines[16], ` - Reserva mediante sinal de 40%: ${format.currency(400)}`);
    assert.equal(lines[17], ` - Saldo no dia: ${format.currency(600)}`);
    assert.equal(lines.length, 19);
});

test("money input parsing", () => {
    assert.equal(format.parseMoneyInput("12,50"), 12.5);
    assert.equal(format.parseMoneyInput(" 7 "), 7);
    assert.equal(format.parseMoneyInput("1.234,56"), null);
    assert.equal(format.parseMoneyInput("-3"), null);
    assert.equal(format.parseMoneyInput("abc"), null);
});
