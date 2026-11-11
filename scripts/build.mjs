// Zero-dependency static build for Vercel.
// - Copies the deployable files into dist/
// - Replaces __SITE_URL__ / __BUILD_DATE__ using site.config.json (the single source for the domain)
// - Generates JSON-LD (LocalBusiness, Service, FAQPage, BreadcrumbList) from the visible page content
// - Renders the city list, optional business details and the Search Console verification tag
// Usage: node scripts/build.mjs
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const config = JSON.parse(readFileSync(join(ROOT, "site.config.json"), "utf8"));

const SITE_URL = String(config.siteUrl || "").replace(/\/+$/, "");
if (!/^https:\/\/[^/]+$/.test(SITE_URL)) {
  throw new Error(`site.config.json: siteUrl must be an absolute https origin, got "${config.siteUrl}"`);
}
const BUILD_DATE = new Date().toISOString().slice(0, 10);

// A value still holding a {{PLACEHOLDER}} token counts as "not provided".
const isSet = (value) => typeof value === "string" && value.trim() !== "" && !/\{\{.+\}\}/.test(value);
const cities = (Array.isArray(config.cities) ? config.cities : []).filter(isSet);
const pending = Object.entries(config)
  .filter(([, v]) => (Array.isArray(v) ? !v.some(isSet) : typeof v === "string" && !isSet(v)))
  .map(([k]) => k);

const COPY = [
  "index.html", "orcamento.html", "styles.css", "site.css", "site.js", "sim-fx.js", "app.js", "config.js",
  "fonts", "img", "gallery", "favicon.ico", "favicon-32x32.png", "apple-touch-icon.png", "og-image.jpg",
  "site.webmanifest", "robots.txt", "sitemap.xml", "llms.txt", "humans.txt"
];
const TEXT_EXT = new Set([".html", ".txt", ".xml", ".webmanifest", ".css", ".js"]);

const escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const decodeHtml = (s) => s
  .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"")
  .replace(/&#39;/g, "'").replace(/&rarr;/g, "→").replace(/&larr;/g, "←").replace(/&copy;/g, "©").replace(/&amp;/g, "&");
const textOf = (html) => decodeHtml(html.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

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
    name: config.name,
    description: config.description,
    url: `${SITE_URL}/`,
    telephone: config.telephone,
    image: `${SITE_URL}/og-image.jpg`,
    logo: `${SITE_URL}/img/icon-512.png`,
    areaServed,
    sameAs: [config.instagramUrl, config.googleBusinessUrl].filter(isSet)
  };
  if (isSet(config.priceRange)) business.priceRange = config.priceRange;
  if (isSet(config.openingHours)) business.openingHours = config.openingHours;

  const services = [...html.matchAll(/<article class="service-card[^"]*"[^>]*>([\s\S]*?)<\/article>/g)].map((m) => {
    const name = textOf((/<h3[^>]*>([\s\S]*?)<\/h3>/.exec(m[1]) || [])[1] || "");
    const description = textOf((/<p[^>]*>([\s\S]*?)<\/p>/.exec(m[1]) || [])[1] || "");
    return { "@type": "Service", name, description, serviceType: "Aluguel de paredão de som", provider: { "@id": businessId }, areaServed };
  });

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

function renderHtml(file, html) {
  const verification = isSet(config.googleSiteVerification)
    ? `<meta name="google-site-verification" content="${escapeHtml(config.googleSiteVerification)}">`
    : "<!-- google-site-verification: {{GOOGLE_SITE_VERIFICATION}} (preencha em site.config.json) -->";
  html = html.replace("<!-- @verification -->", () => verification);

  const citiesHtml = cities.length
    ? cities.map((c) => `<li>${escapeHtml(c)}</li>`).join("\n                        ")
    : "<li>Grande São Paulo</li><!-- {{CITY_LIST}}: liste as cidades em site.config.json -->";
  html = html.replace("<!-- @cities -->", () => citiesHtml);

  const extra = [];
  if (isSet(config.openingHoursLabel)) extra.push(`<li>Horário: ${escapeHtml(config.openingHoursLabel)}</li>`);
  if (isSet(config.priceRange)) extra.push(`<li>Faixa de preço: ${escapeHtml(config.priceRange)}</li>`);
  if (isSet(config.googleBusinessUrl)) extra.push(`<li><a href="${escapeHtml(config.googleBusinessUrl)}" target="_blank" rel="noopener">Perfil da Paredão 011 no Google</a></li>`);
  html = html.replace("<!-- @business-extra -->", () => extra.join("\n                    "));

  html = html.replaceAll("__SITE_URL__", SITE_URL);
  if (html.includes("<!-- @jsonld -->")) {
    const graph = jsonLd(file === "index.html" ? homeGraph(html) : orcamentoGraph());
    html = html.replace("<!-- @jsonld -->", () => graph);
  }
  return html;
}

function processFile(src, dest) {
  const rel = src.slice(ROOT.length + 1);
  if (!TEXT_EXT.has(extname(src))) {
    cpSync(src, dest);
    return;
  }
  let text = readFileSync(src, "utf8");
  if (extname(src) === ".html") text = renderHtml(rel, text);
  text = text.replaceAll("__SITE_URL__", SITE_URL).replaceAll("__BUILD_DATE__", BUILD_DATE);
  if (/__SITE_URL__|__BUILD_DATE__|<!-- @\w/.test(text)) throw new Error(`${rel}: unresolved build token`);
  writeFileSync(dest, text);
}

function copyEntry(rel) {
  const src = join(ROOT, rel);
  if (!existsSync(src)) throw new Error(`missing file: ${rel}`);
  const dest = join(DIST, rel);
  if (statSync(src).isDirectory()) {
    mkdirSync(dest, { recursive: true });
    for (const name of readdirSync(src)) copyEntry(join(rel, name));
  } else {
    mkdirSync(dirname(dest), { recursive: true });
    processFile(src, dest);
  }
}

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST);
for (const rel of COPY) copyEntry(rel);

console.log(`Built dist/ for ${SITE_URL} (lastmod ${BUILD_DATE}).`);
if (pending.length) console.log(`Placeholders still pending in site.config.json: ${pending.join(", ")}`);
