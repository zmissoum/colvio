// Record activity › save capture — pure helpers for background.js, which watches (read-only,
// chrome.webRequest) the Web API writes a Dynamics 365 tab sends: a form save, a ribbon action, a
// Colvio edit. Each write becomes a "save": which record, which COLUMN NAMES were sent (never the
// values), what came back, and the server's clock so the panel can find the plug-in traces and
// flow runs that save caused. Nothing here talks to the network.

const GUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const GUID_RE = new RegExp(`^${GUID}$`, "i");
const WRITE_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);
export const MAX_SAVES = 200;      // per org, newest kept
const MAX_COLUMNS = 200;
const MAX_OPS = 50;                // ops kept per save (a Loader $batch carries hundreds) — the count is kept
const MAX_BODY_BYTES = 512 * 1024; // bigger bodies (file uploads…) are not decoded

export const isWriteMethod = (m) => WRITE_METHODS.has(String(m || "").toUpperCase());

// A Web API URL (absolute, "/api/data/v9.2/…" or relative as inside a $batch) →
// { batch: true } | { entitySet, recordId, sub } | null.
export function parseWriteUrl(url) {
  let s = String(url || "").trim();
  if (!s) return null;
  const q = s.indexOf("?");
  if (q >= 0) s = s.slice(0, q);
  const api = s.match(/\/api\/data\/v\d+(?:\.\d+)?\/(.*)$/i);
  let rest = api ? api[1] : (/^https?:/i.test(s) ? null : s.replace(/^\/+/, ""));
  if (rest == null) return null;
  try { rest = decodeURIComponent(rest); } catch { /* keep as is */ }
  if (rest === "$batch") return { batch: true };
  const m = rest.match(new RegExp(`^([A-Za-z_][A-Za-z0-9_]*)(?:\\(\\{?(${GUID})\\}?\\))?(?:/(.+))?$`, "i"));
  if (!m) return null;
  return { entitySet: m[1], recordId: m[2] ? m[2].toLowerCase() : null, sub: m[3] || null };
}

// What kind of write it is. Bound actions keep their name (Microsoft.Dynamics.CRM.QualifyLead → QualifyLead).
export function writeKind(method, parsed) {
  const M = String(method || "").toUpperCase();
  if (!parsed || parsed.batch) return null;
  const sub = parsed.sub || "";
  if (/\$ref$/i.test(sub)) return M === "DELETE" ? "disassociate" : "associate";
  if (M === "POST" && !parsed.recordId && !sub) return "create";
  if (M === "POST" && parsed.recordId && sub) return "action";
  if ((M === "PATCH" || M === "PUT") && parsed.recordId) return "update";
  if (M === "DELETE" && parsed.recordId && !sub) return "delete";
  if (M === "DELETE" && parsed.recordId && sub) return "update"; // DELETE …(id)/column = clear one column
  return null;
}
export const actionName = (sub) => String(sub || "").split("/").pop().replace(/^Microsoft\.Dynamics\.CRM\./i, "");

// Request body bytes (webRequest requestBody.raw) → text, or null when absent / too big.
export function decodeRaw(raw) {
  if (!Array.isArray(raw) || !raw.length) return null;
  const parts = raw.map(r => r && r.bytes).filter(Boolean);
  const total = parts.reduce((n, b) => n + (b.byteLength || 0), 0);
  if (!total || total > MAX_BODY_BYTES) return null;
  const all = new Uint8Array(total);
  let at = 0;
  for (const b of parts) { all.set(new Uint8Array(b), at); at += b.byteLength; }
  try { return new TextDecoder("utf-8").decode(all); } catch { return null; }
}

// Column names of a JSON body. "primarycontactid@odata.bind" → "primarycontactid"; annotations skipped.
export function columnsFromBody(text) {
  if (!text) return [];
  let obj;
  try { obj = JSON.parse(text); } catch { return []; }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return [];
  const out = new Set();
  for (const k of Object.keys(obj)) {
    if (k.startsWith("@")) continue;
    if (/@odata\.bind$/i.test(k)) { out.add(k.replace(/@odata\.bind$/i, "")); continue; }
    if (k.includes("@")) continue;
    out.add(k);
  }
  return [...out].slice(0, MAX_COLUMNS);
}

// The writes inside a $batch body (changesets included). GET parts are ignored.
export function parseBatch(text) {
  if (!text) return [];
  const ops = [];
  const re = /^(POST|PATCH|PUT|DELETE)\s+(\S+)\s+HTTP\/1\.[01]\s*$/gim;
  let m;
  while ((m = re.exec(text))) {
    const after = text.slice(re.lastIndex);
    const hdrEnd = after.search(/\r?\n\r?\n/);
    let body = "";
    if (hdrEnd >= 0) {
      const from = after.slice(hdrEnd).replace(/^\r?\n\r?\n/, "");
      const end = from.search(/\r?\n--/);
      body = (end >= 0 ? from.slice(0, end) : from).trim();
    }
    const parsed = parseWriteUrl(m[2]);
    const kind = writeKind(m[1], parsed);
    if (!kind) continue;
    ops.push(opOf(kind, parsed, m[1].toUpperCase() === "PUT" && parsed.sub ? [parsed.sub] : columnsFromBody(body)));
  }
  return ops;
}

