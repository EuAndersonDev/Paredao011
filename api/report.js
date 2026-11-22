// Daily report e-mail, run by Vercel Cron every day at 18:00 São Paulo time (see vercel.json).
// GET /api/report               -> sends the report for the last 24 hours, ending at the current
//                                  full hour (run at 18:xx = 18:00 yesterday to 18:00 today)
// GET /api/report?dry=1         -> returns the e-mail HTML instead of sending it (for testing)
// GET /api/report?days=7        -> a longer period (1 to 90 days), e.g. a weekly summary
// Every call needs the header  Authorization: Bearer <CRON_SECRET>  (Vercel Cron sends it).
// Environment: CRON_SECRET, DATABASE_URL (Neon), SMTP_USER + SMTP_PASS (Gmail app password),
// optional REPORT_EMAIL (default below), REPORT_FROM, SMTP_HOST, SMTP_PORT.
const stats = require("./_lib/stats.js");
const mailer = require("./_lib/mailer.js");

const DEFAULT_TO = "paredaoonze@gmail.com";
const HOUR_MS = 60 * 60 * 1000;

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const num = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const TZ = "America/Sao_Paulo";
const shortDate = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit" });
const weekday = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, weekday: "short", day: "2-digit", month: "2-digit" });
const hourOnly = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" });
const dayHour = (d) => `${shortDate.format(d)} ${hourOnly.format(d)}h`;

const escapeHtml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Hour starts of a window of `count` hours that ends `endOffset` hours before the current full
// hour. Brazil has no daylight saving time, so every day has 24 hours.
function hourWindow(now, count, endOffset = 0) {
  const end = Math.floor(new Date(now).getTime() / HOUR_MS) * HOUR_MS - endOffset * HOUR_MS;
  return Array.from({ length: count }, (_, i) => new Date(end - (count - i) * HOUR_MS));
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

function buildReport(current, previous, hours) {
  const conversion = current.quotes ? Math.round((current.confirms / current.quotes) * 100) : 0;
  const avgTicket = current.confirms ? current.valueBRL / current.confirms : 0;
  const avgHours = current.confirms ? current.hours / current.confirms : 0;
  const daily = hours.length <= 24;
  const endsAt = new Date(hours[hours.length - 1].getTime() + HOUR_MS);
  const period = daily
    ? `${dayHour(hours[0])} a ${dayHour(endsAt)}`
    : `${shortDate.format(hours[0])} a ${shortDate.format(new Date(endsAt.getTime() - 1))}`;
  const title = daily ? "Relatório diário" : `Relatório de ${Math.round(hours.length / 24)} dias`;

  // Daily: hour by hour (only hours with activity). Longer periods: day by day.
  const timeline = [];
  if (daily) {
    current.perHour.forEach((h, i) => {
      if (h.quotes || h.confirms) timeline.push([`${dayHour(hours[i])}–${hourOnly.format(new Date(hours[i].getTime() + HOUR_MS))}h`, String(h.quotes), String(h.confirms)]);
    });
  } else {
    const byDay = new Map();
    current.perHour.forEach((h, i) => {
      const label = weekday.format(hours[i]);
      const row = byDay.get(label) || [label, 0, 0];
      row[1] += h.quotes;
      row[2] += h.confirms;
      byDay.set(label, row);
    });
    byDay.forEach((row) => timeline.push([row[0], String(row[1]), String(row[2])]));
  }
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
      <div style="font-size:13px;text-transform:uppercase;letter-spacing:1px">${title} do site</div>
      <div style="font-size:24px;font-weight:800;text-transform:uppercase">Paredão 011 · ${period}</div>
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
    ${table(daily ? "Hora a hora" : "Dia a dia", timeline, [daily ? "Horário" : "Dia", "Orçamentos", "Confirmados"])}
    <p style="font-size:12px;color:#4a463d;margin-top:26px">"Confirmados" conta quem tocou em "Confirmar Orçamento no WhatsApp"; a conversa e o fechamento acontecem no WhatsApp.
    Os números são anônimos: o site guarda só contagens, cidade e valores estimados, nunca nome ou endereço.</p>
  </div></body></html>`;

  const text = [
    `Paredão 011 · ${title.toLowerCase()} · ${period}`,
    `Orçamentos calculados: ${current.quotes} (${change(current.quotes, previous.quotes)})`,
    `Confirmados no WhatsApp: ${current.confirms} (${conversion}%)`,
    `Valor estimado confirmado: ${brl.format(current.valueBRL)}`,
    "",
    "De onde vieram:",
    ...cities.map((c) => `- ${c.name}: ${c.value}`)
  ].join("\n");

  const subject = `Paredão 011 · ${title} · ${current.quotes} orçamento${current.quotes === 1 ? "" : "s"} e ${current.confirms} confirmado${current.confirms === 1 ? "" : "s"} (${period})`;
  return { subject, html, text };
}

module.exports = async function handler(request, response) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return response.status(500).json({ error: "CRON_SECRET_NOT_SET" });
  const auth = (request.headers && request.headers.authorization) || "";
  if (auth !== `Bearer ${secret}`) return response.status(401).json({ error: "UNAUTHORIZED" });
  if (!stats.isConfigured()) return response.status(503).json({ error: "DATABASE_NOT_CONFIGURED" });

  const query = request.query || {};
  const days = Math.min(90, Math.max(1, parseInt(query.days, 10) || 1));
  const now = new Date();
  const hours = hourWindow(now, days * 24);
  let current;
  let previous;
  try {
    [current, previous] = await Promise.all([
      stats.readHours(hours),
      stats.readHours(hourWindow(now, days * 24, days * 24))
    ]);
  } catch {
    return response.status(502).json({ error: "DATABASE_UNAVAILABLE" });
  }
  const report = buildReport(current, previous, hours);

  if (query.dry === "1") {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    return response.status(200).send(report.html);
  }
  if (!mailer.isConfigured()) return response.status(500).json({ error: "SMTP_NOT_CONFIGURED" });
  try {
    const id = await mailer.send({ to: process.env.REPORT_EMAIL || DEFAULT_TO, ...report });
    await stats.cleanup().catch(() => {}); // housekeeping; never blocks the report
    return response.status(200).json({ sent: true, id, subject: report.subject });
  } catch (error) {
    return response.status(502).json({ error: String(error.message || "EMAIL_FAILED") });
  }
};

module.exports.buildReport = buildReport;
module.exports.hourWindow = hourWindow;
