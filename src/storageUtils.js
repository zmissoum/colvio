// Storage module logic — PURE, unit-tested (I/O is injected, so the orchestration is testable).
//
// What Colvio can and can't measure (stated in the UI too): the capacity numbers Microsoft BILLS
// on (MB/GB of Database / File / Log) come from the Power Platform API, which needs an Entra app
// token for another audience — out of reach of a session-cookie extension. What the Dataverse Web
// API does give, with real numbers:
//   • rows per table — RetrieveTotalRecordCount reads Dataverse's OWN snapshot (≤ 24 h old), so
//     counting every table costs a handful of calls instead of a scan;
//   • file bytes per table — summing the size columns of the tables that live in File storage
//     (notes, file/image columns, email attachments).
// Capacity classes follow Microsoft's documented split (capacity-storage doc): File = Attachment,
// AnnotationBase, file/image columns, WebResourceBase, RibbonClientMetadataBase; Log = AuditBase,
// PlugInTraceLogBase and every ELASTIC table; everything else = Database.

export const FILE_TABLES = new Set(["annotation", "activitymimeattachment", "attachment", "fileattachment", "webresource", "ribbonclientmetadata"]);
export const LOG_TABLES = new Set(["audit", "plugintracelog"]);

// "db" | "file" | "log" | null (virtual tables hold no Dataverse storage — excluded)
export function storageClass(logical, tableType) {
  if (tableType === "Virtual") return null;
  const l = (logical || "").toLowerCase();
  if (LOG_TABLES.has(l) || tableType === "Elastic") return "log";
  if (FILE_TABLES.has(l)) return "file";
  return "db";
}

// System tables that grow without anyone noticing — the usual reason an org runs out of capacity.
export const SYSTEM_HOGS = {
  asyncoperation: "System jobs: completed and failed jobs pile up. Schedule a bulk-delete job on completed system jobs (Settings → Data management → Bulk record deletion).",
  workflowlog: "Classic workflow logs: keep \"automatically delete completed workflow jobs\" on, and bulk-delete old logs.",
  plugintracelog: "Plug-in traces (Log storage): set the trace setting to Exception or Off outside debugging sessions; a platform job purges them after about 24 h.",
  audit: "Audit (Log storage): shorten the audit retention period or delete old audit logs (Settings → Auditing → Audit log management).",
  email: "Emails: with server-side sync, often the biggest Database grower. Consider a retention policy or archiving.",
  annotation: "Notes: their attachments count in File storage (see the file breakdown below).",
  activitymimeattachment: "Email attachments: counted in File storage.",
  importlog: "Data-import logs: delete completed imports (Settings → Data management → Imports).",
  importdata: "Raw data of past imports: deleting the import job removes it.",
  duplicaterecord: "Duplicate-detection results: delete old duplicate-detection jobs.",
  bulkdeletefailure: "Failures recorded by bulk-delete jobs.",
  processsession: "Dialog and process sessions.",
  syncerror: "Sync errors (Outlook/mobile offline): usually safe to clean up.",
  traceassociation: "Trace associations left by system tracing.",
};

