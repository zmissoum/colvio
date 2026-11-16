import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { confirmAsk, confirmProdAsk, setConfirmSink } from "../confirmService.js";

afterEach(() => { setConfirmSink(null); delete globalThis.window; });

describe("confirmService — the app's own confirmation dialog", () => {
  it("hands each request to the mounted host and resolves with its answer (only true is a yes)", async () => {
    const seen = [];
    setConfirmSink((r) => seen.push(r));
    const a = confirmAsk("Delete 3 rows?", { title: "Delete", ok: "Delete", danger: true });
    const b = confirmAsk("Second");
    expect(seen.map(r => [r.title, r.message, r.ok, r.cancel, r.danger])).toEqual([["Delete", "Delete 3 rows?", "Delete", "Cancel", true], ["Please confirm", "Second", "OK", "Cancel", false]]);
    seen[0].resolve(true); seen[1].resolve("yes");
    expect(await a).toBe(true);
    expect(await b).toBe(false);
  });
  it("requests made before the host mounted wait for it, without a native fallback when there is no window", async () => {
    const p = confirmAsk("Early");
    const seen = [];
    setConfirmSink((r) => seen.push(r));
    expect(seen.map(r => r.message)).toEqual(["Early"]);
    seen[0].resolve(false);
    expect(await p).toBe(false);
  });
  it("with no host but a window, falls back to the native dialog — never a silent yes", async () => {
    globalThis.window = { confirm: (t) => t.includes("Proceed?") };
    expect(await confirmAsk("Proceed?", { title: "T" })).toBe(true);
    globalThis.window = { confirm: () => undefined };
    expect(await confirmAsk("x")).toBe(false);
  });
  it("confirmProdAsk asks on production only, with the production wording", async () => {
    const seen = [];
    setConfirmSink((r) => seen.push(r));
    expect(await confirmProdAsk(false, "Delete 5 records")).toBe(true);
    expect(seen).toHaveLength(0);
    const p = confirmProdAsk(true, "Delete 5 records");
    expect(seen[0]).toMatchObject({ title: "⚠ PRODUCTION environment", message: "Delete 5 records\n\nThis affects live production data. Continue?", ok: "Continue", danger: true });
    seen[0].resolve(false);
    expect(await p).toBe(false);
  });
});

// A source scan: the synchronous helpers are gone for good. A Promise is truthy, so a leftover
// `if (!confirmProd(...))` style call would proceed without asking — and a native confirm() never
// shows in the product videos.
describe("no native or synchronous confirmation left in the app", () => {
  const SRC = path.resolve(__dirname, "..");
  const files = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== "__tests__") walk(p); } else if (/\.(js|jsx)$/.test(e.name)) files.push(p); } };
  walk(SRC);
  it("no window.confirm / window.prompt / confirmProd( outside confirmService.js", () => {
    const hits = [];
    for (const f of files) {
      if (f.endsWith("confirmService.js")) continue;
      fs.readFileSync(f, "utf8").split(/\r?\n/).forEach((l, i) => { if (/window\.(confirm|prompt)\s*\(|\bconfirmProd\s*\(/.test(l)) hits.push(`${path.relative(SRC, f)}:${i + 1}`); });
    }
    expect(hits).toEqual([]);
  });
  it("every confirmAsk / confirmProdAsk call is awaited (or returned)", () => {
    const hits = [];
    for (const f of files) {
      if (f.endsWith("confirmService.js")) continue;
      fs.readFileSync(f, "utf8").split(/\r?\n/).forEach((line, i) => {
        if (/^\s*(\/\/|\*)/.test(line)) return; // comments describe the helpers, they don't call them
        for (const m of line.matchAll(/(.{0,12})\bconfirm(?:Prod)?Ask\s*\(/g)) {
          if (!/(await|return)\s*\(?\s*$/.test(m[1])) hits.push(`${path.relative(SRC, f)}:${i + 1} …${m[1]}confirm…Ask(`);
        }
      });
    }
    expect(hits).toEqual([]);
  });
});
