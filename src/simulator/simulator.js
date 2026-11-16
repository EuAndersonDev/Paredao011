// Simulator controller: validates the form, asks /api/trip for distance and tolls,
// prices the event with lib/pricing and builds the WhatsApp link with lib/whatsapp.
(function (root) {
    "use strict";

    const P = root.Paredao;
    const CONFIG = P.config;
    const form = P.form;
    const view = P.resultView;
    const button = form.fields.calculate;

    let currentQuote = null;
    let requestInFlight = false;
    let cooldownInterval = null;
    let lastSuccessfulTrip = null;

    function startRateLimitCooldown(response) {
        const retryAfter = response.headers && response.headers.get("Retry-After");
        const retrySeconds = typeof retryAfter === "string" && /^\d+$/.test(retryAfter.trim()) ?
            Number(retryAfter.trim()) :
            NaN;
        const cooldownSeconds = Number.isSafeInteger(retrySeconds) && retrySeconds > 0 ?
            retrySeconds :
            CONFIG.COOLDOWN_SECONDS;
        const cooldownEndsAt = Date.now() + cooldownSeconds * 1000;
        const message = "Muitas tentativas. Aguarde um instante e tente novamente.";

        button.disabled = true;
        view.showStatus(`${message} (${cooldownSeconds}s)`, "error");
        cooldownInterval = setInterval(() => {
            const remainingSeconds = Math.ceil((cooldownEndsAt - Date.now()) / 1000);
            if (remainingSeconds <= 0) {
                clearInterval(cooldownInterval);
                cooldownInterval = null;
                button.disabled = false;
                view.showStatus("", "");
                return;
            }

            view.showStatus(`${message} (${remainingSeconds}s)`, "error");
        }, 1000);
    }

    function showPrice(quote, tollsBRL) {
        const price = P.pricing.calculatePrice({
            hours: quote.hours,
            outboundKm: quote.outboundKm,
            returnKm: quote.returnKm,
            tollsBRL
        }, CONFIG);
        const lines = P.whatsapp.buildMessageLines(quote, price, CONFIG);
        view.showTotal(P.format.currency(price.totalBRL), P.whatsapp.buildLink(CONFIG.WHATSAPP_PHONE, lines));
        quote.totalBRL = price.totalBRL;
    }

    // Runs on every edit of the manual toll field, so the total always matches what is typed.
    function onManualToll() {
        if (!currentQuote || !currentQuote.needsManualToll) return;

        const manualTollInputBRL = P.format.parseMoneyInput(form.fields.manualToll.value);
        if (manualTollInputBRL === null) {
            currentQuote.tollsBRL = null;
            view.clearTotal();
            view.setManualTollStatus("Informe um valor válido de pedágios em reais para calcular o total.", true);
            return;
        }

        view.setManualTollStatus("", false);
        const manualToll = P.pricing.manualTollsBRL(manualTollInputBRL, CONFIG);
        currentQuote.tollsBRL = manualToll;
        showPrice(currentQuote, manualToll);
    }

    // Validation error: message under the field, focus on it, result hidden.
    function fail(field, message) {
        view.hideResult();
        view.showStatus("", "");
        view.showFieldError(field, message);
    }

    function isValidTrip(data) {
        return !(
            typeof data.outboundKm !== "number" ||
            !Number.isFinite(data.outboundKm) ||
            data.outboundKm < 0 ||
            typeof data.returnKm !== "number" ||
            !Number.isFinite(data.returnKm) ||
            data.returnKm < 0 ||
            !["priced", "none", "unknown"].includes(data.tollsStatus) ||
            (data.tollsStatus === "unknown" && data.tollsBRL !== null) ||
            (data.tollsStatus !== "unknown" && typeof data.tollsBRL !== "number")
        );
    }

    async function onCalculate() {
        if (requestInFlight || cooldownInterval !== null) return;

        // Checked in the order the fields appear on the page.
        const f = form.fields;
        const { cleanCep, venueName, eventAddress, start, end } = form.read();
        view.clearFieldError();

        if (!venueName) {
            return fail(f.venue, "Informe o nome do responsável.");
        }
        if (venueName.length < 2 || venueName.length > 80) {
            return fail(f.venue, "O nome do responsável deve ter entre 2 e 80 caracteres.");
        }
        if (!eventAddress) {
            return fail(f.address, "Informe o endereço completo do evento.");
        }
        const dateError = form.dateError();
        if (dateError) return fail(dateError.field, dateError.message);
        if (start === null) {
            return fail(f.startTime, "Use o formato 24h, ex.: 21:30, e informe datas e horários válidos.");
        }
        if (end === null) {
            return fail(f.endTime, "Use o formato 24h, ex.: 21:30, e informe datas e horários válidos.");
        }
        if (end.timestamp <= start.timestamp) {
            return fail(f.endTime, "O fim do evento deve ser posterior ao início.");
        }
        if (cleanCep.length !== 8) {
            return fail(f.cep, "Digite um CEP válido com 8 dígitos.");
        }

        button.disabled = true;
        requestInFlight = true;
        view.hideResult();
        view.hideManualToll();
        currentQuote = null;
        view.showStatus("Consultando o CEP e calculando a rota...", "loading");

        try {
            let data;
            if (lastSuccessfulTrip && lastSuccessfulTrip.cep === cleanCep) {
                data = lastSuccessfulTrip.data;
            } else {
                const response = await fetch("/api/trip", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ cep: cleanCep })
                });

                if (response.status === 429) {
                    startRateLimitCooldown(response);
                    return;
                }

                try {
                    data = await response.json();
                } catch {
                    throw new Error("UPSTREAM_ERROR");
                }

                if (response.status === 404 && data.error === "CEP_NOT_FOUND") {
                    view.showStatus("CEP não encontrado. Confira os números digitados.", "error");
                    return;
                }

                if (!response.ok) {
                    view.showStatus("Não foi possível calcular a rota agora. Tente novamente mais tarde.", "error");
                    return;
                }
            }

            if (!isValidTrip(data)) {
                view.showStatus("A resposta da rota está inválida. Tente novamente mais tarde.", "error");
                return;
            }

            if (!lastSuccessfulTrip || lastSuccessfulTrip.cep !== cleanCep) {
                lastSuccessfulTrip = { cep: cleanCep, data };
            }

            const hours = P.datetime.durationHours(start, end);
            const tollsBRL = data.tollsStatus === "unknown" ? null : data.tollsBRL;

            currentQuote = {
                venueName,
                eventAddress,
                cep: cleanCep,
                hours,
                outboundKm: data.outboundKm,
                returnKm: data.returnKm,
                tollsBRL,
                needsManualToll: data.tollsStatus === "unknown",
                start,
                end
            };

            view.showResult(`${cleanCep.slice(0, 5)}-${cleanCep.slice(5)}`, `${P.format.hours(hours)} horas`);
            view.showStatus("", ""); // done: the "consultando" message goes away

            if (data.tollsStatus === "unknown") {
                view.askManualToll("Informe o valor de pedágios em reais para calcular o total.");
                form.fields.manualToll.focus();
            } else {
                showPrice(currentQuote, tollsBRL);
            }
        } catch {
            view.showStatus("Não foi possível conectar ao serviço de rotas. Tente novamente.", "error");
        } finally {
            requestInFlight = false;
            if (cooldownInterval === null) button.disabled = false;
        }
    }

    form.init({ onCalculate, onManualToll, onEdit: view.clearFieldError });
})(typeof globalThis !== "undefined" ? globalThis : this);
