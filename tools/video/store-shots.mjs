// Chrome Web Store graphics, generated from the demo build:
//
//   node store-shots.mjs          → store/en/NN_<key>.png + store/fr/… (1280×800 screenshots)
//                                   store/promo_small_440x280.png, store/marquee_1400x560.png
//                                   out/linkedin/colvio_5_screens_<lang>.pdf (the 5 screenshots as a LinkedIn carousel)
//
// Each screenshot = a headline band over a real capture of the panel in demo mode (taken at 2×,
// so the UI text stays sharp once scaled into the frame). Square corners, full bleed, no alpha —
// as the store asks.
import fs from "node:fs";
import path from "node:path";
import { HERE, serveDist, openDemo, openModule, ffmpeg } from "./lib.mjs";

const REPO = path.resolve(HERE, "..", "..");
const OUT = path.join(REPO, "store");
const RAW = path.join(HERE, "out", "store-raw");
const vis = (p, t) => p.locator(`text="${t}" >> visible=true`).first();
const selectWith = (p, v) => p.locator("select >> visible=true").filter({ has: p.locator(`option[value="${v}"]`) }).first();

const SHOTS = [
  { key: "explorer",
    en: ["Query any Dataverse table", "Builder, OData, FetchXML or SQL · no 5,000-row cap · inline & bulk edits · Excel / CSV / JSON exports"],
    fr: ["Interrogez n'importe quelle table Dataverse", "Builder, OData, FetchXML ou SQL · sans plafond à 5 000 lignes · édition en ligne et en masse · exports Excel / CSV / JSON"],
    run: async (p) => {
      await openModule(p, "Data Explorer"); await vis(p, "Account").click(); await p.waitForTimeout(800);
      await selectWith(p, "accountnumber").selectOption("accountnumber");
      await selectWith(p, "startswith").selectOption("startswith");
      await p.getByPlaceholder("text").first().fill("ACC");
      await p.getByRole("button", { name: /Execute/ }).first().click(); await p.waitForTimeout(1500);
      // demo mode prints "· mock" where a live org prints the query time — hide it on the store image
      await p.evaluate(() => { for (const el of document.querySelectorAll("span")) if (el.textContent.trim() === "· mock") el.style.display = "none"; });
    } },
  { key: "showalldata",
    en: ["Every field of the record you're on", "Logical names, types and values in one grid — edit in place, lookups included, through the API"],
    fr: ["Tous les champs de l'enregistrement ouvert", "Noms logiques, types et valeurs sur une grille — éditables sur place, lookups compris, via l'API"],
    run: async (p) => {
      await openModule(p, "Show All Data");
      await p.getByRole("button", { name: "Inspect", exact: true }).click(); await p.waitForTimeout(1800);
    } },
  { key: "security",
    en: ["Who can do what — in plain words", "Role privileges as a table × operation matrix with depths, sensitive rights flagged, members and teams"],
    fr: ["Qui peut faire quoi — en clair", "Les privilèges d'un rôle en matrice table × opération avec profondeurs, droits sensibles signalés, membres et teams"],
    run: async (p) => {
      await openModule(p, "Security Audit"); await vis(p, "Sales Manager").click(); await p.waitForTimeout(1800);
      await p.getByRole("button", { name: "Matrix (by table)" }).click(); await p.waitForTimeout(1800);
    } },
  { key: "adoption",
    en: ["Who actually uses the CRM you pay for", "DAU / WAU / MAU, adoption per business unit, paid seats that never sign in — and a PowerPoint report"],
    fr: ["Qui utilise vraiment le CRM que vous payez", "DAU / WAU / MAU, adoption par business unit, licences jamais utilisées — et un rapport PowerPoint"],
    run: async (p) => { await openModule(p, "Adoption"); await p.waitForTimeout(2600); } },
  { key: "storage",
    en: ["See what fills your Dataverse capacity", "Row counts for every table in seconds, file storage per table, and the cleanup that applies"],
    fr: ["Voyez ce qui remplit votre capacité Dataverse", "Le volume de chaque table en quelques secondes, le stockage fichier par table, et le nettoyage adapté"],
    run: async (p) => { await openModule(p, "Storage"); await p.waitForTimeout(4500); } },
];

const b64 = (f) => fs.readFileSync(f).toString("base64");
const ICON = `data:image/png;base64,${b64(path.join(REPO, "icons", "icon128.png"))}`;
const BG = "radial-gradient(ellipse at 12% 0%,#123d94 0%,#0B0E14 58%)";
const BASE = `*{margin:0;box-sizing:border-box}body{overflow:hidden;background:${BG};font-family:"Segoe UI",system-ui,sans-serif;color:#fff;position:relative}`;

const shotHtml = (img, [title, sub]) => `<html><head><style>${BASE}
  body{width:1280px;height:800px}
  .head{position:absolute;left:80px;right:80px;top:38px;display:flex;align-items:center;gap:22px}
  .head img{width:64px;height:64px;flex:none}
  h1{font-size:38px;font-weight:800;letter-spacing:-.5px;line-height:1.1}
  p{font-size:18px;color:#bcd0f5;margin-top:8px;line-height:1.35}
  .shot{position:absolute;left:80px;top:158px;width:1120px;border-radius:12px 12px 0 0;border:1px solid #2b3a5c;border-bottom:none;
    box-shadow:0 24px 70px rgba(0,0,0,.65);overflow:hidden}
  .shot img{display:block;width:100%}
</style></head><body>
  <div class="head"><img src="${ICON}"><div><h1>${title}</h1><p>${sub}</p></div></div>
  <div class="shot"><img src="data:image/png;base64,${img}"></div>
</body></html>`;

