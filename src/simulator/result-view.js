// Simulator output: status messages, field errors, result box, total and WhatsApp link.
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
    let invalidField = null;

    function showStatus(text, type) {
        status.className = `status-msg ${type}`;
        status.textContent = text;
    }

    // Shows the message right under the field, marks it invalid and moves focus to it.
    function showFieldError(field, message) {
        clearFieldError();
        const error = document.createElement("p");
        error.className = "field-error";
        error.id = `${field.id}-error`;
        error.setAttribute("role", "alert");
        error.textContent = message;
        const anchor = field.closest(".input-row") || field;
        anchor.insertAdjacentElement("afterend", error);
        field.setAttribute("aria-invalid", "true");
        field.setAttribute("aria-describedby", error.id);
        invalidField = field;
        field.focus();
    }

    function clearFieldError() {
        if (!invalidField) return;
        const error = byId(`${invalidField.id}-error`);
        if (error) error.remove();
        invalidField.removeAttribute("aria-invalid");
        invalidField.removeAttribute("aria-describedby");
        invalidField = null;
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
        clearTotal();
        result.style.display = "block";
    }

    function showTotal(totalText, whatsappHref) {
        total.textContent = totalText;
        whatsappButton.href = whatsappHref;
        whatsappButton.setAttribute("target", "_blank");
        whatsappButton.setAttribute("rel", "noopener");
        whatsappButton.removeAttribute("aria-disabled");
    }

    // Without a total there is nothing to send: the link has no href and is announced as disabled.
    function clearTotal() {
        total.textContent = "-";
        whatsappButton.removeAttribute("href");
        whatsappButton.removeAttribute("target");
        whatsappButton.removeAttribute("rel");
        whatsappButton.setAttribute("aria-disabled", "true");
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
        showStatus, showFieldError, clearFieldError, hideResult, hideManualToll, showResult, showTotal, clearTotal,
        askManualToll, setManualTollStatus
    };
})(typeof globalThis !== "undefined" ? globalThis : this);
