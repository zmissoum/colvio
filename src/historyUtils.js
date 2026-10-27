import { redactSql } from "./sqlNative.js";

// FetchXML redaction — condition values live in value="..." attributes and <value>...</value>
// children (IN lists). Blanket-blanking every value=... is safe: in FetchXML the attribute only
// carries user filter values. Idempotent, so the upgrade scrub can re-run it harmlessly.
export function redactFetchXml(xml) {
  return String(xml || "")
    .replace(/value\s*=\s*"[^"]*"/gi, 'value="..."')
    .replace(/value\s*=\s*'[^']*'/gi, "value='...'")
    .replace(/<value>[^<]*<\/value>/gi, "<value>...</value>");
}

// $filter redaction that PRESERVES trailing closing parens: the greedy [^&]* used to eat the
// paren closing an $expand(...) group, so the "structure" the redaction promises to keep was
// syntactically broken on restore (review finding). Values are still fully blanked.
const redactFilters = (str) => String(str || "").replace(/\$filter=[^&]*/g, (m) => "$filter=..." + ((/\)+$/.exec(m) || [""])[0]));


// Explorer query-history entry construction — PURE, unit-tested.
//
// Two invariants the tests pin down (both were user-hit when they lived untested in the
// component): (1) PRIVACY — filter VALUES are never persisted: the emitted query string is
// redacted to "$filter=..." and a builder snapshot's condition values are blanked; (2) a
// builder entry carries enough STRUCTURE (columns, condition fields+operators, sort, limit)
// to reopen in the Builder instead of dumping raw OData.

// API Tester history redaction — same privacy promise as Explorer history: VALUES never persist,
// STRUCTURE does. Path: every $filter's value goes to "...". Body: JSON keys survive, primitive
// values are blanked (strings→"", numbers→null, booleans kept — they're flags, not identities);
// a non-JSON body persists empty rather than verbatim. `redacted` tells the UI to say so.
export function redactApiRequest({ path, body }) {
  const safePath = redactFilters(path || "")
    .replace(/sql=[^&]*/gi, "sql=...")
    .replace(/fetchXml=[^&]*/gi, "fetchXml=...");
  let safeBody = "", bodyRedacted = false;
  if (body && body.trim()) {
    const blank = (v) => {
      if (Array.isArray(v)) return v.map(blank);
      if (v && typeof v === "object") { const o = {}; for (const [k, x] of Object.entries(v)) o[k] = blank(x); return o; }
      if (typeof v === "string") return "";
      if (typeof v === "number") return null;
      return v;
    };
    try { safeBody = JSON.stringify(blank(JSON.parse(body)), null, 2); } catch { safeBody = ""; }
    bodyRedacted = true;
  }
  return { path: safePath, body: safeBody, redacted: bodyRedacted || safePath !== (path || "") };
}

export function buildHistoryEntry({ entityLogical, query, mode, fieldCount, ts, builderState }) {
  // 1000 (was 200): the old cap could chop a long $select mid-token, so a restored entry was
  // broken for a SECOND reason besides the redacted filter. Display still truncates at 80.
  // /g is load-bearing: a query can carry SEVERAL $filter segments ($expand's inner filter comes
  // BEFORE the top-level one in the emitted URL) — without it the first was redacted and the
  // real WHERE values persisted verbatim, breaking the privacy promise (audit finding).
  // SQL-mode entries carry raw SQL, not a URL — their WHERE values are redacted by redactSql
  // (the $filter regex never touched them: SQL history leaked literals — audit-class privacy fix).
  const redactedQuery = mode === "sql" ? redactSql(query || "")
    : mode === "fetchxml" ? redactFetchXml(query || "")  // raw XML — the $filter regex never touched it (review finding)
    : redactFilters(query || "");
  const safeQuery = redactedQuery.substring(0, 1000);
  const entry = { entity: entityLogical || "?", query: safeQuery, mode, fields: fieldCount, ts };
  if (mode === "builder" && builderState) {
    let redacted = 0;
    const blank = (conds) => (conds || []).map(c => { if (c.value) redacted++; return { field: c.field, op: c.op, value: "" }; });
    // REL / EXPAND: the same promise as the WHERE — their STRUCTURE (relation, columns, condition
    // fields + operators, mode) is kept so the Builder reopens whole; their condition VALUES are
    // blanked and counted. Target-table metadata (allFields) is refetched on restore, never stored.
    const expands = (builderState.expands || []).filter(ex => ex && ex.navProperty && (ex.fields || []).length).map(ex => ({
      navProperty: ex.navProperty, targetEntity: ex.targetEntity, lookupField: ex.lookupField, type: ex.type || "single",
      fields: [...ex.fields], conditions: blank(ex.conditions), conditionLogic: ex.conditionLogic || "and",
    }));
    const relFilters = (builderState.relFilters || []).filter(rf => rf && rf.navProperty).map(rf => ({
      navProperty: rf.navProperty, targetEntity: rf.targetEntity, lookupField: rf.lookupField, type: rf.type || "single",
      mode: rf.mode || "any", conditions: blank(rf.conditions), conditionLogic: rf.conditionLogic || "and",
    }));
    entry.builder = {
      fields: builderState.fields,
      filterGroups: (builderState.filterGroups || []).map(g => ({ logic: g.logic, conditions: blank(g.conditions) })),
      groupLogic: builderState.groupLogic,
      limit: builderState.limit,
      orderBy: builderState.orderBy,
      expands,
      relFilters,
      redacted,
      // kept for entries written before the clauses were snapshotted (their restore says so)
      hadRel: !!builderState.hadRel || relFilters.length > 0,
      hadExpand: !!builderState.hadExpand || expands.length > 0,
    };
  }
  return entry;
}

// Upgrade scrub — entries persisted by OLDER versions predate the redactions above (SQL and
// FetchXML literals, over-eaten parens, raw API Tester bodies) and would otherwise sit in
// chrome.storage forever. Both scrubs are idempotent re-applications of the current redactions;
// `changed` tells the caller whether a write-back is worth it.
export function scrubStoredHistory(list) {
  let changed = false;
  const out = (Array.isArray(list) ? list : []).map(e => {
    if (!e || typeof e !== "object" || typeof e.query !== "string") return e;
    const q = e.mode === "sql" ? redactSql(e.query) : e.mode === "fetchxml" ? redactFetchXml(e.query) : redactFilters(e.query);
    if (q !== e.query) { changed = true; return { ...e, query: q }; }
    return e;
  });
  return { list: out, changed };
}

export function scrubApiEntries(list) {
  let changed = false;
  const out = (Array.isArray(list) ? list : []).map(e => {
    if (!e || typeof e !== "object") return e;
    const safe = redactApiRequest({ path: typeof e.path === "string" ? e.path : "", body: typeof e.body === "string" ? e.body : "" });
    if (safe.path !== e.path || safe.body !== (e.body || "")) { changed = true; return { ...e, path: safe.path, body: safe.body, redacted: true }; }
    return e;
  });
  return { list: out, changed };
}
