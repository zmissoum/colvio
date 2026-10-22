// Script Console rollback journal in storage — PURE (storage injected), unit-tested.
//
// A live run saves its journal every couple of seconds so a closed panel keeps what was written.
// Saving the whole journal each time costs O(n) per save, O(n²) per run: a 100k-write run would
// re-serialize ~30 MB every 2 s. Here the entries live in chunks of JOURNAL_CHUNK under
// "<key>#<n>" and the header (run, script, counts, rollback outcome) under "<key>"; a save writes
// only the chunks whose entries changed since the last save — the newest ones during a run, the
// undone ones during a rollback — plus the small header. Chunks are written before the header that
// counts them, so an interrupted save leaves the previous journal readable; chunks left over by a
// longer journal are removed after the header no longer counts them.
//
// Storage: get(keys[]) → Promise<{ key: value }>, set({ key: value }) → Promise<error message |
// null>, remove(keys[]) → Promise.
export const JOURNAL_CHUNK = 500;

// What can change in a chunk: entries appended (count, last seq), entries undone (undoneOps).
const chunkSig = (entries, from, to) => {
  let undone = 0;
  for (let i = from; i < to; i++) undone += entries[i]?.undoneOps || 0;
  return `${to - from}:${entries[from]?.seq}:${entries[to - 1]?.seq}:${undone}`;
};
const journalId = (j) => String(j?.runId || j?.at || "");

export function createJournalStore({ key, get, set, remove, size = JOURNAL_CHUNK }) {
  const chunkKey = (n) => `${key}#${n}`;
  let saved = null; // { id, sigs: [], chunks } — what storage holds, as far as this store knows
  let queue = Promise.resolve();

  async function known() {
    if (saved) return saved;
    let prev = null;
    try { prev = (await get([key]))?.[key] || null; } catch { prev = null; }
    saved = { id: null, sigs: [], chunks: Math.max(0, Number(prev?.chunks) || 0) };
    return saved;
  }

  async function write(j) {
    const entries = Array.isArray(j?.entries) ? j.entries : [];
    const s = await known();
    const id = journalId(j);
    if (s.id !== id) { s.id = id; s.sigs = []; } // another journal: every chunk is new
    const n = Math.ceil(entries.length / size);
    const sigs = [], writes = {};
    for (let c = 0; c < n; c++) {
      const from = c * size, to = Math.min(entries.length, from + size);
      sigs[c] = chunkSig(entries, from, to);
      if (s.sigs[c] !== sigs[c]) writes[chunkKey(c)] = entries.slice(from, to);
    }
    const head = { ...(j || {}) }; delete head.entries;
    const chunkWrites = Object.keys(writes);
    if (chunkWrites.length) {
      const err = await set(writes);
      if (err) { s.sigs = []; return err; } // the next save rewrites every chunk
    }
    const err = await set({ [key]: { ...head, v: 2, count: entries.length, chunks: n } });
    if (err) { s.sigs = []; return err; }
    const stale = [];
    for (let c = n; c < s.chunks; c++) stale.push(chunkKey(c));
    s.sigs = sigs; s.chunks = n;
    if (stale.length) { try { await remove(stale); } catch { /* left over, ignored: the header counts n */ } }
    return null;
  }

  return {
    // Saves are queued: each one sees the journal as it is when its turn comes.
    save(j) {
      const p = queue.then(() => write(j));
      queue = p.catch(() => null);
      return p;
    },
    async load() {
      const head = (await get([key]))?.[key];
      if (!head || typeof head !== "object") return null;
      if (Array.isArray(head.entries)) return head; // a journal saved whole (older build)
      const n = Math.max(0, Number(head.chunks) || 0);
      const keys = Array.from({ length: n }, (_, c) => chunkKey(c));
      const parts = n ? await get(keys) : {};
      const entries = [];
      for (const k of keys) { const part = parts?.[k]; if (!Array.isArray(part)) return null; entries.push(...part); }
      const count = Number(head.count);
      const j = { ...head, entries: entries.slice(0, Number.isFinite(count) ? count : entries.length) };
      delete j.v; delete j.count; delete j.chunks;
      // storage now known: the next save of this journal writes only what changes
      const s = await known();
      s.id = journalId(j); s.chunks = n;
      s.sigs = keys.map((_, c) => chunkSig(j.entries, c * size, Math.min(j.entries.length, (c + 1) * size)));
      return j;
    },
  };
}
