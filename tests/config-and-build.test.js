const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");

const ROOT = join(__dirname, "..");
const CONFIG = require("../src/config.js");

test("production config: every price is a positive number and the file is frozen", () => {
    for (const key of ["HOURLY_RATE_BRL", "CAR_KM_PER_LITER", "GASOLINE_PRICE_BRL_PER_LITER", "TOLL_VEHICLE_MULTIPLIER", "RESERVATION_DEPOSIT_PERCENT"]) {
        assert.ok(Number.isFinite(CONFIG[key]) && CONFIG[key] > 0, `${key} must be a positive number`);
    }
    assert.ok(Object.isFrozen(CONFIG));
    assert.match(CONFIG.WHATSAPP_PHONE, /^55\d{10,11}$/);
    assert.match(CONFIG.SITE_URL, /^https:\/\/[^/]+$/);
});

test("the API function reads the shared config and keeps the key server-side", () => {
    const source = readFileSync(join(ROOT, "api/trip.js"), "utf8");
    assert.match(source, /require\("\.\.\/src\/config\.js"\)/);
    assert.match(source, /process\.env\.GOOGLE_MAPS_API_KEY/);
    assert.equal(typeof require("../api/trip.js"), "function");
});

test("build output: pages, discovery files, no secrets, no leftover tokens", () => {
    execFileSync(process.execPath, [join(ROOT, "scripts/build.mjs")], { stdio: "pipe" });
    const dist = (p) => join(ROOT, "dist", p);
    for (const file of ["index.html", "orcamento.html", "robots.txt", "sitemap.xml", "llms.txt", "css/site.css", "js/home.js", "js/orcamento.js"]) {
        assert.ok(existsSync(dist(file)), file);
    }
    const bundle = readFileSync(dist("js/orcamento.js"), "utf8");
    assert.doesNotMatch(bundle, /AIza[0-9A-Za-z_-]{20,}|GOOGLE_MAPS_API_KEY|process\.env/);
    assert.match(readFileSync(dist("sitemap.xml"), "utf8"), new RegExp(`<loc>${CONFIG.SITE_URL}/orcamento</loc>`));
    assert.match(readFileSync(dist("robots.txt"), "utf8"), new RegExp(`Sitemap: ${CONFIG.SITE_URL}/sitemap.xml`));
    for (const page of ["index.html", "orcamento.html"]) {
        const html = readFileSync(dist(page), "utf8");
        assert.equal((html.match(/<h1[\s>]/g) || []).length, 1, `${page}: one h1`);
        assert.doesNotMatch(html, /__[A-Z_]+__/);
        assert.match(html, /<link rel="canonical" href="https:\/\//);
    }
});

test("every video, preview and poster referenced on the home page exists in the build", () => {
    const html = readFileSync(join(ROOT, "dist/index.html"), "utf8");
    const refs = [...html.matchAll(/(?:src|data-preview|data-poster)="(\/videos\/[^"]+)"/g)].map((m) => m[1]);
    assert.ok(refs.length >= 15, `expected full + preview + poster per video, found ${refs.length}`);
    for (const ref of refs) assert.ok(existsSync(join(ROOT, "dist", ref)), ref);
});

test("Content-Security-Policy allows exactly the inline script that is in the pages", () => {
    const { createHash } = require("node:crypto");
    const vercel = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8"));
    const csp = vercel.headers[0].headers.find((h) => h.key === "Content-Security-Policy").value;
    for (const page of ["index.html", "orcamento.html"]) {
        const html = readFileSync(join(ROOT, "dist", page), "utf8");
        const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
        assert.equal(inline.length, 1, `${page}: exactly one inline script`);
        const hash = createHash("sha256").update(inline[0]).digest("base64");
        assert.ok(csp.includes(`'sha256-${hash}'`), `${page}: inline script hash is in the CSP`);
        assert.doesNotMatch(html, / style="/, `${page}: no inline style attributes (blocked by style-src)`);
    }
    assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/);
});
