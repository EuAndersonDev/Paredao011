// E-mail via SMTP with Nodemailer (no third-party HTTP API). Default: Gmail.
// Environment: SMTP_USER (the Gmail address) and SMTP_PASS (a Google "app password",
// not the normal password). Optional: SMTP_HOST, SMTP_PORT, REPORT_FROM.
const nodemailer = require("nodemailer");

let transport = null;

// Google shows app passwords as "abcd efgh ijkl mnop"; the real password has no spaces.
// Removing all whitespace makes a pasted value with spaces or a trailing newline work.
function cleanPassword(value) {
  return String(value || "").replace(/\s+/g, "");
}

function isConfigured() {
  return Boolean(transport || (process.env.SMTP_USER && process.env.SMTP_PASS));
}

function getTransport() {
  if (!transport) {
    const port = Number(process.env.SMTP_PORT || 465);
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port,
      secure: port === 465,
      auth: { user: String(process.env.SMTP_USER || "").trim(), pass: cleanPassword(process.env.SMTP_PASS) },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000
    });
  }
  return transport;
}

async function send({ to, subject, html, text }) {
  const from = process.env.REPORT_FROM || `"Paredão 011" <${process.env.SMTP_USER}>`;
  const info = await getTransport().sendMail({ from, to, subject, html, text });
  return info.messageId || null;
}

// Tests: use Nodemailer's JSON transport instead of a real SMTP server.
function _setTransport(t) {
  transport = t;
}

module.exports = { send, isConfigured, cleanPassword, _setTransport };
