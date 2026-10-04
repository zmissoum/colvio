// Shared helpers for the video tooling: serve the BUILT extension (dist/) over http and open the
// panel in demo mode. Using dist (not the dev server) films exactly what users install, with no
// dev-server process to babysit.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
export async function openDemo({ url, locale = "en", theme = "dark" }) {
  // channel "chrome" = the installed Google Chrome, with Playwright's own throwaway profile (never
  // the user's sessions). Playwright's downloaded Chromium fails to start on some Windows setups
  // ("side-by-side configuration is incorrect").
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 });
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