function opOf(kind, parsed, columns) {
  return {
    kind,
    entitySet: parsed.entitySet,
    recordId: parsed.recordId,
    action: kind === "action" ? actionName(parsed.sub) : null,
    columns: kind === "delete" ? [] : columns,
  };
}

// webRequest onBeforeRequest details → the save's opening half, or null when it isn't a write we track.
export function startSave(details) {
  if (!details || details.tabId == null || details.tabId < 0 || !isWriteMethod(details.method)) return null;
  const parsed = parseWriteUrl(details.url);
  if (!parsed) return null;
  let origin;
  try { origin = new URL(details.url).origin; } catch { return null; }
  const text = decodeRaw(details.requestBody && details.requestBody.raw);
  let ops;
  if (parsed.batch) {
    ops = parseBatch(text);
    if (!ops.length) return null; // a read-only $batch (the form loads data this way)
  } else {
    const kind = writeKind(details.method, parsed);
    if (!kind) return null;
    const cols = kind === "update" && parsed.sub && !/\$ref$/i.test(parsed.sub) ? [parsed.sub] : columnsFromBody(text);
    ops = [opOf(kind, parsed, cols)];
  }
  return { key: String(details.requestId), origin, tabId: details.tabId, t0: Math.round(details.timeStamp || Date.now()), batch: !!parsed.batch, ops: ops.slice(0, MAX_OPS), opCount: ops.length };
}

export const headerValue = (headers, name) => {
  const n = String(name).toLowerCase();
  const h = (headers || []).find(x => String(x && x.name).toLowerCase() === n);
  return h ? h.value : null;
};

// The id a create returned: OData-EntityId "https://org/api/data/v9.2/accounts(guid)".
export function idFromEntityId(value) {
  const m = String(value || "").match(new RegExp(`\\((${GUID})\\)\\s*$`, "i"));
  return m ? m[1].toLowerCase() : null;
}

// webRequest onCompleted / onErrorOccurred details → the finished save.
export function finishSave(save, details) {
  const headers = details.responseHeaders || [];
  const status = details.statusCode || 0;
  const created = idFromEntityId(headerValue(headers, "OData-EntityId"));
  const ops = save.ops.map(o => (o.kind === "create" && !o.recordId && created ? { ...o, recordId: created } : o));
  const dateHdr = headerValue(headers, "Date");
  const serverMs = dateHdr ? Date.parse(dateHdr) : NaN;
  const reqIds = [headerValue(headers, "x-ms-service-request-id"), headerValue(headers, "REQ_ID")]
    .flatMap(v => String(v || "").split(/[,\s]+/)).map(v => v.trim().toLowerCase()).filter(v => GUID_RE.test(v));
  return {
    ...save,
    ops,
    t1: Math.round(details.timeStamp || Date.now()),
    status,
    // A $batch answers 200 even when a change inside it failed — its outcome is read from the traces.
    ok: details.error ? false : save.batch ? null : status >= 200 && status < 300,
    error: details.error || null,
    requestIds: [...new Set(reqIds)],
    serverMs: Number.isFinite(serverMs) ? serverMs : null,
  };
}

// Newest first, capped — the per-org list background.js keeps in chrome.storage.session.
export function addSave(list, save) {
  return [save, ...(list || []).filter(s => s.key !== save.key)].slice(0, MAX_SAVES);
}

// The saves that touched one record, newest first, each with its ops on THAT record merged.
export function savesForRecord(saves, entitySet, recordId) {
  const id = String(recordId || "").toLowerCase().replace(/[{}]/g, "");
  const set = String(entitySet || "").toLowerCase();
  const out = [];
  for (const s of saves || []) {
    const mine = (s.ops || []).filter(o => o.recordId === id && (!set || String(o.entitySet).toLowerCase() === set));
    if (!mine.length) continue;
    const kinds = [...new Set(mine.map(o => o.kind))];
    const kind = kinds.includes("create") ? "create" : kinds.includes("delete") ? "delete" : kinds.includes("update") ? "update" : kinds[0];
    out.push({
      ...s,
      kind,
      action: mine.find(o => o.action)?.action || null,
      columns: [...new Set(mine.flatMap(o => o.columns || []))],
      opCount: s.opCount ?? (s.ops || []).length,
    });
  }
  return out.sort((a, b) => b.t0 - a.t0);
}
