const cepInput = document.getElementById("dest-cep");
const venueInput = document.getElementById("event-venue");
const eventAddressInput = document.getElementById("event-address");
const startInput = document.getElementById("event-start");
const startTimeInput = document.getElementById("event-start-time");
const endInput = document.getElementById("event-end");
const endTimeInput = document.getElementById("event-end-time");
const calculateButton = document.getElementById("btn-calcular");
const resultElement = document.getElementById("result");
const manualTollGroup = document.getElementById("manual-toll-group");
const manualTollInput = document.getElementById("manual-toll");
const manualTollStatus = document.getElementById("manual-toll-status");
const currencyFormatter = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
});
const hourFormatter = new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 2
});
const saoPauloFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
});

let currentQuote = null;
let requestInFlight = false;
let cooldownInterval = null;
let lastSuccessfulTrip = null;

function maskTimeInput(event) {
    const input = event.currentTarget;
    const digits = input.value.replace(/\D/g, "").slice(0, 4);
    input.value = digits.length > 2 ?
        `${digits.slice(0, 2)}:${digits.slice(2)}` :
        digits.length === 2 ? `${digits}:` : digits;
    input.setSelectionRange(input.value.length, input.value.length);
}

cepInput.addEventListener("input", (event) => {
    let value = event.target.value.replace(/\D/g, "").slice(0, 8);
    if (value.length > 5) value = `${value.slice(0, 5)}-${value.slice(5)}`;
    event.target.value = value;
});

startTimeInput.addEventListener("input", maskTimeInput);
endTimeInput.addEventListener("input", maskTimeInput);
calculateButton.addEventListener("click", processarOrcamento);
manualTollInput.addEventListener("input", atualizarTotalComPedagioManual);
atualizarMinimoDatas();

function showStatus(text, type) {
    const element = document.getElementById("status");
    element.className = `status-msg ${type}`;
    element.textContent = text;
}

function getTodayInSaoPaulo() {
    const parts = Object.fromEntries(
        saoPauloFormatter.formatToParts(new Date())
            .filter((part) => part.type !== "literal")
            .map((part) => [part.type, part.value])
    );
    return `${parts.year}-${parts.month}-${parts.day}`;
}

function isValidDateValue(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return false;

    const [, yearText, monthText, dayText] = match;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day;
}

function atualizarMinimoDatas() {
    const today = getTodayInSaoPaulo();
    startInput.min = today;
    endInput.min = today;
}

function validarDatasDoEvento() {
    atualizarMinimoDatas();

    if (!isValidDateValue(startInput.value) || !isValidDateValue(endInput.value)) {
        resultElement.style.display = "none";
        showStatus("Informe datas válidas para o evento.", "error");
        return false;
    }

    const today = startInput.min;
    if (startInput.value < today || endInput.value < today) {
        resultElement.style.display = "none";
        showStatus("Não é possível selecionar datas que já passaram.", "error");
        return false;
    }

    return true;
}

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

    calculateButton.disabled = true;
    showStatus(`${message} (${cooldownSeconds}s)`, "error");
    cooldownInterval = setInterval(() => {
        const remainingSeconds = Math.ceil((cooldownEndsAt - Date.now()) / 1000);
        if (remainingSeconds <= 0) {
            clearInterval(cooldownInterval);
            cooldownInterval = null;
            calculateButton.disabled = false;
            showStatus("", "");
            return;
        }

        showStatus(`${message} (${remainingSeconds}s)`, "error");
    }, 1000);
}

