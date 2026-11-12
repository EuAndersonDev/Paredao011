// Zero-dependency static build for Vercel: node scripts/build.mjs  ->  dist/
// - src/pages/*.html: expands <!-- @include path --> partials and fills the tokens below
// - src/styles/*.css and src/**/*.js: concatenated into one CSS file and one JS bundle per page
// - public/: copied as-is (text files get the same tokens)
// - JSON-LD is generated from the visible page content, so it can never say more than the page
// All values come from src/config.js.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const PUBLIC = join(ROOT, "public");
const DIST = join(ROOT, "dist");
const CONFIG = createRequire(import.meta.url)(join(SRC, "config.js"));
const BUSINESS = CONFIG.BUSINESS;

// ---------- bundles (order matters: dependencies first) ----------
const CSS = ["styles/base.css", "styles/site.css"];
const PAGES = {
  "index.html": {
    current: "home",
    js: ["components/hamburger-menu.js", "components/scroll-reveal.js", "components/parallax.js", "components/video-carousel.js"],
    bundle: "home.js"
  },
  "orcamento.html": {
    current: "orcamento",
    js: [
      "config.js", "lib/format.js", "lib/datetime.js", "lib/pricing.js", "lib/whatsapp.js",
      "simulator/result-view.js", "simulator/form.js", "simulator/simulator.js", "simulator/effects.js",
      "components/hamburger-menu.js", "components/parallax.js"
    ],
    bundle: "orcamento.js"
  }
};

// ---------- values ----------
const SITE_URL = String(CONFIG.SITE_URL || "").replace(/\/+$/, "");
if (!/^https:\/\/[^/]+$/.test(SITE_URL)) {
  throw new Error(`src/config.js: SITE_URL must be an absolute https origin, got "${CONFIG.SITE_URL}"`);
}
if (!/^55\d{10,11}$/.test(CONFIG.WHATSAPP_PHONE)) {
  throw new Error("src/config.js: WHATSAPP_PHONE must be 55 + DDD + number, digits only");
}
const BUILD_DATE = new Date().toISOString().slice(0, 10);
const phone = CONFIG.WHATSAPP_PHONE;
const PHONE_DISPLAY = `(${phone.slice(2, 4)}) ${phone.slice(4, -4)}-${phone.slice(-4)}`;
const PHONE_SCHEMA = `+55-${phone.slice(2, 4)}-${phone.slice(4, -4)}-${phone.slice(-4)}`;

const TOKENS = {
  __SITE_URL__: SITE_URL,
  __BUILD_DATE__: BUILD_DATE,
  __WHATSAPP_URL__: `https://wa.me/${phone}`,
  __PHONE_DISPLAY__: PHONE_DISPLAY,
  __INSTAGRAM_URL__: CONFIG.INSTAGRAM_URL
};

// A value still holding a {{PLACEHOLDER}} token counts as "not provided".
const isSet = (value) => typeof value === "string" && value.trim() !== "" && !/\{\{.+\}\}/.test(value);
const cities = (Array.isArray(BUSINESS.cities) ? BUSINESS.cities : []).filter(isSet);
const pending = Object.entries(BUSINESS)
  .filter(([, v]) => (Array.isArray(v) ? !v.some(isSet) : typeof v === "string" && !isSet(v)))
  .map(([k]) => k);

// ---------- helpers ----------
const escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const decodeHtml = (s) => s
  .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"")
  .replace(/&#39;/g, "'").replace(/&rarr;/g, "→").replace(/&larr;/g, "←").replace(/&copy;/g, "©").replace(/&amp;/g, "&");
const textOf = (html) => decodeHtml(html.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
// Function replacers so "$" in values is never treated as a replacement pattern.
const put = (text, marker, value) => text.replace(marker, () => value);
const fillTokens = (text) => Object.entries(TOKENS).reduce((acc, [k, v]) => acc.replaceAll(k, () => v), text);

function include(html, seen = []) {
  return html.replace(/^([ \t]*)<!-- @include ([\w/.-]+) -->\n?/gm, (_, indent, path) => {
    if (seen.includes(path)) throw new Error(`include cycle: ${path}`);
    return include(readFileSync(join(SRC, path), "utf8"), [...seen, path]);
  });
}

function jsonLd(data) {
  return `<script type="application/ld+json">\n${JSON.stringify(data, null, 2)}\n    </script>`;
}

function breadcrumb(items) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map(([name, path], i) => ({
      "@type": "ListItem", position: i + 1, name, item: `${SITE_URL}${path}`
    }))
  };
}

