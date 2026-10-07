// Shared helpers for the video tooling: serve the BUILT extension (dist/) over http and open the
// panel in demo mode. Using dist (not the dev server) films exactly what users install, with no
// dev-server process to babysit.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import { chromium } from "playwright";

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DIST = path.resolve(HERE, "..", "..", "dist");

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json" };

export function serveDist(port = 5190) {
  if (!fs.existsSync(path.join(DIST, "panel.html"))) throw new Error("dist/panel.html missing — run `npm run build` at the repo root first");
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent((req.url || "/").split("?")[0]);
    const file = path.normalize(path.join(DIST, rel === "/" ? "panel.html" : rel));
    if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(port, "127.0.0.1", () => resolve({ server, url: `http://127.0.0.1:${port}/panel.html` })));
}

// viewport 1280x720 at 1.5x device scale = native 1920x1080 frames, with UI text large enough to
// read on a phone (LinkedIn). locale: "en" | "fr" (the app's own toggle is localStorage-driven).
export async function openDemo({ url, locale = "en", theme = "dark", viewport = { width: 1280, height: 720 }, deviceScaleFactor = 1.5 }) {
  // channel "chrome" = the installed Google Chrome, with Playwright's own throwaway profile (never
  // the user's sessions). Playwright's downloaded Chromium fails to start on some Windows setups
  // ("side-by-side configuration is incorrect").
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport, deviceScaleFactor });
  await context.addInitScript(([loc, th]) => {
    try {
      localStorage.setItem("colvio_tour_done", "1");   // no onboarding tour over the footage
      localStorage.setItem("colvio_locale", loc);
      localStorage.setItem("colvio_theme", th);
    } catch { /* storage blocked — the app still runs */ }
  }, [locale, theme]);
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", m => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", e => consoleErrors.push(String(e)));
  await page.goto(url);
  await page.getByRole("button", { name: /Demo Mode/i }).click();
  await page.waitForTimeout(800);
  return { browser, context, page, consoleErrors };
}

// Sidebar entries are buttons whose first line is the module label.
export async function openModule(page, label) {
  await page.locator("button", { hasText: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) }).first().click();
  await page.waitForTimeout(900);
}

