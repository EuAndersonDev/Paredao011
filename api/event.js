// Records that a visitor clicked "Confirmar Orçamento no WhatsApp" (anonymous counters only).
// Body: { "type": "confirm", "cep": "01001000", "hours": 5, "totalBRL": 1174.6 }
// The CEP is only used to find the city that /api/trip looked up in the last 2 days;
// confirmations for CEPs that were never quoted are ignored, so the numbers can't be inflated
// with made-up requests. Always answers quickly; failures never affect the visitor.
const stats = require("./_lib/stats.js");

const MAX_BODY_BYTES = 256;

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  }

  let body = request.body;
  if (typeof body === "string") {
    if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) return response.status(413).json({ error: "BODY_TOO_LARGE" });
    try {
      body = JSON.parse(body);
    } catch {
      return response.status(400).json({ error: "INVALID_EVENT" });
    }
  }

  const cep = body && typeof body.cep === "string" ? body.cep.replace(/\D/g, "") : "";
  const hours = body && Number(body.hours);
  const totalBRL = body && Number(body.totalBRL);
  const valid = body && body.type === "confirm" &&
    /^\d{8}$/.test(cep) &&
    Number.isFinite(hours) && hours > 0 && hours <= 96 &&
    Number.isFinite(totalBRL) && totalBRL > 0 && totalBRL < 1000000;
  if (!valid) return response.status(400).json({ error: "INVALID_EVENT" });

  const recorded = await stats.recordConfirm({ cep, hours, totalBRL });
  return response.status(recorded ? 204 : 202).end();
};