// Splits entity names into chunks whose URL payload stays well under request-line limits.
// Each name costs its length + 3 (two quotes and a comma).
export function planCountChunks(names, maxChars = 1500) {
  const chunks = []; let cur = [], len = 0;
  for (const n of names || []) {
    const c = String(n).length + 3;
    if (cur.length && len + c > maxChars) { chunks.push(cur); cur = []; len = 0; }
    cur.push(n); len += c;
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}

// RetrieveTotalRecordCountResponse → { logical: count }. Documented shape:
// { EntityRecordCountCollection: { Count, IsReadOnly, Keys: [..], Values: [..] } }
export function parseRecordCounts(resp) {
  const coll = resp?.EntityRecordCountCollection;
  const out = {};
  if (!coll || !Array.isArray(coll.Keys) || !Array.isArray(coll.Values)) return out;
  coll.Keys.forEach((k, i) => { const v = Number(coll.Values[i]); if (Number.isFinite(v)) out[k] = v; });
  return out;
}

// Counts every name with bounded concurrency. A chunk that ERRORS is split in half and retried,
// so one table the function refuses can't take its 100 neighbours down with it; a single name
// that still fails — or comes back missing / negative — lands in `failed` (shown, never hidden).
// Rounds instead of a shared work queue: no worker can exit while another is about to re-queue.
export async function countAll({ names, run, maxChars = 1500, concurrency = 4, maxCalls = 300, onProgress }) {
  const counts = {}; const failed = []; let calls = 0, settled = 0;
  const total = (names || []).length;
  let queue = planCountChunks(names, maxChars);
  while (queue.length) {
    const next = [];
    for (let i = 0; i < queue.length; i += concurrency) {
      await Promise.all(queue.slice(i, i + concurrency).map(async (chunk) => {
        if (calls >= maxCalls) { failed.push(...chunk); settled += chunk.length; return; }
        calls++;
        try {
          const m = await run(chunk);
          for (const n of chunk) { const v = m?.[n]; if (typeof v === "number" && v >= 0) counts[n] = v; else failed.push(n); }
          settled += chunk.length;
        } catch {
          if (chunk.length === 1) { failed.push(chunk[0]); settled++; }
          else { const mid = Math.ceil(chunk.length / 2); next.push(chunk.slice(0, mid), chunk.slice(mid)); }
        }
        onProgress?.(total ? settled / total : 1);
      }));
    }
    queue = next;
  }
  return { counts, failed, calls };
}

// ── File storage ──────────────────────────────────────────────────────
// The three sources of file bytes the Web API exposes, each grouped by the table the file belongs
// to (objecttypecode). Web resources / ribbon metadata also count in File storage but are
// solution plumbing, not user data — their ROW counts appear in the table list.
export const FILE_SOURCES = [
  { key: "notes", label: "Notes & attachments", entity: "annotation", entitySet: "annotations", sizeAttr: "filesize", idAttr: "annotationid", fetchFilter: '<condition attribute="isdocument" operator="eq" value="1"/>', odataFilter: "isdocument eq true" },
  { key: "filecols", label: "File & image columns", entity: "fileattachment", entitySet: "fileattachments", sizeAttr: "filesizeinbytes", idAttr: "fileattachmentid", fetchFilter: "", odataFilter: "" },
  { key: "emailatt", label: "Email attachments", entity: "activitymimeattachment", entitySet: "activitymimeattachments", sizeAttr: "filesize", idAttr: "activitymimeattachmentid", fetchFilter: "", odataFilter: "" },
];

// range = null (whole table) or { from, to } in epoch ms; grouped = by owning table.
export function buildFileSumFetch(src, range, grouped) {
  const conds = [];
  if (src.fetchFilter) conds.push(src.fetchFilter);
  if (range) {
    conds.push(`<condition attribute="createdon" operator="ge" value="${new Date(range.from).toISOString()}"/>`);
    conds.push(`<condition attribute="createdon" operator="lt" value="${new Date(range.to).toISOString()}"/>`);
  }
  return `<fetch aggregate="true"><entity name="${src.entity}">`
    + `<attribute name="${src.sizeAttr}" alias="bytes" aggregate="sum"/>`
    + `<attribute name="${src.idAttr}" alias="files" aggregate="count"/>`
    + (grouped ? '<attribute name="objecttypecode" alias="grp" groupby="true"/>' : "")
    + (conds.length ? `<filter type="and">${conds.join("")}</filter>` : "")
    + "</entity></fetch>";
}

const FMT = "@OData.Community.Display.V1.FormattedValue";
// Aggregate rows → [{ key, label, bytes, files }]. Ungrouped results land under "_total".
export function parseAggRows(rows, grouped) {
  return (rows || []).map(r => ({
    key: grouped ? String(r.grp ?? "(none)") : "_total",
    label: grouped ? (r["grp" + FMT] || String(r.grp ?? "(none)")) : "",
    bytes: Number(r.bytes) || 0,
    files: Number(r.files) || 0,
  }));
}

export function mergeAgg(acc, rows) {
  for (const r of rows || []) {
    const cur = acc.get(r.key);
    if (cur) { cur.bytes += r.bytes; cur.files += r.files; if (!cur.label && r.label) cur.label = r.label; }
    else acc.set(r.key, { ...r });
  }
  return acc;
}

export function isAggregateLimitError(msg) {
  return /AggregateQueryRecordLimit|8004E023|maximum record limit|50,?000/i.test(String(msg || ""));
}

// Adaptive date bisection for aggregates over the 50k-record limit: a range that hits the limit
// is split in two; dense periods (a migration day) get finer, quiet years stay one query. A range
// still over the limit at minSpan is skipped and the result flagged incomplete — never a crash,
// never a silent hole. maxQueries bounds the worst case.
export async function scanAdaptive({ from, to, run, maxQueries = 400, minSpanMs = 1000, onProgress, shouldAbort }) {
  const total = Math.max(1, to - from);
  const acc = new Map();
  const stack = [{ from, to }];
  let covered = 0, queries = 0, complete = true, skippedMs = 0;
  while (stack.length) {
    if (shouldAbort?.() || queries >= maxQueries) { complete = false; break; }
    const r = stack.pop();
    queries++;
    try {
      mergeAgg(acc, await run(r));
      covered += r.to - r.from;
    } catch (e) {
      if (!isAggregateLimitError(e?.message)) throw e;
      if (r.to - r.from > minSpanMs) {
        const mid = Math.floor((r.from + r.to) / 2);
        stack.push({ from: mid, to: r.to }, { from: r.from, to: mid }); // left half first
      } else { complete = false; skippedMs += r.to - r.from; covered += r.to - r.from; }
    }
    onProgress?.(Math.min(1, covered / total), queries);
  }
  return { rows: [...acc.values()], complete, queries, skippedMs };
}

// One file source end to end: fast path = ONE aggregate over the whole table (most orgs); over
// the limit → oldest createdon, then the adaptive scan. If the grouped form is refused (anything
// other than the record limit), fall back to an ungrouped total so the size still shows.
export async function scanFileSource({ run, getOldest, now = Date.now(), maxQueries, onProgress, shouldAbort }) {
  let grouped = true;
  const attempt = async (range) => {
    try { return await run(range, grouped); }
    catch (e) {
      if (grouped && !isAggregateLimitError(e?.message)) { grouped = false; return run(range, false); }
      throw e;
    }
  };
  try {
    const rows = await attempt(null);
    onProgress?.(1, 1);
    return { rows, grouped, complete: true, queries: 1 };
  } catch (e) {
    if (!isAggregateLimitError(e?.message)) throw e;
  }
  const oldest = await getOldest();
  if (oldest == null) return { rows: [], grouped, complete: true, queries: 1 };
  const res = await scanAdaptive({ from: oldest, to: now + 1000, run: attempt, maxQueries, onProgress, shouldAbort });
  return { ...res, grouped };
}

export function formatBytes(n) {
  const b = Number(n) || 0;
  if (b < 1024) return `${b} B`;
  const u = ["KB", "MB", "GB", "TB"]; let v = b / 1024, i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)} ${u[i]}`;
}
