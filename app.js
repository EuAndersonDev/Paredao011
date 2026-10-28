const cepInput = document.getElementById("dest-cep");
const startInput = document.getElementById("event-start");
const endInput = document.getElementById("event-end");
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
const distanceFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 1,
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

cepInput.addEventListener("input", (event) => {
  let value = event.target.value.replace(/\D/g, "").slice(0, 8);
  if (value.length > 5) value = `${value.slice(0, 5)}-${value.slice(5)}`;
  event.target.value = value;
});

calculateButton.addEventListener("click", processarOrcamento);
manualTollInput.addEventListener("input", atualizarTotalComPedagioManual);

function showStatus(text, type) {
  const element = document.getElementById("status");
  element.className = `status-msg ${type}`;
  element.textContent = text;
}

function wallTimeToTimestamp(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;

  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const parts = [yearText, monthText, dayText, hourText, minuteText].map(Number);
  const [year, month, day, hour, minute] = parts;
  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  const validationDate = new Date(localAsUtc);

  if (
    validationDate.getUTCFullYear() !== year ||
    validationDate.getUTCMonth() !== month - 1 ||
    validationDate.getUTCDate() !== day ||
    validationDate.getUTCHours() !== hour ||
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

  return timestamp;
}

function readManualToll() {
  const value = manualTollInput.value.trim();
  if (!/^\d+(?:[,.]\d{1,2})?$/.test(value)) return null;
  const amount = Number(value.replace(",", "."));
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function atualizarTotalComPedagioManual() {
  if (!currentQuote || currentQuote.tollsStatus !== "unknown") return;

  const manualToll = readManualToll();
  if (manualToll === null) {
    document.getElementById("res-pedagios").textContent = "-";
    document.getElementById("res-total").textContent = "-";
    document.getElementById("btn-whats").href = "#";
    manualTollStatus.className = "status-msg error";
    manualTollStatus.textContent = "Informe um valor válido de pedágios em reais para calcular o total.";
    return;
  }

  manualTollStatus.className = "status-msg";
  manualTollStatus.textContent = "";
  document.getElementById("res-pedagios").textContent = currencyFormatter.format(manualToll);
  exibirTotal(currentQuote, manualToll);
}

function exibirTotal(quote, tollsBRL) {
  const total = quote.laborBRL + quote.fuelBRL + tollsBRL;
  document.getElementById("res-total").textContent = currencyFormatter.format(total);

  const message = [
    "Olá! Gostaria de agendar o Paredão 011.",
    "",
    `Destino: ${quote.address} (CEP: ${quote.cep})`,
    `Duração: ${hourFormatter.format(quote.hours)} horas`,
    `Mão de obra: ${currencyFormatter.format(quote.laborBRL)}`,
    `Distância ida e volta: ${distanceFormatter.format(quote.roundTripKm)} km`,
    `Combustível: ${currencyFormatter.format(quote.fuelBRL)}`,
    `Pedágios: ${currencyFormatter.format(tollsBRL)}`,
    `Orçamento total: ${currencyFormatter.format(total)}`
  ].join("\n");
  document.getElementById("btn-whats").href =
    `https://wa.me/${CONFIG.WHATSAPP_PHONE}?text=${encodeURIComponent(message)}`;
}

async function processarOrcamento() {
  const cleanCep = cepInput.value.replace(/\D/g, "");
  const start = wallTimeToTimestamp(startInput.value);
  const end = wallTimeToTimestamp(endInput.value);

  if (start === null || end === null) {
    resultElement.style.display = "none";
    showStatus("Informe a data e o horário válidos de início e fim do evento.", "error");
    return;
  }

  if (end <= start) {
    resultElement.style.display = "none";
    showStatus("O fim do evento deve ser posterior ao início.", "error");
    return;
  }

  if (cleanCep.length !== 8) {
    resultElement.style.display = "none";
    showStatus("Digite um CEP válido com 8 dígitos.", "error");
    return;
  }

  calculateButton.disabled = true;
  resultElement.style.display = "none";
  manualTollGroup.hidden = true;
  currentQuote = null;
  showStatus("Consultando o CEP e calculando a rota...", "loading");

  try {
    const response = await fetch("/api/trip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cep: cleanCep })
    });

    let data;
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

    const hours = (end - start) / 3600000;
    const laborBRL = hours * CONFIG.HOURLY_RATE_BRL;
    const roundTripKm = data.outboundKm + data.returnKm;
    const fuelBRL = (roundTripKm / CONFIG.CAR_KM_PER_LITER) *
      CONFIG.GASOLINE_PRICE_BRL_PER_LITER;
    const tollsBRL = data.tollsStatus === "unknown" ? null : data.tollsBRL;

    currentQuote = {
      address: `CEP ${cleanCep}`,
      cep: cleanCep,
      hours,
      laborBRL,
      roundTripKm,
      fuelBRL,
      tollsBRL,
      tollsStatus: data.tollsStatus
    };

    document.getElementById("res-endereco").textContent = currentQuote.address || "-";
    document.getElementById("res-horas").textContent = `${hourFormatter.format(hours)} horas`;
    document.getElementById("res-mao-de-obra").textContent = currencyFormatter.format(laborBRL);
    document.getElementById("res-distancia").textContent =
      `${distanceFormatter.format(roundTripKm)} km`;
    document.getElementById("res-gasolina").textContent = currencyFormatter.format(fuelBRL);
    document.getElementById("res-total").textContent = "-";
    document.getElementById("btn-whats").href = "#";

    if (data.tollsStatus === "unknown") {
      document.getElementById("res-pedagios").textContent = "Informe o valor";
      manualTollInput.value = "";
      manualTollGroup.hidden = false;
      manualTollStatus.className = "status-msg error";
      manualTollStatus.textContent = "Informe o valor de pedágios em reais para calcular o total.";
    } else {
      document.getElementById("res-pedagios").textContent =
        currencyFormatter.format(tollsBRL);
      exibirTotal(currentQuote, tollsBRL);
    }

    showStatus("", "");
    resultElement.style.display = "block";
  } catch {
    showStatus("Não foi possível conectar ao serviço de rotas. Tente novamente.", "error");
  } finally {
    calculateButton.disabled = false;
  }
}
