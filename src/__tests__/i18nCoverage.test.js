import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import en from "../locales/en.js";
import fr from "../locales/fr.js";

// Guards against the "anchored edit ate a key" regression class: v1.11.127 inserted new keys
// using `"nav.apps": …` as the edit anchor and silently DELETED it from both locales — the
// sidebar then showed the raw key. Any key referenced as a string literal (t("…"), titleKey,
// bodyKey) must exist in BOTH locales; and the two locales must stay key-for-key symmetric.

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "__tests__" || e.name === "locales" || e.name === "node_modules") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(jsx|js)$/.test(e.name)) files.push(p);
  }
})(SRC);

const used = new Set();
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  for (const m of src.matchAll(/\bt\(\s*"([^"]+)"\s*[),]/g)) used.add(m[1]);
  for (const m of src.matchAll(/(?:titleKey|bodyKey):\s*"([^"]+)"/g)) used.add(m[1]); // HelpTab declares keys as data
}

describe("i18n coverage", () => {
  it("found a plausible number of used keys (the scanner itself works)", () => {
    expect(used.size).toBeGreaterThan(50);
  });
  it("every key used in the source exists in BOTH locales", () => {
    const missingEn = [...used].filter(k => !(k in en)).sort();
    const missingFr = [...used].filter(k => !(k in fr)).sort();
    expect({ missingEn, missingFr }).toEqual({ missingEn: [], missingFr: [] });
  });
  it("en and fr expose exactly the same keys", () => {
    const enKeys = new Set(Object.keys(en)), frKeys = new Set(Object.keys(fr));
    const onlyEn = [...enKeys].filter(k => !frKeys.has(k)).sort();
    const onlyFr = [...frKeys].filter(k => !enKeys.has(k)).sort();
    expect({ onlyEn, onlyFr }).toEqual({ onlyEn: [], onlyFr: [] });
  });
});
