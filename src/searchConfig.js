// Metadata › 🔎 Search result columns — what Dataverse search shows and searches, per table. PURE.
//
// The global search box (Dataverse search) is configured by each table's Quick Find view:
//   · View columns (the layout's cells) = the columns SHOWN in that table's results, also offered
//     as filters;
//   · Find columns (the conditions of the filter flagged isquickfindfields) = the columns the
//     text is SEARCHED in — indexed as searchable, capped org-wide by Dataverse (1,000);
// plus the table's own switch (SyncToExternalSearchIndex). The search service's status says what
// the INDEX holds per table (searchable attributes, record count, last sync) when the environment
// exposes it. These helpers parse the view's XML and the status answer and join them per table;
// the component only renders.

const attrsOf = (tag) => { const o = {}; for (const m of String(tag).matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) o[m[1].toLowerCase()] = m[2] ?? m[3] ?? ""; return o; };
const truthy = (v) => v === "1" || String(v).toLowerCase() === "true";
const uniq = (arr) => [...new Set(arr.filter(Boolean))];

// A Quick Find view's fetchxml + layoutxml → { findColumns, resultColumns } (logical names, in
// the view's order). The quick-find filter is read up to its own closing tag: a nested filter
// inside it (never seen in a Quick Find view) would end the read early.
export function parseQuickFind(fetchxml, layoutxml) {
  const fx = String(fetchxml || ""), lx = String(layoutxml || "");
  const find = [];
  for (const f of fx.matchAll(/<filter\b([^>]*)>([\s\S]*?)<\/filter>/gi)) {
    if (!truthy(attrsOf(f[1]).isquickfindfields)) continue;
    for (const c of f[2].matchAll(/<condition\b([^>]*?)\/?>/gi)) { const a = attrsOf(c[1]); if (a.attribute) find.push(a.attribute); }
  }
  const result = [];
  for (const c of lx.matchAll(/<cell\b([^>]*?)\/?>/gi)) { const a = attrsOf(c[1]); if (a.name && !truthy(a.ishidden)) result.push(a.name); }
  if (!result.length) for (const a of fx.matchAll(/<attribute\b([^>]*?)\/?>/gi)) { const at = attrsOf(a[1]); if (at.name) result.push(at.name); }
  return { findColumns: uniq(find), resultColumns: uniq(result) };
}

// The search service's status, whatever its wrapping (the v2 endpoint's { value: {...} }, the
// older function's { response: "<json>" }, a bare object) → { status, tables: { logical → { status,
// lastSync, records, searchable } } }; null when it isn't a status answer at all.
export function parseSearchStatus(raw) {
  let v = raw;
  if (typeof v === "string") { try { v = JSON.parse(v); } catch { return null; } }
  if (v && typeof v === "object" && typeof v.response === "string") { try { v = JSON.parse(v.response); } catch { return null; } }
  if (v && typeof v === "object" && v.value && typeof v.value === "object" && !Array.isArray(v.value)) v = v.value;
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const list = v.entitystatusresults || v.EntityStatusResults || v.entityStatusResults;
  const status = v.status || v.Status || "";
  if (!Array.isArray(list) && !status) return null;
  const tables = {};
  for (const e of list || []) {
    if (!e || typeof e !== "object") continue;
    const name = String(e.entityname || e.logicalname || e.EntityName || e.LogicalName || e.name || "").toLowerCase();
    if (!name) continue;
    const rc = e.recordcount ?? e.RecordCount;
    const sa = e.searchableattributes || e.SearchableAttributes;
    tables[name] = {
      status: String(e.status || e.Status || ""),
      lastSync: e.lastsynctimeutc || e.LastSyncTimeUtc || null,
      records: Number.isFinite(Number(rc)) && rc !== null && rc !== "" ? Number(rc) : null,
      searchable: Array.isArray(sa) ? sa.map(String) : null,
    };
  }
  return { status: String(status), tables };
}

// Tables × their Quick Find view × the index → one row per table, enabled tables first.
// entities: [{ logical, display, set, isCustom, enabled, canEnable }]; views: [{ id, name, entity,
// fetchxml, layoutxml, isDefault, managed }]; status: parseSearchStatus()'s answer or null.
export function buildSearchTables({ entities, views, status }) {
  const byEntity = new Map();
  for (const v of views || []) {
    const k = String(v?.entity || "").toLowerCase();
    if (!k) continue;
    if (!byEntity.has(k) || (v.isDefault && !byEntity.get(k).isDefault)) byEntity.set(k, v);
  }
  const rows = (entities || []).map(e => {
    const logical = String(e.logical || "").toLowerCase();
    const v = byEntity.get(logical) || null;
    const view = v ? { id: v.id, name: v.name || "Quick Find", managed: !!v.managed, ...parseQuickFind(v.fetchxml, v.layoutxml) } : null;
    const index = status?.tables?.[logical] || null;
    const notes = [];
    if (e.enabled && !view) notes.push({ level: "warn", text: "No Quick Find view: nothing is searched or shown for this table" });
    if (e.enabled && view && !view.findColumns.length) notes.push({ level: "warn", text: "No Find column: no typed text can match this table's records" });
    if (e.enabled && view && !view.resultColumns.length) notes.push({ level: "warn", text: "No View column: a result of this table shows its name only" });
    if (e.enabled && view && index?.searchable) {
      const idx = new Set(index.searchable.map(s => s.toLowerCase()));
      const missing = view.findColumns.filter(c => !idx.has(c.toLowerCase()));
      if (missing.length) notes.push({ level: "info", text: `Not reported as searchable by the index yet: ${missing.join(", ")} (a sync may be pending)` });
    }
    if (e.enabled && index?.status && !/complet|succe|ok|ready/i.test(index.status)) notes.push({ level: "info", text: `Index: ${index.status}` });
    if (!e.enabled && e.canEnable === false) notes.push({ level: "info", text: "Can't be enabled for search" });
    return { logical, display: e.display || logical, set: e.set || "", isCustom: !!e.isCustom, enabled: !!e.enabled, canEnable: e.canEnable ?? null, view, index, notes };
  });
  return rows.sort((a, b) => (Number(b.enabled) - Number(a.enabled)) || a.display.localeCompare(b.display));
}

export function searchSummary(rows) {
  const s = { tables: 0, enabled: 0, withView: 0, findColumns: 0, noView: 0, noFind: 0, indexed: 0 };
  for (const r of rows || []) {
    s.tables++;
    if (!r.enabled) continue;
    s.enabled++;
    if (r.view) { s.withView++; s.findColumns += r.view.findColumns.length; if (!r.view.findColumns.length) s.noFind++; } else s.noView++;
    if (r.index) s.indexed++;
  }
  return s;
}

export const SEARCH_HEADERS = ["Table", "Logical name", "Enabled for search", "Quick Find view", "Result columns (View columns)", "Searched columns (Find columns)", "Index status", "Indexed rows", "Last sync", "Notes"];
export function searchExportRows(rows) {
  return (rows || []).map(r => [
    r.display, r.logical, r.enabled ? "Yes" : "No", r.view ? r.view.name : "",
    r.view ? r.view.resultColumns.join(", ") : "", r.view ? r.view.findColumns.join(", ") : "",
    r.index?.status || "", r.index?.records ?? "", r.index?.lastSync || "", r.notes.map(n => n.text).join(" · "),
  ]);
}
