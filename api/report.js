// Weekly report e-mail, run by Vercel Cron (see "crons" in vercel.json).
// GET /api/report               -> sends the report for the last 7 full days (São Paulo time)
// GET /api/report?dry=1         -> returns the e-mail HTML instead of sending it (for testing)
// GET /api/report?days=30       -> another period (1 to 90 days)
// Every call needs the header  Authorization: Bearer <CRON_SECRET>  (Vercel Cron sends it).
// Environment: CRON_SECRET, RESEND_API_KEY, Redis (KV_REST_API_URL / KV_REST_API_TOKEN),
// optional REPORT_EMAIL (default below) and REPORT_FROM (falls back to RESEND_FROM_EMAIL).
const stats = require("./_lib/stats.js");

const DEFAULT_TO = "paredaoonze@gmail.com";
const DEFAULT_FROM = "Paredão 011 <onboarding@resend.dev>";
const DAY_MS = 24 * 60 * 60 * 1000;

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const num = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const shortDate = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
const weekday = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "2-digit" });

const escapeHtml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function daysBack(from, count, offset = 1) {
  // Noon avoids any edge with the São Paulo day boundary.
  const base = new Date(from);
  base.setUTCHours(15, 0, 0, 0); // 12:00 in São Paulo (UTC-3)
  return Array.from({ length: count }, (_, i) => new Date(base.getTime() - (offset + count - 1 - i) * DAY_MS));
}

function change(current, previous) {
  if (!previous) return current ? "novo" : "—";
  const pct = Math.round(((current - previous) / previous) * 100);
  return `${pct > 0 ? "+" : ""}${pct}% vs período anterior`;
}

function topList(map, limit = 10) {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, value]) => {
      const [uf, city] = key.split("|");
      return { name: uf === "??" ? city : `${city} – ${uf}`, value };
    });
}

