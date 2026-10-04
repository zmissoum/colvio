// Reconnaissance: open every module in demo mode, screenshot it and measure how much it shows,
// so the video only features modules that genuinely display something without a live org.
import fs from "node:fs";
import path from "node:path";
import { HERE, serveDist, openDemo, openModule } from "./lib.mjs";

const MODULES = ["Data Explorer", "Data Loader", "Recycle Bin", "Show All Data", "API Tester", "Metadata", "Automation", "Apps",
  "Relationships", "Schema", "Solutions", "Env Variables", "Translations", "Users & Licenses", "Business Units", "Security Audit",
  "Teams", "Adoption", "Login History", "Storage", "System Ops", "Help"];

const out = path.join(HERE, "out", "recon");
fs.mkdirSync(out, { recursive: true });
const { server, url } = await serveDist();
const { browser, page, consoleErrors } = await openDemo({ url });
const report = [];
for (const [i, label] of MODULES.entries()) {
  try {
    await openModule(page, label);
    const main = page.locator("main, body").first();
    const text = (await main.innerText()).replace(/\s+/g, " ");
    const file = `${String(i + 1).padStart(2, "0")}_${label.replace(/[^\w]+/g, "_")}.png`;
    await page.screenshot({ path: path.join(out, file) });
    const empties = (text.match(/No [a-z ]+(match|found|here|yet|loaded)[^.]*/gi) || []).slice(0, 3);
    report.push({ label, chars: text.length, empties, file });
  } catch (e) { report.push({ label, error: String(e).slice(0, 160) }); }
}
await browser.close(); server.close();
fs.writeFileSync(path.join(out, "report.json"), JSON.stringify({ report, consoleErrors }, null, 1));
for (const r of report) console.log(r.error ? `✗ ${r.label}: ${r.error}` : `${r.label.padEnd(18)} chars=${String(r.chars).padStart(5)} ${r.empties.length ? "EMPTY? " + r.empties.join(" | ") : ""}`);
console.log("console errors:", consoleErrors.filter(e => !/ws:\/\/|WebSocket/.test(e)).length);