function wallTimeToTimestamp(dateValue, timeValue, isEnd = false) {
    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue);
    const timeMatch = /^(\d{2}):(\d{2})$/.exec(timeValue);
    if (!dateMatch || !timeMatch) return null;

    const [, yearText, monthText, dayText] = dateMatch;
    const [, hourText, minuteText] = timeMatch;
    const [year, month, day, hour, minute] = [yearText, monthText, dayText, hourText, minuteText].map(Number);
    const isEndOfDay = isEnd && hour === 24 && minute === 0;
    if ((hour > 23 && !isEndOfDay) || minute > 59) return null;

    let normalizedDate = dateValue;
    let normalizedTime = timeValue;
    let normalizedYear = year;
    let normalizedMonth = month;
    let normalizedDay = day;
    let normalizedHour = hour;

    if (isEndOfDay) {
        const nextDay = new Date(Date.UTC(year, month - 1, day + 1));
        normalizedDate = [
            String(nextDay.getUTCFullYear()).padStart(4, "0"),
            String(nextDay.getUTCMonth() + 1).padStart(2, "0"),
            String(nextDay.getUTCDate()).padStart(2, "0")
        ].join("-");
        normalizedTime = "00:00";
        normalizedYear = nextDay.getUTCFullYear();
        normalizedMonth = nextDay.getUTCMonth() + 1;
        normalizedDay = nextDay.getUTCDate();
        normalizedHour = 0;
    }

    const originalDateCheck = new Date(Date.UTC(year, month - 1, day));
    if (
        originalDateCheck.getUTCFullYear() !== year ||
        originalDateCheck.getUTCMonth() !== month - 1 ||
        originalDateCheck.getUTCDate() !== day
    ) {
        return null;
    }

    const localAsUtc = Date.UTC(
        normalizedYear,
        normalizedMonth - 1,
        normalizedDay,
        normalizedHour,
        minute
    );
    const validationDate = new Date(localAsUtc);

    if (
        validationDate.getUTCFullYear() !== normalizedYear ||
        validationDate.getUTCMonth() !== normalizedMonth - 1 ||
        validationDate.getUTCDate() !== normalizedDay ||
        validationDate.getUTCHours() !== normalizedHour ||
        validationDate.getUTCMinutes() !== minute
    ) {
        return null;
    }

    let timestamp = localAsUtc;
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const formattedParts = Object.fromEntries(
            saoPauloFormatter.formatToParts(new Date(timestamp))
            .filter((part) => part.type !== "literal")
            .map((part) => [part.type, Number(part.value)])
        );
        const representedAsUtc = Date.UTC(
            formattedParts.year,
            formattedParts.month - 1,
            formattedParts.day,
            formattedParts.hour,
            formattedParts.minute,
            formattedParts.second
        );
        const adjustment = localAsUtc - representedAsUtc;
        timestamp += adjustment;
        if (adjustment === 0) break;
    }

    return { timestamp, date: normalizedDate, time: normalizedTime };
}

function formatDateForMessage(dateValue) {
    const [year, month, day] = dateValue.split("-");
    return `${day.padStart(2, "0")}/${month.padStart(2, "0")}/${year.padStart(4, "0")}`;
}

