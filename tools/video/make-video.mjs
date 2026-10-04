// Colvio product video — fully automated. Drives the BUILT extension (dist/) in demo mode with
// Playwright, records it through the Chrome DevTools screencast (sharper than Playwright's
// built-in recorder), overlays captions + an animated cursor + title cards, then encodes MP4
// 1080p with ffmpeg: one full tour per language + one clip per module.
//
//   node make-video.mjs            → EN + FR, full tour + clips
//   node make-video.mjs --lang=fr  → one language
//   node make-video.mjs --no-clips → full tours only
//
// Only modules that show real content in demo mode are filmed (checked with recon/probe):
// Data Loader, Recycle Bin, API Tester, System Ops and Schema wait for richer demo data.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import { HERE, serveDist, openDemo, openModule } from "./lib.mjs";

const args = process.argv.slice(2);
const LANGS = args.find(a => a.startsWith("--lang="))?.split("=")[1]?.split(",") || ["en", "fr"];
const WITH_CLIPS = !args.includes("--no-clips");
const OUT = path.join(HERE, "out", "video");

// ── Scenes ──────────────────────────────────────────────────────────────────────────────────
const SCENES = [
  { key: "explorer", en: ["Data Explorer", "Query any table with the Builder, OData, FetchXML or SQL. No 5,000-row cap, typed inline edits, exports in one click."],
    fr: ["Data Explorer", "Interrogez n'importe quelle table en Builder, OData, FetchXML ou SQL. Pas de plafond à 5 000 lignes, éditions typées, exports en un clic."],
    run: async (h) => { await h.open("Data Explorer"); await h.click(h.vis("Account")); await h.wait(900); await h.click(h.page.getByRole("button", { name: /Execute/ }).first()); await h.wait(2600); await h.hover(h.page.getByRole("button", { name: /Duplicates/ }).first()); await h.wait(1200); } },
  { key: "showalldata", en: ["Show All Data", "Every field of a record with its type — and edit values, lookups included, straight through the API."],
    fr: ["Show All Data", "Tous les champs d'un enregistrement avec leur type — et l'édition des valeurs, lookups compris, directement via l'API."],
    run: async (h) => { await h.open("Show All Data"); await h.click(h.page.getByRole("button", { name: "Inspect", exact: true })); await h.wait(2200); await h.scroll(380); await h.wait(1800); } },
  { key: "metadata", en: ["Metadata", "Tables, fields and option sets, with data-dictionary exports in one click and Virtual / Elastic filters."],
    fr: ["Metadata", "Tables, champs et option sets, avec export du dictionnaire de données en un clic et filtres Virtual / Elastic."],
    run: async (h) => { await h.open("Metadata"); await h.click(h.vis("Account")); await h.wait(2200); await h.click(h.page.locator("button >> visible=true").filter({ hasText: /^Virtual \(/ }).first()); await h.wait(1800); } },
  { key: "relationships", en: ["Relationships", "Every relationship of a table at a glance — business relations first, system plumbing one toggle away."],
    fr: ["Relationships", "Toutes les relations d'une table d'un coup d'œil — les relations métier d'abord, la plomberie système à un clic."],
    run: async (h) => { await h.open("Relationships"); await h.click(h.vis("Account")); await h.wait(3200); } },
  { key: "solutions", en: ["Solutions", "Solution components resolved by type — and compare two solutions, even across environments."],
    fr: ["Solutions", "Les composants d'une solution résolus par type — et la comparaison de deux solutions, même entre environnements."],
    run: async (h) => { await h.open("Solutions"); await h.click(h.vis("Colvio Demo Solution")); await h.wait(2600); await h.scroll(420); await h.wait(1500); } },
  { key: "automation", en: ["Automation", "Everything registered to run: plug-in steps, workflows, business rules, flows — with where each one comes from."],
    fr: ["Automation", "Tout ce qui est enregistré pour s'exécuter : steps de plug-ins, workflows, business rules, flows — avec leur origine."],
    run: async (h) => { await h.open("Automation"); await h.wait(2200); await h.click(h.page.locator("button >> visible=true").filter({ hasText: /^Workflows/ }).first()); await h.wait(2000); } },
  { key: "apps", en: ["Apps", "What each model-driven app really exposes — including the \"all forms / all views\" status the maker portal never shows."],
    fr: ["Apps", "Ce que chaque app model-driven expose vraiment — y compris le statut « tous les formulaires / toutes les vues » que le maker portal ne montre pas."],
    run: async (h) => { await h.open("Apps"); await h.click(h.vis("Sales Hub")); await h.wait(3200); } },
  { key: "envvars", en: ["Environment Variables", "Defaults versus overrides — and the variables with no value at all, the classic post-deployment trap, flagged first."],
    fr: ["Environment Variables", "Valeurs par défaut et overrides — et les variables sans aucune valeur, le piège classique après un déploiement, signalées en premier."],
    run: async (h) => { await h.open("Env Variables"); await h.wait(3600); } },
  { key: "translations", en: ["Translations", "Field labels in every language side by side — edit, export, re-import."],
    fr: ["Translations", "Les libellés dans toutes les langues côte à côte — édition, export, réimport."],
    run: async (h) => { await h.open("Translations"); await h.click(h.vis("Account")); await h.wait(3000); } },
  { key: "licenses", en: ["Users & Licenses", "Every user's access mode, licence type, security roles and last login."],
    fr: ["Users & Licenses", "Le mode d'accès, le type de licence, les rôles et la dernière connexion de chaque utilisateur."],
    run: async (h) => { await h.open("Users & Licenses"); await h.wait(1200); await h.click(h.page.locator("button >> visible=true").filter({ hasText: /Zakaria Missoum/ }).first()); await h.wait(2600); } },
  { key: "bu", en: ["Business Units", "The BU hierarchy and its members — with bulk moves by simply pasting a list of emails."],
    fr: ["Business Units", "La hiérarchie des BU et leurs membres — avec des déplacements en masse en collant simplement une liste d'emails."],
    run: async (h) => { await h.open("Business Units"); await h.wait(1800); await h.click(h.vis("Sales EU")); await h.wait(2400); } },
  { key: "security", en: ["Security Audit", "Every privilege of a role in plain words, with depth and sensitive flags — and who can do what, org-wide."],
    fr: ["Security Audit", "Chaque privilège d'un rôle en clair, avec sa profondeur et les droits sensibles signalés — et qui peut faire quoi, sur toute l'org."],
    run: async (h) => { await h.open("Security Audit"); await h.click(h.vis("Sales Manager")); await h.wait(3200); } },
  { key: "teams", en: ["Teams", "Teams and the security roles they carry — the rights a user inherits without them ever showing on the profile."],
    fr: ["Teams", "Les teams et les rôles qu'elles portent — les droits qu'un utilisateur hérite sans qu'ils apparaissent jamais sur sa fiche."],
    run: async (h) => { await h.open("Teams"); await h.click(h.vis("SG-D365-PROD-Users")); await h.wait(3200); } },
  { key: "adoption", en: ["Adoption", "Real usage: daily / weekly / monthly active users, adoption per business unit, inactive users — and a PowerPoint report in one click."],
    fr: ["Adoption", "L'usage réel : utilisateurs actifs par jour, semaine, mois, adoption par BU, inactifs — et un rapport PowerPoint en un clic."],
    run: async (h) => { await h.open("Adoption"); await h.wait(2400); await h.scroll(520); await h.wait(2000); } },
  { key: "logins", en: ["Login History", "Each user's sign-in timeline, straight from the audit log."],
    fr: ["Login History", "La chronologie des connexions de chaque utilisateur, directement depuis l'audit."],
    run: async (h) => { await h.open("Login History"); await h.type(h.page.locator("input >> visible=true").nth(1), "alex"); await h.wait(1200); await h.click(h.page.locator("button >> visible=true").filter({ hasText: /Alex/ }).first()); await h.wait(2600); } },
  { key: "storage", en: ["Storage", "Where your Dataverse capacity goes: rows per table for the whole org in seconds, and the real file bytes per table."],
    fr: ["Storage", "Où part votre capacité Dataverse : les lignes de chaque table de l'org en quelques secondes, et les vrais octets de fichiers par table."],
    run: async (h) => { await h.open("Storage"); await h.wait(2600); await h.scroll(560); await h.wait(2200); } },
];

const CARDS = {
  en: { introT: "Colvio", introS: "The free, open-source toolbox for Dynamics 365 & Dataverse", introN: "Runs in your browser, on your own session · demo data",
        outroT: "Get Colvio", outroS: "Chrome Web Store: “Colvio for Dynamics 365”", outroN: "Free forever · open source · github.com/zmissoum/colvio" },
  fr: { introT: "Colvio", introS: "La boîte à outils gratuite et open source pour Dynamics 365 & Dataverse", introN: "Dans votre navigateur, avec votre propre session · données de démo",
        outroT: "Installez Colvio", outroS: "Chrome Web Store : « Colvio for Dynamics 365 »", outroN: "Gratuit · open source · github.com/zmissoum/colvio" },
};

// ── In-page overlay: captions, cursor, title cards (body-level, outside React's #root) ────────
const OVERLAY = () => {
  const css = `
  #cv-cap{position:fixed;left:50%;bottom:34px;transform:translateX(-50%) translateY(14px);max-width:900px;width:calc(100% - 420px);
    background:rgba(11,14,20,.92);border:1px solid #2b3245;border-left:4px solid #0066FF;border-radius:10px;padding:12px 18px;
    color:#E8EAF0;font:15px/1.45 "Segoe UI",system-ui,sans-serif;z-index:2147483646;opacity:0;transition:opacity .35s,transform .35s;
    box-shadow:0 10px 40px rgba(0,0,0,.55);pointer-events:none}
  #cv-cap.on{opacity:1;transform:translateX(-50%) translateY(0)}
  #cv-cap b{display:block;font-size:18px;margin-bottom:3px;color:#fff}
  #cv-cur{position:fixed;left:0;top:0;width:22px;height:22px;z-index:2147483647;pointer-events:none;
    transition:transform .6s cubic-bezier(.4,.1,.2,1);transform:translate(640px,360px)}
  #cv-cur svg{filter:drop-shadow(0 2px 3px rgba(0,0,0,.6))}
  .cv-ripple{position:fixed;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;border:3px solid #3388FF;
    z-index:2147483646;pointer-events:none;animation:cvr .5s ease-out forwards}
  @keyframes cvr{from{transform:scale(.3);opacity:1}to{transform:scale(1.6);opacity:0}}
  #cv-card{position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;align-items:center;justify-content:center;
    background:radial-gradient(ellipse at 30% 20%,#103a8c 0%,#0B0E14 60%);color:#fff;font-family:"Segoe UI",system-ui,sans-serif;
    opacity:0;transition:opacity .45s;pointer-events:none;text-align:center;padding:0 60px}
  #cv-card.on{opacity:1}
  #cv-card .t{font-size:64px;font-weight:800;letter-spacing:-1px}
  #cv-card .s{font-size:24px;color:#cfe0ff;margin-top:10px}
  #cv-card .n{font-size:16px;color:#8fa6d6;margin-top:22px}`;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
  const cap = document.createElement("div"); cap.id = "cv-cap"; document.body.appendChild(cap);
  const cur = document.createElement("div"); cur.id = "cv-cur";
  cur.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M3 2l7.5 19 2.6-7.9L21 10.5z" fill="#fff" stroke="#0B0E14" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  document.body.appendChild(cur);
  const card = document.createElement("div"); card.id = "cv-card"; document.body.appendChild(card);
  window.__cv = {
    caption(t, d) { cap.innerHTML = `<b>${t}</b>${d}`; cap.classList.add("on"); },
    hideCaption() { cap.classList.remove("on"); },
    cursor(x, y) { cur.style.transform = `translate(${x - 3}px,${y - 2}px)`; },
    ripple(x, y) { const r = document.createElement("div"); r.className = "cv-ripple"; r.style.left = x + "px"; r.style.top = y + "px"; document.body.appendChild(r); setTimeout(() => r.remove(), 600); },
    card(t, s, n) { card.innerHTML = `<div class="t">${t}</div><div class="s">${s}</div><div class="n">${n}</div>`; card.classList.add("on"); },
    hideCard() { card.classList.remove("on"); },
  };
};

// ── Helpers handed to each scene ─────────────────────────────────────────────────────────────
function helpers(page) {
  const wait = (ms) => page.waitForTimeout(ms);
  const vis = (txt) => page.locator(`text="${txt}" >> visible=true`).first();
  const moveTo = async (loc) => {
    await loc.scrollIntoViewIfNeeded();
    const b = await loc.boundingBox();
    if (!b) return null;
    const x = b.x + Math.min(b.width / 2, 60), y = b.y + b.height / 2;
    await page.evaluate(([x, y]) => window.__cv.cursor(x, y), [x, y]);
    await wait(650);
    return { x, y };
  };
  return {
    page, wait, vis,
    async open(label) {
      const loc = page.locator("button", { hasText: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) }).first();
      const p = await moveTo(loc);
      if (p) await page.evaluate(([x, y]) => window.__cv.ripple(x, y), [p.x, p.y]);
      await loc.click(); await wait(900);
    },
    async click(loc) { const p = await moveTo(loc); if (p) await page.evaluate(([x, y]) => window.__cv.ripple(x, y), [p.x, p.y]); await loc.click(); await wait(500); },
    async hover(loc) { await moveTo(loc); },
    async type(loc, text) { await this.click(loc); await loc.pressSequentially(text, { delay: 90 }); },
    async scroll(dy) {
      const x = 1000, y = 520;
      await page.evaluate(([x, y]) => window.__cv.cursor(x, y), [x, y]); await wait(400);
      await page.mouse.move(x, y);
      for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, dy / 6); await wait(70); }
    },
  };
}