function homeGraph(html) {
  const businessId = `${SITE_URL}/#negocio`;
  const areaServed = cities.length
    ? cities.map((name) => ({ "@type": "City", name }))
    : [{ "@type": "AdministrativeArea", name: "Grande São Paulo" }];

  const business = {
    "@type": "LocalBusiness",
    "@id": businessId,
    name: BUSINESS.name,
    description: BUSINESS.description,
    url: `${SITE_URL}/`,
    telephone: PHONE_SCHEMA,
    image: `${SITE_URL}/og-image.jpg`,
    logo: `${SITE_URL}/img/icon-512.png`,
    areaServed,
    sameAs: [CONFIG.INSTAGRAM_URL, BUSINESS.googleBusinessUrl].filter(isSet)
  };
  if (isSet(BUSINESS.priceRange)) business.priceRange = BUSINESS.priceRange;
  if (isSet(BUSINESS.openingHours)) business.openingHours = BUSINESS.openingHours;

  const services = [...html.matchAll(/<article class="service-card[^"]*"[^>]*>([\s\S]*?)<\/article>/g)].map((m) => ({
    "@type": "Service",
    name: textOf((/<h3[^>]*>([\s\S]*?)<\/h3>/.exec(m[1]) || [])[1] || ""),
    description: textOf((/<p[^>]*>([\s\S]*?)<\/p>/.exec(m[1]) || [])[1] || ""),
    serviceType: "Aluguel de paredão de som",
    provider: { "@id": businessId },
    areaServed
  }));

  const faq = [...html.matchAll(/<details[^>]*>\s*<summary[^>]*>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/g)].map((m) => ({
    "@type": "Question",
    name: textOf(m[1]),
    acceptedAnswer: { "@type": "Answer", text: textOf(m[2]) }
  }));
  if (!services.length || !faq.length) throw new Error("index.html: services or FAQ not found for JSON-LD");

  return {
    "@context": "https://schema.org",
    "@graph": [
      business,
      ...services,
      { "@type": "FAQPage", "@id": `${SITE_URL}/#faq`, mainEntity: faq },
      breadcrumb([["Início", "/"]])
    ]
  };
}

function orcamentoGraph() {
  return {
    "@context": "https://schema.org",
    "@graph": [breadcrumb([["Início", "/"], ["Simulador de orçamento", "/orcamento"]])]
  };
}

function renderPage(file, page) {
  let html = include(readFileSync(join(SRC, "pages", file), "utf8"));

  html = html
    .replaceAll("__CURRENT_HOME__", page.current === "home" ? ' aria-current="page"' : "")
    .replaceAll("__CURRENT_ORCAMENTO__", page.current === "orcamento" ? ' aria-current="page"' : "");

  html = put(html, "<!-- @verification -->", isSet(BUSINESS.googleSiteVerification)
    ? `<meta name="google-site-verification" content="${escapeHtml(BUSINESS.googleSiteVerification)}">`
    : "<!-- google-site-verification: {{GOOGLE_SITE_VERIFICATION}} (preencha em src/config.js) -->");

  html = put(html, "<!-- @cities -->", cities.length
    ? cities.map((c) => `<li>${escapeHtml(c)}</li>`).join("\n                        ")
    : "<li>Grande São Paulo</li><!-- {{CITY_LIST}}: liste as cidades em src/config.js -->");

  const extra = [];
  if (isSet(BUSINESS.openingHoursLabel)) extra.push(`<li>Horário: ${escapeHtml(BUSINESS.openingHoursLabel)}</li>`);
  if (isSet(BUSINESS.priceRange)) extra.push(`<li>Faixa de preço: ${escapeHtml(BUSINESS.priceRange)}</li>`);
  if (isSet(BUSINESS.googleBusinessUrl)) extra.push(`<li><a href="${escapeHtml(BUSINESS.googleBusinessUrl)}" target="_blank" rel="noopener">Perfil da Paredão 011 no Google</a></li>`);
  html = put(html, "<!-- @business-extra -->", extra.join("\n                    "));

  html = fillTokens(html);
  if (html.includes("<!-- @jsonld -->")) {
    html = put(html, "<!-- @jsonld -->", jsonLd(page.current === "home" ? homeGraph(html) : orcamentoGraph()));
  }
  return html;
}

function assertResolved(name, text) {
  const left = text.match(/__[A-Z_]+__|<!-- @\w+[^>]*-->/);
  if (left) throw new Error(`${name}: unresolved build token ${left[0]}`);
}

function write(rel, text) {
  const dest = join(DIST, rel);
  mkdirSync(dirname(dest), { recursive: true });
  assertResolved(rel, text);
  writeFileSync(dest, text);
}

function copyPublic(dir) {
  for (const name of readdirSync(dir)) {
    const src = join(dir, name);
    const rel = relative(PUBLIC, src);
    if (statSync(src).isDirectory()) {
      copyPublic(src);
    } else if ([".txt", ".xml", ".webmanifest"].includes(extname(name))) {
      write(rel, fillTokens(readFileSync(src, "utf8")));
    } else {
      mkdirSync(dirname(join(DIST, rel)), { recursive: true });
      cpSync(src, join(DIST, rel));
    }
  }
}

// ---------- build ----------
rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST);
if (existsSync(PUBLIC)) copyPublic(PUBLIC);

write("css/site.css", CSS.map((f) => `/* ${f} */\n${readFileSync(join(SRC, f), "utf8")}`).join("\n"));

for (const [file, page] of Object.entries(PAGES)) {
  write(file, renderPage(file, page));
  write(`js/${page.bundle}`, page.js.map((f) => `/* ${f} */\n${readFileSync(join(SRC, f), "utf8")}`).join("\n;\n"));
}

console.log(`Built dist/ for ${SITE_URL} (lastmod ${BUILD_DATE}).`);
if (pending.length) console.log(`Pending placeholders in src/config.js (BUSINESS): ${pending.join(", ")}`);