// ── In-page overlay: captions, cursor, title cards (body-level, outside React's #root) ────────
export const OVERLAY = () => {
  const css = `
  #cv-cap{position:fixed;left:50%;bottom:34px;transform:translateX(-50%) translateY(14px);max-width:900px;width:calc(100% - 420px);
    background:rgba(11,14,20,.92);border:1px solid #2b3245;border-left:4px solid #0066FF;border-radius:10px;padding:12px 18px;
    color:#E8EAF0;font:15px/1.45 "Segoe UI",system-ui,sans-serif;z-index:2147483646;opacity:0;transition:opacity .35s,transform .35s;
    box-shadow:0 10px 40px rgba(0,0,0,.55);pointer-events:none}
  #cv-cap.on{opacity:1;transform:translateX(-50%) translateY(0)}
  #cv-cap.top{bottom:auto;top:70px}
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
    // pos "top" for chapters whose action happens in the lower half (result tables)
    caption(t, d, pos) { cap.innerHTML = `<b>${t}</b>${d}`; cap.classList.toggle("top", pos === "top"); cap.classList.add("on"); },
    hideCaption() { cap.classList.remove("on"); },
    cursor(x, y) { cur.style.transform = `translate(${x - 3}px,${y - 2}px)`; },
    ripple(x, y) { const r = document.createElement("div"); r.className = "cv-ripple"; r.style.left = x + "px"; r.style.top = y + "px"; document.body.appendChild(r); setTimeout(() => r.remove(), 600); },
    card(t, s, n) { card.innerHTML = `<div class="t">${t}</div><div class="s">${s}</div><div class="n">${n}</div>`; card.classList.add("on"); },
    hideCard() { card.classList.remove("on"); },
  };
};

// ── Helpers handed to each scene ─────────────────────────────────────────────────────────────
export function helpers(page) {
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
    async dblclick(loc) { const p = await moveTo(loc); if (p) await page.evaluate(([x, y]) => window.__cv.ripple(x, y), [p.x, p.y]); await loc.dblclick(); await wait(500); },
    // <select>: the cursor travels to it, then the option is picked (native dropdowns don't render in screencasts).
    async select(loc, option) { const p = await moveTo(loc); if (p) await page.evaluate(([x, y]) => window.__cv.ripple(x, y), [p.x, p.y]); await loc.selectOption(option); await wait(600); },
    async press(key) { await page.keyboard.press(key); await wait(400); },
    async scroll(dy) {
      const x = 1000, y = 520;
      await page.evaluate(([x, y]) => window.__cv.cursor(x, y), [x, y]); await wait(400);
      await page.mouse.move(x, y);
      for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, dy / 6); await wait(70); }
    },
  };
}

// ── Recording: CDP screencast → timestamped JPEG frames ──────────────────────────────────────
// Output resolutions: the viewport stays 1280×720 CSS px (same layout everywhere); the device scale
// factor sets the pixel density. 1440p gets YouTube's higher-bitrate encodes (sharper UI text).
export const RESOLUTIONS = { 1080: { dsf: 1.5, w: 1920, h: 1080 }, 1440: { dsf: 2, w: 2560, h: 1440 } };

export async function record(page, framesDir, { maxWidth = 1920, maxHeight = 1080 } = {}) {
  fs.rmSync(framesDir, { recursive: true, force: true }); fs.mkdirSync(framesDir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
    const file = `f${String(frames.length).padStart(6, "0")}.jpg`;
    fs.writeFileSync(path.join(framesDir, file), Buffer.from(data, "base64"));
    frames.push({ file, ts: metadata.timestamp });
    try { await cdp.send("Page.screencastFrameAck", { sessionId }); } catch { /* page closing */ }
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 90, maxWidth, maxHeight, everyNthFrame: 2 });
  return {
    frames,
    async stop() { await cdp.send("Page.stopScreencast"); await new Promise(r => setTimeout(r, 300)); return Date.now() / 1000; },
  };
}

export function ffmpeg(argv, label) {
  const r = spawnSync(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-y", ...argv], { stdio: ["ignore", "inherit", "inherit"] });
  if (r.status !== 0) throw new Error(`ffmpeg failed (${label})`);
}

export function encode(framesDir, frames, endTs, outFile, { width = 1920, height = 1080 } = {}) {
  const lines = ["ffconcat version 1.0"];
  frames.forEach((f, i) => {
    const next = i + 1 < frames.length ? frames[i + 1].ts : endTs;
    lines.push(`file '${f.file}'`, `duration ${Math.max(0.001, next - f.ts).toFixed(4)}`);
  });
  lines.push(`file '${frames[frames.length - 1].file}'`);
  const list = path.join(framesDir, "list.ffconcat");
  fs.writeFileSync(list, lines.join("\n"));
  ffmpeg(["-f", "concat", "-safe", "0", "-i", list, "-vf", `fps=30,scale=${width}:${height}:flags=lanczos,format=yuv420p`,
    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-movflags", "+faststart", outFile], path.basename(outFile));
}

// Optional soundtrack: the track loops under the whole video at low volume, fades in over 1.5 s and
// out over the last 2.5 s. Its licence is the caller's call (royalty-free, cleared for commercial use).
export function addMusic(videoFile, musicFile, durationS, volume = 0.16) {
  const tmp = videoFile.replace(/\.mp4$/, ".music.mp4");
  const fadeOut = Math.max(0, durationS - 2.5).toFixed(2);
  ffmpeg(["-i", videoFile, "-stream_loop", "-1", "-i", musicFile,
    "-filter_complex", `[1:a]volume=${volume},afade=t=in:st=0:d=1.5,afade=t=out:st=${fadeOut}:d=2.5[a]`,
    "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-t", durationS.toFixed(2), "-movflags", "+faststart", tmp],
    `${path.basename(videoFile)} + music`);
  fs.renameSync(tmp, videoFile);
}

export function cut(src, startS, endS, outFile) {
  ffmpeg(["-ss", startS.toFixed(2), "-to", endS.toFixed(2), "-i", src, "-c:v", "libx264", "-preset", "medium", "-crf", "18",
    "-movflags", "+faststart", outFile], path.basename(outFile));
}