// ── Recording: CDP screencast → timestamped JPEG frames ──────────────────────────────────────
async function record(page, framesDir) {
  fs.rmSync(framesDir, { recursive: true, force: true }); fs.mkdirSync(framesDir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
    const file = `f${String(frames.length).padStart(6, "0")}.jpg`;
    fs.writeFileSync(path.join(framesDir, file), Buffer.from(data, "base64"));
    frames.push({ file, ts: metadata.timestamp });
    try { await cdp.send("Page.screencastFrameAck", { sessionId }); } catch { /* page closing */ }
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 90, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 2 });
  return {
    frames,
    async stop() { await cdp.send("Page.stopScreencast"); await new Promise(r => setTimeout(r, 300)); return Date.now() / 1000; },
  };
}

function ffmpeg(argv, label) {
  const r = spawnSync(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-y", ...argv], { stdio: ["ignore", "inherit", "inherit"] });
  if (r.status !== 0) throw new Error(`ffmpeg failed (${label})`);
}

function encode(framesDir, frames, endTs, outFile) {
  const lines = ["ffconcat version 1.0"];
  frames.forEach((f, i) => {
    const next = i + 1 < frames.length ? frames[i + 1].ts : endTs;
    lines.push(`file '${f.file}'`, `duration ${Math.max(0.001, next - f.ts).toFixed(4)}`);
  });
  lines.push(`file '${frames[frames.length - 1].file}'`);
  const list = path.join(framesDir, "list.ffconcat");
  fs.writeFileSync(list, lines.join("\n"));
  ffmpeg(["-f", "concat", "-safe", "0", "-i", list, "-vf", "fps=30,scale=1920:1080:flags=lanczos,format=yuv420p",
    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-movflags", "+faststart", outFile], path.basename(outFile));
}

function cut(src, startS, endS, outFile) {
  ffmpeg(["-ss", startS.toFixed(2), "-to", endS.toFixed(2), "-i", src, "-c:v", "libx264", "-preset", "medium", "-crf", "18",
    "-movflags", "+faststart", outFile], path.basename(outFile));
}

// ── Main ─────────────────────────────────────────────────────────────────────────────────────
const { server, url } = await serveDist();
fs.mkdirSync(OUT, { recursive: true });
const summary = [];
const failures = []; // scene actions that failed — the run doubles as an e2e smoke test
try {
  for (const lang of LANGS) {
    const { browser, page, consoleErrors } = await openDemo({ url, locale: "en" }); // UI stays EN (mostly-EN app); captions follow lang
    await page.evaluate(OVERLAY);
    const h = helpers(page);
    const C = CARDS[lang];
    const framesDir = path.join(OUT, `frames_${lang}`);
    const rec = await record(page, framesDir);
    const t0 = Date.now() / 1000;
    const marks = [];

    await page.evaluate((c) => window.__cv.card(c.introT, c.introS, c.introN), C);
    await h.wait(3800);
    await page.evaluate(() => window.__cv.hideCard()); await h.wait(600);

    for (const s of SCENES) {
      const start = Date.now() / 1000 - t0;
      const [title, desc] = s[lang];
      await page.evaluate(([t, d]) => window.__cv.caption(t, d), [title, desc]);
      try { await s.run(h); }
      catch (e) { failures.push(`${lang}/${s.key}`); console.log(`  ⚠ scene ${s.key} (${lang}) action failed: ${String(e).split("\n")[0].slice(0, 140)}`); }
      await h.wait(400);
      await page.evaluate(() => window.__cv.hideCaption()); await h.wait(450);
      marks.push({ key: s.key, start, end: Date.now() / 1000 - t0 });
    }

    await page.evaluate((c) => window.__cv.card(c.outroT, c.outroS, c.outroN), C);
    await h.wait(4200);
    const endTs = await rec.stop();
    await browser.close();

    const errs = consoleErrors.filter(e => !/ws:\/\/|WebSocket|Failed to load resource/.test(e));
    const full = path.join(OUT, `colvio_tour_${lang}.mp4`);
    console.log(`[${lang}] ${rec.frames.length} frames, ${(endTs - rec.frames[0].ts).toFixed(1)} s — encoding…`);
    encode(framesDir, rec.frames, endTs, full);
    if (WITH_CLIPS) {
      const clipDir = path.join(OUT, `clips_${lang}`); fs.mkdirSync(clipDir, { recursive: true });
      const offset = t0 - rec.frames[0].ts; // wall-clock marks → video time
      marks.forEach((m, i) => cut(full, Math.max(0, m.start + offset - 0.2), m.end + offset, path.join(clipDir, `${String(i + 1).padStart(2, "0")}_${m.key}.mp4`)));
    }
    fs.rmSync(framesDir, { recursive: true, force: true });
    summary.push({ lang, file: full, seconds: +(endTs - rec.frames[0].ts).toFixed(1), scenes: marks.length, consoleErrors: errs });
  }
} finally { server.close(); }
fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify(summary, null, 1));
for (const s of summary) console.log(`✓ ${s.lang}: ${s.file} (${s.seconds} s, ${s.scenes} scenes, console errors: ${s.consoleErrors.length})`);
const consoleErrorCount = summary.reduce((n, s) => n + s.consoleErrors.length, 0);
if (failures.length || consoleErrorCount) {
  console.log(`✗ smoke: ${failures.length} failed scene action(s) ${failures.join(", ")} · ${consoleErrorCount} console error(s)`);
  process.exitCode = 1;
}
