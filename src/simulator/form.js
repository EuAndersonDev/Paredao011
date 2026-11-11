// Simulator form: element lookup, input masks and reading values from the page.
(function (root) {
    "use strict";

    const datetime = root.Paredao.datetime;
    const byId = (id) => document.getElementById(id);

    const fields = {
        cep: byId("dest-cep"),
        venue: byId("event-venue"),
        address: byId("event-address"),
        startDate: byId("event-start"),
        startTime: byId("event-start-time"),
        endDate: byId("event-end"),
        endTime: byId("event-end-time"),
        manualToll: byId("manual-toll"),
        calculate: byId("btn-calcular")
    };

    function maskTimeInput(event) {
        const input = event.currentTarget;
        const digits = input.value.replace(/\D/g, "").slice(0, 4);
        input.value = digits.length > 2 ?
            `${digits.slice(0, 2)}:${digits.slice(2)}` :
            digits.length === 2 ? `${digits}:` : digits;
        input.setSelectionRange(input.value.length, input.value.length);
    }

    function maskCepInput(event) {
        let value = event.target.value.replace(/\D/g, "").slice(0, 8);
        if (value.length > 5) value = `${value.slice(0, 5)}-${value.slice(5)}`;
        event.target.value = value;
    }

    function updateMinDates() {
        const today = datetime.getTodayInSaoPaulo();
        fields.startDate.min = today;
        fields.endDate.min = today;
    }

    // Returns null when the dates are fine, or the error message to show.
    function dateError() {
        updateMinDates();

        if (!datetime.isValidDateValue(fields.startDate.value) || !datetime.isValidDateValue(fields.endDate.value)) {
            return "Informe datas válidas para o evento.";
        }

        const today = fields.startDate.min;
        if (fields.startDate.value < today || fields.endDate.value < today) {
            return "Não é possível selecionar datas que já passaram.";
        }

        return null;
    }

    function read() {
        return {
            cleanCep: fields.cep.value.replace(/\D/g, ""),
            venueName: fields.venue.value.trim(),
            eventAddress: fields.address.value.trim(),
            start: datetime.wallTimeToTimestamp(fields.startDate.value, fields.startTime.value),
            end: datetime.wallTimeToTimestamp(fields.endDate.value, fields.endTime.value, true)
        };
    }

    function init(handlers) {
        fields.cep.addEventListener("input", maskCepInput);
        fields.startTime.addEventListener("input", maskTimeInput);
        fields.endTime.addEventListener("input", maskTimeInput);
        fields.calculate.addEventListener("click", handlers.onCalculate);
        fields.manualToll.addEventListener("input", handlers.onManualToll);
        updateMinDates();
    }

    (root.Paredao = root.Paredao || {}).form = { fields, init, read, dateError };
})(typeof globalThis !== "undefined" ? globalThis : this);