function readManualToll() {
    const value = manualTollInput.value.trim();
    if (!/^\d+(?:[,.]\d{1,2})?$/.test(value)) return null;
    const amount = Number(value.replace(",", "."));
    return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function atualizarTotalComPedagioManual() {
    if (!currentQuote || currentQuote.tollsStatus !== "unknown") return;

    const manualTollInputBRL = readManualToll();
    if (manualTollInputBRL === null) {
        document.getElementById("res-total").textContent = "-";
        document.getElementById("btn-whats").href = "#";
        manualTollStatus.className = "status-msg error";
        manualTollStatus.textContent = "Informe um valor válido de pedágios em reais para calcular o total.";
        return;
    }

    manualTollStatus.className = "status-msg";
    manualTollStatus.textContent = "";
    const manualToll = manualTollInputBRL * CONFIG.TOLL_VEHICLE_MULTIPLIER;
    currentQuote.tollsBRL = manualToll;
    currentQuote.tollsStatus = "manual";
    exibirTotal(currentQuote, manualToll);
}

function exibirTotal(quote, tollsBRL) {
    const total = quote.laborBRL + quote.fuelBRL + tollsBRL;
    const depositBRL = total * CONFIG.RESERVATION_DEPOSIT_PERCENT / 100;
    const balanceBRL = total - depositBRL;
    document.getElementById("res-total").textContent = currencyFormatter.format(total);

    const message = [
        " @Paredão_011 – Orçamento",
        "",
        ` - Nome do responsavel: ${quote.venueName}`,
        ` - Endereço: ${quote.eventAddress}`,
        ` - CEP: ${quote.cep}`,
        ` - Data: ${formatDateForMessage(quote.start.date)}`,
        ` - Horário: ${quote.start.time} às ${quote.end.time} — ${hourFormatter.format(quote.hours)} horas`,
        "",
        ` - Valor: ${currencyFormatter.format(total)}`,
        "",
        "Incluso:",
        "• Estrutura de som profissional",
        "• Montagem e desmontagem",
        "• Deslocamento",
        "• Acompanhamento durante o evento",
        "",
        ` - Reserva mediante sinal de ${CONFIG.RESERVATION_DEPOSIT_PERCENT}%: ${currencyFormatter.format(depositBRL)}`,
        ` - Saldo no dia: ${currencyFormatter.format(balanceBRL)}`,
        ""
    ].join("\n");
    document.getElementById("btn-whats").href =
        `https://wa.me/${CONFIG.WHATSAPP_PHONE}?text=${encodeURIComponent(message)}`;
    quote.totalBRL = total;
}

async function processarOrcamento() {
    if (requestInFlight || cooldownInterval !== null) return;

    if (!validarDatasDoEvento()) return;

    const cleanCep = cepInput.value.replace(/\D/g, "");
    const venueName = venueInput.value.trim();
    const eventAddress = eventAddressInput.value.trim();
    const start = wallTimeToTimestamp(startInput.value, startTimeInput.value);
    const end = wallTimeToTimestamp(endInput.value, endTimeInput.value, true);

    if (start === null || end === null) {
        resultElement.style.display = "none";
        showStatus("Use o formato 24h, ex.: 21:30, e informe datas e horários válidos.", "error");
        return;
    }

    if (end.timestamp <= start.timestamp) {
        resultElement.style.display = "none";
        showStatus("O fim do evento deve ser posterior ao início.", "error");
        return;
    }

    if (cleanCep.length !== 8) {
        resultElement.style.display = "none";
        showStatus("Digite um CEP válido com 8 dígitos.", "error");
        return;
    }

    if (!venueName || !eventAddress) {
        resultElement.style.display = "none";
        showStatus("Informe o nome do local e o endereço completo do evento.", "error");
        return;
    }

    calculateButton.disabled = true;
    requestInFlight = true;
    resultElement.style.display = "none";
    manualTollGroup.hidden = true;
    currentQuote = null;
    showStatus("Consultando o CEP e calculando a rota...", "loading");

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
                showStatus("CEP não encontrado. Confira os números digitados.", "error");
                return;
            }

            if (!response.ok) {
                showStatus("Não foi possível calcular a rota agora. Tente novamente mais tarde.", "error");
                return;
            }
        }

        if (
            typeof data.outboundKm !== "number" ||
            !Number.isFinite(data.outboundKm) ||
            data.outboundKm < 0 ||
            typeof data.returnKm !== "number" ||
            !Number.isFinite(data.returnKm) ||
            data.returnKm < 0 ||
            !["priced", "none", "unknown"].includes(data.tollsStatus) ||
            (data.tollsStatus === "unknown" && data.tollsBRL !== null) ||
            (data.tollsStatus !== "unknown" && typeof data.tollsBRL !== "number")
        ) {
            showStatus("A resposta da rota está inválida. Tente novamente mais tarde.", "error");
            return;
        }

        if (!lastSuccessfulTrip || lastSuccessfulTrip.cep !== cleanCep) {
            lastSuccessfulTrip = { cep: cleanCep, data };
        }

        const hours = (end.timestamp - start.timestamp) / 3600000;
        const laborBRL = hours * CONFIG.HOURLY_RATE_BRL;
        const roundTripKm = data.outboundKm + data.returnKm;
        const fuelBRL = (roundTripKm / CONFIG.CAR_KM_PER_LITER) *
            CONFIG.GASOLINE_PRICE_BRL_PER_LITER;
        const tollsBRL = data.tollsStatus === "unknown" ? null : data.tollsBRL;

        currentQuote = {
            venueName,
            eventAddress,
            cep: cleanCep,
            hours,
            laborBRL,
            outboundKm: data.outboundKm,
            returnKm: data.returnKm,
            fuelBRL,
            tollsBRL,
            tollsStatus: data.tollsStatus,
            start,
            end
        };

        document.getElementById("res-endereco").textContent = cleanCep;
        document.getElementById("res-horas").textContent = `${hourFormatter.format(hours)} horas`;
        document.getElementById("res-total").textContent = "-";
        document.getElementById("btn-whats").href = "#";
        resultElement.style.display = "block";

        if (data.tollsStatus === "unknown") {
            manualTollInput.value = "";
            manualTollGroup.hidden = false;
            manualTollStatus.className = "status-msg error";
            manualTollStatus.textContent = "Informe o valor de pedágios em reais para calcular o total.";
        } else {
            exibirTotal(currentQuote, tollsBRL);
        }
        if (data.tollsStatus === "unknown") showStatus("", "");
        if (data.tollsStatus === "unknown") showStatus("", "");
    } catch {
        showStatus("Não foi possível conectar ao serviço de rotas. Tente novamente.", "error");
    } finally {
        requestInFlight = false;
        if (cooldownInterval === null) calculateButton.disabled = false;
    }
}