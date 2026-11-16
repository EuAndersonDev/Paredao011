// Simulator form: element lookup, input masks and reading values from the page.
(function (root) {
    "use strict";

    const datetime = root.Paredao.datetime;
    const byId = (id) => document.getElementById(id);

    const fields = {
        form: byId("sim-form"),
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

    // Returns null when the dates are fine, or { field, message } for the first problem.
    function dateError() {
        updateMinDates();
        const today = fields.startDate.min;

        for (const field of [fields.startDate, fields.endDate]) {
            if (!datetime.isValidDateValue(field.value)) {
                return { field, message: "Informe datas válidas para o evento." };
            }
            if (field.value < today) {
                return { field, message: "Não é possível selecionar datas que já passaram." };
            }
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
        fields.form.addEventListener("submit", (event) => {
            event.preventDefault(); // Enter in any field or the "Calcular" button
            handlers.onCalculate();
        });
        fields.manualToll.addEventListener("input", handlers.onManualToll);
        // Typing in a field clears its error message.
        fields.form.addEventListener("input", handlers.onEdit);
        updateMinDates();
    }

    (root.Paredao = root.Paredao || {}).form = { fields, init, read, dateError };
})(typeof globalThis !== "undefined" ? globalThis : this);
