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

    // Known issue (kept as-is, see docs/AUDIT.md): after the first valid value the quote
    // switches to "manual" and later edits of the field are ignored.
    function onManualToll() {
        if (!currentQuote || currentQuote.tollsStatus !== "unknown") return;

        const manualTollInputBRL = P.format.parseMoneyInput(form.fields.manualToll.value);
        if (manualTollInputBRL === null) {
            view.clearTotal();
            view.setManualTollStatus("Informe um valor válido de pedágios em reais para calcular o total.", true);
            return;
        }

        view.setManualTollStatus("", false);
        const manualToll = P.pricing.manualTollsBRL(manualTollInputBRL, CONFIG);
        currentQuote.tollsBRL = manualToll;
        currentQuote.tollsStatus = "manual";
        showPrice(currentQuote, manualToll);
    }

    function fail(message) {
        view.hideResult();
        view.showStatus(message, "error");
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

        const dateError = form.dateError();
        if (dateError) return fail(dateError);

        const { cleanCep, venueName, eventAddress, start, end } = form.read();

        if (start === null || end === null) {
            return fail("Use o formato 24h, ex.: 21:30, e informe datas e horários válidos.");
        }
        if (end.timestamp <= start.timestamp) {
            return fail("O fim do evento deve ser posterior ao início.");
        }
        if (cleanCep.length !== 8) {
            return fail("Digite um CEP válido com 8 dígitos.");
        }
        if (!venueName || !eventAddress) {
            return fail("Informe o nome do local e o endereço completo do evento.");
        }
        if (venueName.length < 2 || venueName.length > 80) {
            return fail("O nome do responsável deve ter entre 2 e 80 caracteres.");
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
                tollsStatus: data.tollsStatus,
                start,
                end
            };

            view.showResult(cleanCep, `${P.format.hours(hours)} horas`);

            if (data.tollsStatus === "unknown") {
                view.askManualToll("Informe o valor de pedágios em reais para calcular o total.");
                view.showStatus("", "");
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

    form.init({ onCalculate, onManualToll });
})(typeof globalThis !== "undefined" ? globalThis : this);
