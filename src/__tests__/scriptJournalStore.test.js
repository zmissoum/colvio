import { describe, it, expect } from "vitest";
import { createJournalStore } from "../scriptJournalStore.js";
import { decodeBytes } from "../textDecode.js";

// An in-memory chrome.storage.local, counting what each save writes.
function memStorage() {
  const data = new Map(); const writes = [];
  return {
    data, writes,
    get: async (keys) => Object.fromEntries(keys.filter(k => data.has(k)).map(k => [k, structuredClone(data.get(k))])),
    set: async (obj) => { writes.push(Object.keys(obj)); for (const [k, v] of Object.entries(obj)) data.set(k, structuredClone(v)); return null; },
    remove: async (keys) => { for (const k of keys) data.delete(k); },
  };
}
const entry = (seq) => ({ seq, method: "PATCH", path: `accounts(${seq})`, inverse: [{ method: "PATCH", path: `/api/data/v9.2/accounts(${seq})`, body: {} }], reversible: "full" });
const KEY = "colvio_script_journal:https://org.crm4.dynamics.com";

describe("Script Console journal store", () => {
  it("a save during a run writes only the chunks that changed, plus the header", async () => {
    const st = memStorage();
    const store = createJournalStore({ key: KEY, ...st, size: 100 });
    const j = { at: "t0", runId: "r1", script: "s", entries: Array.from({ length: 250 }, (_, i) => entry(i + 1)), inProgress: true };
    expect(await store.save(j)).toBe(null);
    expect(st.writes.flat().sort()).toEqual([KEY, `${KEY}#0`, `${KEY}#1`, `${KEY}#2`].sort());
    st.writes.length = 0;
    j.entries.push(entry(251), entry(252)); // the run goes on
    await store.save(j);
    expect(st.writes).toEqual([[`${KEY}#2`], [KEY]]); // the last chunk, then the header counting it
    st.writes.length = 0;
    await store.save(j); // nothing new
    expect(st.writes).toEqual([[KEY]]);
    const back = await createJournalStore({ key: KEY, ...st, size: 100 }).load();
    expect(back.entries).toHaveLength(252);
    expect(back).toMatchObject({ runId: "r1", script: "s", inProgress: true });
    expect(back).not.toHaveProperty("chunks");
  });
  it("a rollback rewrites only the chunks holding the entries it undid", async () => {
    const st = memStorage();
    const store = createJournalStore({ key: KEY, ...st, size: 100 });
    const j = { at: "t0", runId: "r1", entries: Array.from({ length: 300 }, (_, i) => entry(i + 1)) };
    await store.save(j);
    const loaded = await createJournalStore({ key: KEY, ...st, size: 100 }).load();
    const store2 = createJournalStore({ key: KEY, ...st, size: 100 });
    await store2.load(); // knows what storage holds
    st.writes.length = 0;
    const entries = loaded.entries.map(e => ({ ...e }));
    entries[299].undoneOps = 1; entries[250].undoneOps = 1; // undone last-first
    await store2.save({ ...loaded, entries });
    expect(st.writes).toEqual([[`${KEY}#2`], [KEY]]);
  });
  it("another journal replaces the old one and removes its extra chunks", async () => {
    const st = memStorage();
    const store = createJournalStore({ key: KEY, ...st, size: 100 });
    await store.save({ at: "t0", runId: "r1", entries: Array.from({ length: 350 }, (_, i) => entry(i + 1)) });
    expect(st.data.has(`${KEY}#3`)).toBe(true);
    // a new panel (store knows nothing yet) saves a shorter journal
    await createJournalStore({ key: KEY, ...st, size: 100 }).save({ at: "t1", runId: "r2", entries: [entry(1)] });
    expect([...st.data.keys()].sort()).toEqual([KEY, `${KEY}#0`]);
    expect((await createJournalStore({ key: KEY, ...st }).load()).entries).toHaveLength(1);
  });
  it("a failed write is reported and the next save rewrites everything", async () => {
    const st = memStorage(); let full = true;
    const set = async (obj) => (full ? "QUOTA_BYTES quota exceeded" : st.set(obj));
    const store = createJournalStore({ key: KEY, get: st.get, set, remove: st.remove, size: 100 });
    const j = { at: "t0", runId: "r1", entries: [entry(1), entry(2)] };
    expect(await store.save(j)).toMatch(/quota/);
    full = false;
    expect(await store.save(j)).toBe(null);
    expect(st.writes.flat()).toContain(`${KEY}#0`);
  });
  it("still reads a journal saved whole by an older build", async () => {
    const st = memStorage();
    st.data.set(KEY, { at: "t0", entries: [entry(1)] });
    expect((await createJournalStore({ key: KEY, ...st }).load()).entries).toHaveLength(1);
  });
});

describe("text files: UTF-8, UTF-16 and Windows-1252", () => {
  const u8 = (...b) => new Uint8Array(b);
  it("decodes by BOM, then by validity", () => {
    expect(decodeBytes(u8(0xef, 0xbb, 0xbf, 0x61, 0x3b, 0x62))).toEqual({ text: "a;b", bom: true, encoding: "utf-8" });
    expect(decodeBytes(u8(0xff, 0xfe, 0x41, 0x00, 0x09, 0x00, 0xe9, 0x00)).text).toBe("A\té"); // Excel "Unicode Text"
    expect(decodeBytes(u8(0xfe, 0xff, 0x00, 0x41)).text).toBe("A");
    expect(decodeBytes(u8(0x43, 0x61, 0x66, 0xc3, 0xa9))).toMatchObject({ text: "Café", encoding: "utf-8" });
    expect(decodeBytes(u8(0x43, 0x61, 0x66, 0xe9, 0x3b, 0x80))).toMatchObject({ text: "Café;€", encoding: "windows-1252" }); // "CSV (semicolon)"
    expect(decodeBytes(u8(0x43, 0x61, 0x66, 0xe9), { legacy: false }).encoding).toBe("utf-8");
    expect(decodeBytes(new ArrayBuffer(0)).text).toBe("");
  });
});