function buildReport(current, previous, dates) {
  const conversion = current.quotes ? Math.round((current.confirms / current.quotes) * 100) : 0;
  const avgTicket = current.confirms ? current.valueBRL / current.confirms : 0;
  const avgHours = current.confirms ? current.hours / current.confirms : 0;
  const period = `${shortDate.format(dates[0])} a ${shortDate.format(dates[dates.length - 1])}`;
  const cities = topList(current.quoteCities);
  const confirmCities = topList(current.confirmCities, 5);
  const kmOrder = ["até 20 km", "20–50 km", "50–100 km", "mais de 100 km"];

  const cell = "padding:8px 10px;border-bottom:1px solid #d8d2c2;font-size:14px;";
  const head = "padding:8px 10px;border-bottom:2px solid #0d0d0c;font-size:12px;text-transform:uppercase;text-align:left;";
  const card = (label, value, note) => `
    <td style="padding:6px;width:50%;vertical-align:top">
      <div style="background:#ffffff;border:2px solid #0d0d0c;padding:12px 14px">
        <div style="font-size:12px;text-transform:uppercase;color:#4a463d">${label}</div>
        <div style="font-size:28px;font-weight:800;line-height:1.2">${value}</div>
        <div style="font-size:12px;color:#4a463d">${note}</div>
      </div>
    </td>`;
  const table = (title, rows, cols) => `
    <h2 style="font-size:18px;margin:26px 0 8px;text-transform:uppercase">${title}</h2>
    ${rows.length ? `<table role="presentation" style="width:100%;border-collapse:collapse;background:#ffffff">
      <tr>${cols.map((c, i) => `<th style="${head}${i ? "text-align:right;" : ""}">${c}</th>`).join("")}</tr>
      ${rows.map((r) => `<tr>${r.map((v, i) => `<td style="${cell}${i ? "text-align:right;" : ""}">${escapeHtml(v)}</td>`).join("")}</tr>`).join("")}
    </table>` : `<p style="font-size:14px;color:#4a463d">Sem dados no período.</p>`}`;

  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#ece6d6;font-family:Arial,Helvetica,sans-serif;color:#0d0d0c">
  <div style="max-width:620px;margin:0 auto;padding:20px">
    <div style="background:#0d0d0c;color:#ffd400;padding:16px 18px;border-bottom:8px solid #ffd400">
      <div style="font-size:13px;text-transform:uppercase;letter-spacing:1px">Relatório do site</div>
      <div style="font-size:26px;font-weight:800;text-transform:uppercase">Paredão 011 · ${period}</div>
    </div>
    <table role="presentation" style="width:100%;border-collapse:collapse;margin-top:12px"><tr>
      ${card("Orçamentos calculados", current.quotes, change(current.quotes, previous.quotes))}
      ${card("Confirmados no WhatsApp", current.confirms, `${conversion}% dos orçamentos · ${change(current.confirms, previous.confirms)}`)}
    </tr><tr>
      ${card("Valor estimado confirmado", brl.format(current.valueBRL), "soma dos orçamentos enviados")}
      ${card("Ticket médio", current.confirms ? brl.format(avgTicket) : "—", current.confirms ? `evento médio de ${num.format(avgHours)} h` : "sem confirmações")}
    </tr></table>
    ${table("De onde vieram os orçamentos", cities.map((c) => [c.name, String(c.value)]), ["Cidade", "Orçamentos"])}
    ${table("Cidades que confirmaram", confirmCities.map((c) => [c.name, String(c.value)]), ["Cidade", "Confirmações"])}
    ${table("Distância (ida e volta)", kmOrder.filter((k) => current.km[k]).map((k) => [k, String(current.km[k])]), ["Faixa", "Orçamentos"])}
    ${table("Dia a dia", current.perDay.map((d, i) => [weekday.format(dates[i]), String(d.quotes), String(d.confirms)]), ["Dia", "Orçamentos", "Confirmados"])}
    <p style="font-size:12px;color:#4a463d;margin-top:26px">"Confirmados" conta quem tocou em "Confirmar Orçamento no WhatsApp"; a conversa e o fechamento acontecem no WhatsApp.
    Os números são anônimos: o site guarda só contagens, cidade e valores estimados, nunca nome ou endereço.</p>
  </div></body></html>`;

  const text = [
    `Paredão 011 · relatório ${period}`,
    `Orçamentos calculados: ${current.quotes} (${change(current.quotes, previous.quotes)})`,
    `Confirmados no WhatsApp: ${current.confirms} (${conversion}%)`,
    `Valor estimado confirmado: ${brl.format(current.valueBRL)}`,
    "",
    "De onde vieram:",
    ...cities.map((c) => `- ${c.name}: ${c.value}`)
  ].join("\n");

  const subject = `Paredão 011 · ${current.quotes} orçamento${current.quotes === 1 ? "" : "s"} e ${current.confirms} confirmado${current.confirms === 1 ? "" : "s"} (${period})`;
  return { subject, html, text };
}

async function sendEmail({ subject, html, text }) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.REPORT_FROM || process.env.RESEND_FROM_EMAIL || DEFAULT_FROM,
      to: [process.env.REPORT_EMAIL || DEFAULT_TO],
      subject,
      html,
      text
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`RESEND_${response.status}`);
  return data.id || null;
}

module.exports = async function handler(request, response) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return response.status(500).json({ error: "CRON_SECRET_NOT_SET" });
  const auth = (request.headers && request.headers.authorization) || "";
  if (auth !== `Bearer ${secret}`) return response.status(401).json({ error: "UNAUTHORIZED" });
  if (!stats.isConfigured()) return response.status(503).json({ error: "STATS_STORAGE_NOT_CONFIGURED" });

  const query = request.query || {};
  const days = Math.min(90, Math.max(1, parseInt(query.days, 10) || 7));
  const now = new Date();
  const dates = daysBack(now, days);
  let current;
  let previous;
  try {
    [current, previous] = await Promise.all([stats.readDays(dates), stats.readDays(daysBack(now, days, days + 1))]);
  } catch {
    return response.status(502).json({ error: "STATS_STORAGE_UNAVAILABLE" });
  }
  const report = buildReport(current, previous, dates);

  if (query.dry === "1") {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    return response.status(200).send(report.html);
  }
  if (!process.env.RESEND_API_KEY) return response.status(500).json({ error: "RESEND_API_KEY_NOT_SET" });
  try {
    const id = await sendEmail(report);
    return response.status(200).json({ sent: true, id, subject: report.subject });
  } catch (error) {
    return response.status(502).json({ error: String(error.message || "EMAIL_FAILED") });
  }
};

module.exports.buildReport = buildReport;
module.exports.daysBack = daysBack;