const promoHtml = () => `<html><head><style>${BASE}
  body{width:440px;height:280px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
  img{width:76px;height:76px}
  .t{font-size:44px;font-weight:800;letter-spacing:-1px;margin-top:6px;line-height:1}
  .s{font-size:16px;color:#cfe0ff;margin-top:8px}
  .n{font-size:13px;color:#8fb0ea;margin-top:14px;padding:4px 12px;border:1px solid #2b4a85;border-radius:20px}
</style></head><body>
  <img src="${ICON}"><div class="t">Colvio</div><div class="s">for Dynamics 365 / Dataverse</div>
  <div class="n">Free · Open source · 21 modules</div>
</body></html>`;

const marqueeHtml = (img) => `<html><head><style>${BASE}
  body{width:1400px;height:560px}
  .txt{position:absolute;left:80px;top:0;bottom:0;width:470px;display:flex;flex-direction:column;justify-content:center}
  .brand{display:flex;align-items:center;gap:16px}
  .brand img{width:72px;height:72px}
  .brand span{font-size:54px;font-weight:800;letter-spacing:-1px}
  h1{font-size:30px;font-weight:700;line-height:1.2;margin-top:26px}
  p{font-size:18px;color:#bcd0f5;margin-top:14px;line-height:1.45}
  .shot{position:absolute;left:600px;top:70px;width:900px;border-radius:12px 0 0 0;border:1px solid #2b3a5c;border-right:none;border-bottom:none;
    box-shadow:0 24px 70px rgba(0,0,0,.65);overflow:hidden}
  .shot img{display:block;width:100%}
</style></head><body>
  <div class="txt">
    <div class="brand"><img src="${ICON}"><span>Colvio</span></div>
    <h1>The free toolkit Dynamics 365 has been missing</h1>
    <p>21 modules to query, load, inspect and audit Dataverse — right in your browser, with your own session.</p>
  </div>
  <div class="shot"><img src="data:image/png;base64,${img}"></div>
</body></html>`;

// Playwright PNGs carry an alpha channel: re-encode to 24-bit RGB as the store expects.
async function render(page, html, size, outFile) {
  await page.setViewportSize(size);
  await page.setContent(html);
  await page.waitForTimeout(250);
  const tmp = outFile + ".tmp.png";
  await page.screenshot({ path: tmp });
  ffmpeg(["-i", tmp, "-pix_fmt", "rgb24", outFile], path.basename(outFile));
  fs.rmSync(tmp);
}

fs.mkdirSync(RAW, { recursive: true });
const { server, url } = await serveDist(5191);
const failures = [];
try {
  const { browser, page, consoleErrors } = await openDemo({ url, viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
  for (const s of SHOTS) {
    try { await s.run(page); await page.screenshot({ path: path.join(RAW, `${s.key}.png`) }); console.log("captured", s.key); }
    catch (e) { failures.push(s.key); console.log(`  ⚠ ${s.key}: ${String(e).split("\n")[0].slice(0, 160)}`); }
  }
  const comp = await (await browser.newContext({ deviceScaleFactor: 1 })).newPage();
  for (const lang of ["en", "fr"]) {
    fs.mkdirSync(path.join(OUT, lang), { recursive: true });
    for (const [i, s] of SHOTS.entries()) {
      if (failures.includes(s.key)) continue;
      await render(comp, shotHtml(b64(path.join(RAW, `${s.key}.png`)), s[lang]), { width: 1280, height: 800 },
        path.join(OUT, lang, `${String(i + 1).padStart(2, "0")}_${s.key}.png`));
    }
  }
  // LinkedIn document post: one screenshot per page
  fs.mkdirSync(path.join(HERE, "out", "linkedin"), { recursive: true });
  for (const lang of ["en", "fr"]) {
    const pages = SHOTS.filter(s => !failures.includes(s.key)).map((s, i) =>
      `<img src="data:image/png;base64,${b64(path.join(OUT, lang, `${String(i + 1).padStart(2, "0")}_${s.key}.png`))}">`).join("");
    await comp.setContent(`<html><head><style>@page{size:1280px 800px;margin:0}*{margin:0}img{display:block;width:1280px;height:800px;break-after:page}</style></head><body>${pages}</body></html>`);
    await comp.pdf({ path: path.join(HERE, "out", "linkedin", `colvio_5_screens_${lang}.pdf`), width: "1280px", height: "800px", printBackground: true });
  }
  await render(comp, promoHtml(), { width: 440, height: 280 }, path.join(OUT, "promo_small_440x280.png"));
  if (!failures.includes("explorer"))
    await render(comp, marqueeHtml(b64(path.join(RAW, "explorer.png"))), { width: 1400, height: 560 }, path.join(OUT, "marquee_1400x560.png"));
  await browser.close();
  const errs = consoleErrors.filter(e => !/ws:\/\/|WebSocket|Failed to load resource/.test(e));
  console.log(`✓ store graphics in ${OUT} · console errors: ${errs.length}`);
  if (failures.length || errs.length) { console.log("✗ failed:", failures.join(", "), errs); process.exitCode = 1; }
} finally { server.close(); }
