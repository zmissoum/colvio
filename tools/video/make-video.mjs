// Colvio product video — fully automated. Drives the BUILT extension (dist/) in demo mode with
// Playwright, records it through the Chrome DevTools screencast (sharper than Playwright's
// built-in recorder), overlays captions + an animated cursor + title cards, then encodes MP4
// 1080p with ffmpeg: one full tour per language + one clip per module.
//
//   node make-video.mjs            → EN + FR, full tour + clips
//   node make-video.mjs --lang=fr  → one language
//   node make-video.mjs --no-clips → full tours only
//   node make-video.mjs --music=music/track.mp3 → soundtrack under the tours (and so the clips)
//
// Only modules that show real content in demo mode are filmed (checked with recon/probe):
// System Ops (no jobs / traces / flow runs in demo) is left out.
import fs from "node:fs";
import path from "node:path";
import { HERE, RESOLUTIONS, serveDist, openDemo, OVERLAY, helpers, record, encode, cut, addMusic } from "./lib.mjs";
import loaderDeep from "./deep/loader.mjs";
import apitesterDeep from "./deep/apitester.mjs";
import schemaDeep from "./deep/schema.mjs";

// These scenes replay the first chapters of the module's deep dive (same actions, one source).
const fromDeep = (def, n) => async (h) => { for (const ch of def.chapters.slice(0, n)) await ch.run(h); };

const args = process.argv.slice(2);
const LANGS = args.find(a => a.startsWith("--lang="))?.split("=")[1]?.split(",") || ["en", "fr"];
const WITH_CLIPS = !args.includes("--no-clips");
const RES = RESOLUTIONS[args.find(a => a.startsWith("--res="))?.split("=")[1] || "1080"];
if (!RES) { console.error(`--res must be one of ${Object.keys(RESOLUTIONS).join(", ")}`); process.exit(2); }
const SUFFIX = RES.h === 1080 ? "" : `_${RES.h}`; // a 1440p render never overwrites the 1080p files
const MUSIC = args.find(a => a.startsWith("--music="))?.slice("--music=".length);
if (MUSIC && !fs.existsSync(MUSIC)) { console.error(`music file not found: ${MUSIC}`); process.exit(2); }
const OUT = path.join(HERE, "out", "video");

