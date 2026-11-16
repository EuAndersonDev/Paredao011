// Tests for the simulator flow (form + result view + controller) with a minimal fake DOM,
// so validations, error placement, the manual toll and the WhatsApp button are covered in CI.
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const FILES = ["config.js", "lib/format.js", "lib/datetime.js", "lib/pricing.js", "lib/whatsapp.js",
    "simulator/result-view.js", "simulator/form.js", "simulator/simulator.js"];
const IDS = ["sim-form", "dest-cep", "event-venue", "event-address", "event-start", "event-start-time", "event-end",
    "event-end-time", "manual-toll", "btn-calcular", "status", "result", "res-endereco", "res-horas", "res-total",
    "btn-whats", "manual-toll-group", "manual-toll-status"];

class FakeElement {
    constructor(doc, id) {
        this.doc = doc; this.id = id || ""; this.value = ""; this.textContent = ""; this.className = "";
        this.hidden = false; this.disabled = false; this.style = {}; this.attributes = {}; this.listeners = {}; this.min = "";
    }
    set id(value) { this._id = value; if (value && this.doc) this.doc.elements[value] = this; }
    get id() { return this._id; }
    set href(value) { this.attributes.href = value; }
    get href() { return this.attributes.href; }
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
    dispatch(type, extra = {}) {
        const event = { type, target: this, currentTarget: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...extra };
        for (const fn of this.listeners[type] || []) fn(event);
        return event;
    }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    getAttribute(name) { return name in this.attributes ? this.attributes[name] : null; }
    removeAttribute(name) { delete this.attributes[name]; }
    closest() { return null; }
    insertAdjacentElement(_, element) { this.doc.elements[element.id] = element; }
    remove() { delete this.doc.elements[this.id]; }
    focus() { this.doc.activeElement = this; }
    setSelectionRange() {}
}

function createSimulator(tripResponse) {
    const doc = { elements: {}, activeElement: null };
    doc.getElementById = (id) => doc.elements[id] || null;
    doc.createElement = () => new FakeElement(doc);
    for (const id of IDS) new FakeElement(doc, id);

    const fetchCalls = [];
    const context = vm.createContext({
        document: doc, Intl, Date, Number, Math, Object, String, JSON, Promise, encodeURIComponent,
        setInterval: () => 1, clearInterval: () => {},
        fetch: async (url, options) => { fetchCalls.push({ url, options }); return tripResponse(); }
    });
    for (const file of FILES) vm.runInContext(readFileSync(join(__dirname, "../src", file), "utf8"), context, { filename: file });

    const el = (id) => doc.elements[id];
    const type = (id, value) => { el(id).value = value; el(id).dispatch("input"); if (id !== "manual-toll") el("sim-form").dispatch("input"); };
    const fill = (overrides = {}) => {
        const values = { "event-venue": "Cliente Teste", "event-address": "Rua Exemplo, 100", "event-start": "2099-03-20",
            "event-start-time": "2000", "event-end": "2099-03-21", "event-end-time": "0100", "dest-cep": "01001000", ...overrides };
        for (const [id, value] of Object.entries(values)) type(id, value);
    };
    const submit = async () => { const event = el("sim-form").dispatch("submit"); await new Promise((r) => setTimeout(r, 0)); return event; };
    return { doc, el, type, fill, submit, fetchCalls, config: context.Paredao.config, pricing: context.Paredao.pricing, format: context.Paredao.format };
}

const json = (status, body, headers = {}) => () => ({ status, ok: status >= 200 && status < 300, json: async () => body, headers: { get: (k) => headers[k] || null } });
const PRICED = json(200, { outboundKm: 42.3, returnKm: 44.1, tollsBRL: 37.4, tollsStatus: "priced" });
const UNKNOWN = json(200, { outboundKm: 30, returnKm: 31, tollsBRL: null, tollsStatus: "unknown" });

