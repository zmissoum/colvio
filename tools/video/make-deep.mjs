// Per-module deep-dive videos: one module, every feature, chapter by chapter.
//
//   node make-deep.mjs --module=explorer            → EN + FR deep dive of one module
//   node make-deep.mjs --module=explorer --lang=fr
//   node make-deep.mjs --module=explorer --port=5201 → own port, to probe several modules in parallel
//   node make-deep.mjs --module=explorer --res=1440  → 2560×1440 instead of 1080p (sharper on YouTube)
//   node make-deep.mjs --module=explorer --music=music/track.mp3 → soundtrack under the video
//   node make-deep.mjs --module=explorer --probe    → no recording: screenshot each chapter's end
//                                                    state into out/deep-probe/ (to tune actions)
//
// Modules live in deep/<key>.mjs and export { key, label, tagline:{en,fr}, chapters:[…] } where a
// chapter is { key, en:[title, text], fr:[title, text], run: async (h) => … }.
import fs from "node:fs";
import path from "node:path";
import { HERE, RESOLUTIONS, serveDist, openDemo, OVERLAY, helpers, record, encode, addMusic } from "./lib.mjs";

const args = process.argv.slice(2);
const arg = (k) => args.find(a => a.startsWith(`--${k}=`))?.split("=")[1];
const MODULES = (arg("module") || "").split(",").filter(Boolean);
const LANGS = arg("lang")?.split(",") || ["en", "fr"];
const PROBE = args.includes("--probe");
const PORT = +(arg("port") || 5190);
const RES = RESOLUTIONS[arg("res") || "1080"];
if (!RES) { console.error(`--res must be one of ${Object.keys(RESOLUTIONS).join(", ")}`); process.exit(2); }
const SUFFIX = RES.h === 1080 ? "" : `_${RES.h}`; // a 1440p render never overwrites the 1080p files
const MUSIC = args.find(a => a.startsWith("--music="))?.slice("--music=".length);
if (MUSIC && !fs.existsSync(MUSIC)) { console.error(`music file not found: ${MUSIC}`); process.exit(2); }
if (!MODULES.length) { console.error("usage: node make-deep.mjs --module=explorer[,teams…] [--lang=fr] [--probe]"); process.exit(2); }

const NOTE = { en: "Demo data · every feature, step by step", fr: "Données de démo · chaque fonctionnalité, pas à pas" };
const OUTRO = {
  en: ["Get Colvio", "Chrome Web Store: “Colvio for Dynamics 365”", "Free forever · open source · github.com/zmissoum/colvio"],
  fr: ["Installez Colvio", "Chrome Web Store : « Colvio for Dynamics 365 »", "Gratuit · open source · github.com/zmissoum/colvio"],
};

const { server, url } = await serveDist(PORT);
const failures = [];
const summary = [];
try {
  for (const m of MODULES) {
    const def = (await import(`./deep/${m}.mjs`)).default;
    for (const lang of (PROBE ? ["en"] : LANGS)) {
      const { browser, page, consoleErrors } = await openDemo({ url, locale: "en", deviceScaleFactor: RES.dsf });
      await page.evaluate(OVERLAY);
      const h = helpers(page);
      const probeDir = path.join(HERE, "out", "deep-probe", m);
      const framesDir = path.join(HERE, "out", "deep", `frames_${m}_${lang}${SUFFIX}`);
      if (PROBE) fs.mkdirSync(probeDir, { recursive: true });
      const rec = PROBE ? null : await record(page, framesDir, { maxWidth: RES.w, maxHeight: RES.h });

      await page.evaluate(([t, s, n]) => window.__cv.card(t, s, n), [`Colvio · ${def.label}`, def.tagline[lang], NOTE[lang]]);
      await h.wait(PROBE ? 300 : 3400);
      await page.evaluate(() => window.__cv.hideCard()); await h.wait(500);

      for (const [i, ch] of def.chapters.entries()) {
        const [title, text] = ch[lang];
        await page.evaluate(([t, d, pos]) => window.__cv.caption(t, d, pos), [title, text, ch.pos || "bottom"]);
        try { await ch.run(h); }
        catch (e) { failures.push(`${m}/${lang}/${ch.key}`); console.log(`  ⚠ ${m} · ${ch.key} (${lang}): ${String(e).split("\n")[0].slice(0, 150)}`); }
        if (PROBE) await page.screenshot({ path: path.join(probeDir, `${String(i + 1).padStart(2, "0")}_${ch.key}.png`) });
        await h.wait(PROBE ? 100 : 500);
        await page.evaluate(() => window.__cv.hideCaption()); await h.wait(PROBE ? 100 : 450);
      }

      if (!PROBE) {
        await page.evaluate(([t, s, n]) => window.__cv.card(t, s, n), OUTRO[lang]);
        await h.wait(3800);
        const endTs = await rec.stop();
        await browser.close();
        fs.mkdirSync(path.join(HERE, "out", "deep"), { recursive: true });
        const out = path.join(HERE, "out", "deep", `colvio_${m}_${lang}${SUFFIX}.mp4`);
        console.log(`[${m}/${lang}] ${rec.frames.length} frames, ${(endTs - rec.frames[0].ts).toFixed(1)} s — encoding…`);
        encode(framesDir, rec.frames, endTs, out, { width: RES.w, height: RES.h });
        if (MUSIC) addMusic(out, MUSIC, endTs - rec.frames[0].ts);
        fs.rmSync(framesDir, { recursive: true, force: true });
        summary.push({ module: m, lang, file: out, seconds: +(endTs - rec.frames[0].ts).toFixed(1), consoleErrors: consoleErrors.filter(e => !/ws:\/\/|WebSocket|Failed to load resource/.test(e)) });
      } else {
        await browser.close();
        summary.push({ module: m, lang: "probe", file: probeDir, consoleErrors: consoleErrors.filter(e => !/ws:\/\/|WebSocket|Failed to load resource/.test(e)) });
      }
    }
  }
} finally { server.close(); }
for (const s of summary) console.log(`✓ ${s.module} ${s.lang}: ${s.file}${s.seconds ? ` (${s.seconds} s)` : ""} · console errors: ${s.consoleErrors.length}`);
const errs = summary.reduce((n, s) => n + s.consoleErrors.length, 0);
if (failures.length || errs) { console.log(`✗ ${failures.length} failed chapter action(s): ${failures.join(", ")} · ${errs} console error(s)`); process.exitCode = 1; }