// ── Scenes ──────────────────────────────────────────────────────────────────────────────────
const SCENES = [
  { key: "explorer", en: ["Data Explorer", "Query any table with the Builder, OData, FetchXML or SQL. No 5,000-row cap, typed inline edits, exports in one click."],
    fr: ["Data Explorer", "Interrogez n'importe quelle table en Builder, OData, FetchXML ou SQL. Pas de plafond à 5 000 lignes, éditions typées, exports en un clic."],
    run: async (h) => { await h.open("Data Explorer"); await h.click(h.vis("Account")); await h.wait(900); await h.click(h.page.getByRole("button", { name: /Execute/ }).first()); await h.wait(2600); await h.hover(h.page.getByRole("button", { name: /Duplicates/ }).first()); await h.wait(1200); } },
  { key: "loader", en: ["Data Loader", "Paste from Excel or drop a CSV: columns mapped automatically, values checked by type, then a live per-row log — with dry run and rollback."],
    fr: ["Data Loader", "Collez depuis Excel ou déposez un CSV : colonnes mappées automatiquement, valeurs vérifiées selon leur type, puis un journal ligne par ligne — simulation et annulation comprises."],
    run: fromDeep(loaderDeep, 1) },
  { key: "recyclebin", en: ["Recycle Bin", "Deleted records with who deleted them and when — restored server-side, with every platform limit explained."],
    fr: ["Recycle Bin", "Les enregistrements supprimés, avec qui les a supprimés et quand — restaurés côté serveur, chaque limite de la plateforme expliquée."],
    run: async (h) => {
      await h.open("Recycle Bin"); await h.click(h.page.getByPlaceholder(/Search a table/)); await h.wait(700);
      await h.click(h.page.locator("button >> visible=true").filter({ hasText: /^Account \(account\)$/ }).first()); await h.wait(2600);
    } },
  { key: "showalldata", en: ["Show All Data", "Every field of a record with its type — and edit values, lookups included, straight through the API."],
    fr: ["Show All Data", "Tous les champs d'un enregistrement avec leur type — et l'édition des valeurs, lookups compris, directement via l'API."],
    run: async (h) => { await h.open("Show All Data"); await h.click(h.page.getByRole("button", { name: "Inspect", exact: true })); await h.wait(2200); await h.scroll(380); await h.wait(1800); } },
  { key: "apitester", en: ["API Tester", "A Postman for Dataverse on your own session: templates, JSON checked as you type, history, copy as cURL."],
    fr: ["API Tester", "Un Postman pour Dataverse, sur votre propre session : modèles, JSON vérifié à la frappe, historique, copie en cURL."],
    run: fromDeep(apitesterDeep, 1) },
  { key: "metadata", en: ["Metadata", "Tables, fields and option sets, with data-dictionary exports in one click and Virtual / Elastic filters."],
    fr: ["Metadata", "Tables, champs et option sets, avec export du dictionnaire de données en un clic et filtres Virtual / Elastic."],
    run: async (h) => { await h.open("Metadata"); await h.click(h.vis("Account")); await h.wait(2200); await h.click(h.page.locator("button >> visible=true").filter({ hasText: /^Virtual \(/ }).first()); await h.wait(1800); } },
  { key: "relationships", en: ["Relationships", "Every relationship of a table at a glance — business relations first, system plumbing one toggle away."],
    fr: ["Relationships", "Toutes les relations d'une table d'un coup d'œil — les relations métier d'abord, la plomberie système à un clic."],
    run: async (h) => { await h.open("Relationships"); await h.click(h.vis("Account")); await h.wait(3200); } },
  { key: "schema", en: ["Schema", "Build the data model: pick tables, follow the lookups and N:N lines, export it as PNG, SVG or Mermaid."],
    fr: ["Schema", "Construisez le modèle de données : choisissez les tables, suivez les lookups et les liens N:N, exportez en PNG, SVG ou Mermaid."],
    run: fromDeep(schemaDeep, 1) },
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
  { key: "licenses", en: ["Users & Licenses", "Every user's access mode, licence type, roles and last login — and their settings changed in bulk."],
    fr: ["Users & Licenses", "Le mode d'accès, la licence, les rôles et la dernière connexion de chaque utilisateur — et ses paramètres modifiés en masse."],
    run: async (h) => {
      await h.open("Users & Licenses"); await h.wait(1500);
      await h.click(h.page.getByRole("button", { name: "Bulk settings", exact: true })); await h.wait(2800);
    } },
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

// ── Main ─────────────────────────────────────────────────────────────────────────────────────
const { server, url } = await serveDist();
fs.mkdirSync(OUT, { recursive: true });
const summary = [];
const failures = []; // scene actions that failed — the run doubles as an e2e smoke test
try {
  for (const lang of LANGS) {
    const { browser, page, consoleErrors } = await openDemo({ url, locale: "en", deviceScaleFactor: RES.dsf }); // UI stays EN (mostly-EN app); captions follow lang
    await page.evaluate(OVERLAY);
    const h = helpers(page);
    const C = CARDS[lang];
    const framesDir = path.join(OUT, `frames_${lang}${SUFFIX}`);
    const rec = await record(page, framesDir, { maxWidth: RES.w, maxHeight: RES.h });
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
    const full = path.join(OUT, `colvio_tour_${lang}${SUFFIX}.mp4`);
    console.log(`[${lang}] ${rec.frames.length} frames, ${(endTs - rec.frames[0].ts).toFixed(1)} s — encoding…`);
    encode(framesDir, rec.frames, endTs, full, { width: RES.w, height: RES.h });
    if (MUSIC) addMusic(full, MUSIC, endTs - rec.frames[0].ts);
    if (WITH_CLIPS) {
      const clipDir = path.join(OUT, `clips_${lang}${SUFFIX}`); fs.mkdirSync(clipDir, { recursive: true });
      const offset = t0 - rec.frames[0].ts; // wall-clock marks → video time
      marks.forEach((m, i) => cut(full, Math.max(0, m.start + offset - 0.2), m.end + offset, path.join(clipDir, `${String(i + 1).padStart(2, "0")}_${m.key}.mp4`)));
    }
    fs.rmSync(framesDir, { recursive: true, force: true });
    const toVideo = t0 - rec.frames[0].ts; // wall-clock marks → video time
    summary.push({ lang, file: full, seconds: +(endTs - rec.frames[0].ts).toFixed(1), scenes: marks.length, consoleErrors: errs,
      sceneStarts: marks.map(m => ({ key: m.key, at: +Math.max(0, m.start + toVideo).toFixed(1) })) }); // → YouTube chapters
  }
} finally { server.close(); }
fs.writeFileSync(path.join(OUT, `summary${SUFFIX}.json`), JSON.stringify(summary, null, 1));
for (const s of summary) console.log(`✓ ${s.lang}: ${s.file} (${s.seconds} s, ${s.scenes} scenes, console errors: ${s.consoleErrors.length})`);
const consoleErrorCount = summary.reduce((n, s) => n + s.consoleErrors.length, 0);
if (failures.length || consoleErrorCount) {
  console.log(`✗ smoke: ${failures.length} failed scene action(s) ${failures.join(", ")} · ${consoleErrorCount} console error(s)`);
  process.exitCode = 1;
}
