// Simulator output: status messages, result box, total and WhatsApp link.
// Text from the user or the API is only ever written with textContent.
(function (root) {
    "use strict";

    const byId = (id) => document.getElementById(id);
    const status = byId("status");
    const result = byId("result");
    const cep = byId("res-endereco");
    const hours = byId("res-horas");
    const total = byId("res-total");
    const whatsappButton = byId("btn-whats");
    const manualTollGroup = byId("manual-toll-group");
    const manualTollInput = byId("manual-toll");
    const manualTollStatus = byId("manual-toll-status");

    function showStatus(text, type) {
        status.className = `status-msg ${type}`;
        status.textContent = text;
    }

    function hideResult() {
        result.style.display = "none";
    }

    function hideManualToll() {
        manualTollGroup.hidden = true;
    }

    function showResult(cepText, hoursText) {
        cep.textContent = cepText;
        hours.textContent = hoursText;
        total.textContent = "-";
        whatsappButton.href = "#";
        result.style.display = "block";
    }

    function showTotal(totalText, whatsappHref) {
        total.textContent = totalText;
        whatsappButton.href = whatsappHref;
    }

    function clearTotal() {
        total.textContent = "-";
        whatsappButton.href = "#";
    }

    function askManualToll(message) {
        manualTollInput.value = "";
        manualTollGroup.hidden = false;
        setManualTollStatus(message, true);
    }

    function setManualTollStatus(message, isError) {
        manualTollStatus.className = isError ? "status-msg error" : "status-msg";
        manualTollStatus.textContent = message;
    }

    (root.Paredao = root.Paredao || {}).resultView = {
        showStatus, hideResult, hideManualToll, showResult, showTotal, clearTotal, askManualToll, setManualTollStatus
    };
})(typeof globalThis !== "undefined" ? globalThis : this);