test("validation goes top to bottom, shows the error on the field and focuses it", async () => {
    const sim = createSimulator(PRICED);
    const cases = [
        [{ "event-venue": "" }, "event-venue", "Informe o nome do responsável."],
        [{ "event-venue": "A" }, "event-venue", "O nome do responsável deve ter entre 2 e 80 caracteres."],
        [{ "event-address": "" }, "event-address", "Informe o endereço completo do evento."],
        [{ "event-start": "" }, "event-start", "Informe datas válidas para o evento."],
        [{ "event-end": "2000-01-01" }, "event-end", "Não é possível selecionar datas que já passaram."],
        [{ "event-start-time": "2560" }, "event-start-time", "Use o formato 24h, ex.: 21:30, e informe datas e horários válidos."],
        [{ "event-end": "2099-03-20", "event-end-time": "1900" }, "event-end-time", "O fim do evento deve ser posterior ao início."],
        [{ "dest-cep": "0100" }, "dest-cep", "Digite um CEP válido com 8 dígitos."]
    ];
    for (const [overrides, fieldId, message] of cases) {
        sim.fill(overrides);
        const event = await sim.submit();
        assert.equal(event.defaultPrevented, true, "the form never reloads the page");
        assert.equal(sim.el(`${fieldId}-error`).textContent, message, fieldId);
        assert.equal(sim.el(fieldId).getAttribute("aria-invalid"), "true");
        assert.equal(sim.doc.activeElement, sim.el(fieldId));
        assert.equal(sim.el("result").style.display, "none");
    }
    assert.equal(sim.fetchCalls.length, 0, "nothing is sent while the form is invalid");

    sim.type("dest-cep", "01001000"); // editing clears the error
    assert.equal(sim.doc.getElementById("dest-cep-error"), null);
    assert.equal(sim.el("dest-cep").getAttribute("aria-invalid"), null);
});

test("priced route: total, formatted CEP, active WhatsApp link, status cleared", async () => {
    const sim = createSimulator(PRICED);
    assert.equal(sim.el("btn-whats").href, undefined);
    sim.fill();
    await sim.submit();

    const price = sim.pricing.calculatePrice({ hours: 5, outboundKm: 42.3, returnKm: 44.1, tollsBRL: 37.4 }, sim.config);
    assert.equal(sim.el("res-total").textContent, sim.format.currency(price.totalBRL));
    assert.equal(sim.el("res-endereco").textContent, "01001-000");
    assert.equal(sim.el("res-horas").textContent, "5 horas");
    assert.equal(sim.el("status").textContent, "", "the loading message is gone");
    assert.equal(sim.el("btn-calcular").disabled, false);
    assert.match(sim.el("btn-whats").href, new RegExp(`^https://wa\\.me/${sim.config.WHATSAPP_PHONE}\\?text=`));
    assert.match(decodeURIComponent(sim.el("btn-whats").href), / - CEP: 01001000\n/);
    assert.equal(sim.el("btn-whats").getAttribute("aria-disabled"), null);
    assert.equal(sim.el("btn-whats").getAttribute("rel"), "noopener");
    assert.deepEqual(JSON.parse(sim.fetchCalls[0].options.body), { cep: "01001000" }, "only the CEP is sent to the server");
});

test("manual toll typed key by key gives the same total as the full value", async () => {
    const sim = createSimulator(UNKNOWN);
    sim.fill();
    await sim.submit();
    assert.equal(sim.el("manual-toll-group").hidden, false);
    assert.equal(sim.el("res-total").textContent, "-");
    assert.equal(sim.el("btn-whats").href, undefined, "no WhatsApp link without a total");
    assert.equal(sim.el("btn-whats").getAttribute("aria-disabled"), "true");

    const totalFor = (toll) => sim.format.currency(sim.pricing.calculatePrice(
        { hours: 5, outboundKm: 30, returnKm: 31, tollsBRL: toll * sim.config.TOLL_VEHICLE_MULTIPLIER }, sim.config).totalBRL);

    for (const typed of ["1", "12", "12,", "12,5", "12,50"]) sim.type("manual-toll", typed);
    assert.equal(sim.el("res-total").textContent, totalFor(12.5));
    assert.equal(sim.el("btn-whats").getAttribute("aria-disabled"), null);

    sim.type("manual-toll", "8"); // correcting the value recalculates
    assert.equal(sim.el("res-total").textContent, totalFor(8));

    sim.type("manual-toll", "abc"); // invalid again: total and link are withdrawn
    assert.equal(sim.el("res-total").textContent, "-");
    assert.equal(sim.el("btn-whats").href, undefined);
    assert.equal(sim.el("manual-toll-status").className, "status-msg error");
});

test("server answers: CEP not found, failure and rate limit", async () => {
    let sim = createSimulator(json(404, { error: "CEP_NOT_FOUND" }));
    sim.fill(); await sim.submit();
    assert.equal(sim.el("status").textContent, "CEP não encontrado. Confira os números digitados.");
    assert.equal(sim.el("btn-calcular").disabled, false);

    sim = createSimulator(json(502, { error: "UPSTREAM_ERROR" }));
    sim.fill(); await sim.submit();
    assert.equal(sim.el("status").textContent, "Não foi possível calcular a rota agora. Tente novamente mais tarde.");

    sim = createSimulator(json(429, {}, { "Retry-After": "30" }));
    sim.fill(); await sim.submit();
    assert.equal(sim.el("status").textContent, "Muitas tentativas. Aguarde um instante e tente novamente. (30s)");
    assert.equal(sim.el("btn-calcular").disabled, true, "blocked during the cooldown");
});
