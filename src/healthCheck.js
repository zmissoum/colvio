// 🩺 Health check — one report on the things that silently hurt a Dataverse environment: failing
// and suspended jobs, flows owned by disabled users, plug-ins firing on every update, unbound
// connection references, empty environment variables, users without a role, unmanaged solutions in
// production, log tables growing… Each check is a handful of reads — aggregates, or full lists read
// page by page (never capped, never one request per item) — and runs on its own: one that fails
// says why, the others still answer. Pure: the reads go through an injected `api`.
import { pagedFetchXml, cookieFrom, isCookieMismatch } from "./fetchPaging.js";

export const LEVELS = ["error", "warn", "info", "ok", "skip"];
export const LEVEL_LABEL = { error: "Problem", warn: "Warning", info: "Note", ok: "OK", skip: "Not applicable", failed: "Couldn't run" };
const n = (x) => Number(x || 0).toLocaleString("en-US");
const plural = (k, w, p = w + "s") => `${n(k)} ${k === 1 ? w : p}`;
export const isAggregateLimit = (msg) => /AggregateQueryRecordLimit|maximum record limit|50000/i.test(String(msg || ""));

// Every page of a FetchXML (paging cookie; page numbers when the server refuses the cookie).
// run(xml) → { records, pagingCookie, moreRecords }.
export async function fetchAllPages(run, xml, { pageSize = 5000, shouldStop = () => false } = {}) {
  const base = /\bcount\s*=/.test(xml) ? xml : xml.replace(/<fetch\b/i, `<fetch count="${pageSize}"`);
  const out = [];
  let page = 1, cookie = null, useCookie = true;
  for (;;) {
    if (shouldStop()) throw new Error("stopped");
    let r;
    try { r = await run(pagedFetchXml(base, page, useCookie ? cookie : null)); }
    catch (e) { if (useCookie && cookie && isCookieMismatch(e.message)) { useCookie = false; continue; } throw e; }
    out.push(...(r?.records || []));
    if (!r?.moreRecords) return out;
    cookie = cookieFrom(r.pagingCookie);
    page++;
  }
}

const FV = "@OData.Community.Display.V1.FormattedValue";
const fv = (row, k) => row?.[`${k}${FV}`] ?? row?.[k] ?? "";

// ── the checks ────────────────────────────────────────────────────────────────────────────────
// run(api) → { level, summary, fix?, columns?, rows? }. api: { org, isProd, fetchAll(xml),
// fetchAggregate(xml), odataAll(path), counts(names) }.
export const CHECKS = [
  {
    id: "trace-log", area: "Plug-ins", title: "Plug-in trace log setting",
    async run(api) {
      const s = Number(api.org?.plugintracelogsetting ?? -1);
      if (s === 2) return { level: api.isProd ? "warn" : "info", summary: `Set to "All": every plug-in run writes a trace${api.isProd ? " — in production it costs time on every save and fills the plug-in trace log table" : ""}.`, fix: "Keep \"Exception\" day to day; Show All Data › Record activity can switch it to All for 15–60 minutes and back by itself." };
      if (s === 0) return { level: "info", summary: "Off: when a plug-in fails, there's no trace to read.", fix: "\"Exception\" keeps a trace of failures only, at almost no cost." };
      if (s === 1) return { level: "ok", summary: "Exception — traces of failing plug-ins only." };
      return { level: "info", summary: "The setting couldn't be read." };
    },
  },
  {
    id: "audit", area: "Governance", title: "Auditing",
    async run(api) {
      const o = api.org || {};
      if (o.isauditenabled === false) return { level: "warn", summary: "Auditing is off for the whole organization: no change history, no sign-in history.", fix: "Power Platform admin center › environment › Settings › Audit and logs." };
      const days = Number(o.auditretentionperiodv2);
      if (days === -1) return { level: "info", summary: "Auditing is on and audit rows are kept forever — they count against log storage.", fix: "Set a retention period (admin center › Audit settings) if forever isn't required." };
      return { level: "ok", summary: `Auditing is on${days > 0 ? `, rows kept ${n(days)} days` : ""}.` };
    },
  },
  {
    id: "failed-jobs", area: "Automation", title: "System jobs failed in the last 7 days",
    async run(api) {
      const xml = `<fetch aggregate="true"><entity name="asyncoperation"><attribute name="name" alias="name" groupby="true"/><attribute name="asyncoperationid" alias="n" aggregate="count"/><filter><condition attribute="statuscode" operator="eq" value="31"/><condition attribute="createdon" operator="last-x-days" value="7"/></filter></entity></fetch>`;
      let rows;
      try { rows = await api.fetchAggregate(xml); }
      catch (e) { if (isAggregateLimit(e.message)) return { level: "error", summary: "More than 50,000 system jobs failed in 7 days (past what one aggregate can count).", fix: "System Ops › System jobs, filter Failed, to see which ones." }; throw e; }
      const list = rows.map(r => ({ name: r.name || "(no name)", count: Number(r.n) || 0 })).sort((a, b) => b.count - a.count);
      const total = list.reduce((a, r) => a + r.count, 0);
      if (!total) return { level: "ok", summary: "No failed system job in the last 7 days." };
      return { level: total >= 100 ? "warn" : "info", summary: `${plural(total, "failure")} across ${plural(list.length, "job name")} — top: ${list[0].name} (${n(list[0].count)}).`, fix: "System Ops › System jobs (filter Failed) shows each error; Show All Data › Record activity explains a job and its plug-in step.", columns: ["Job", "Failures"], rows: list.map(r => [r.name, r.count]) };
    },
  },
  {
    id: "suspended-jobs", area: "Automation", title: "Suspended system jobs",
    async run(api) {
      const xml = `<fetch aggregate="true"><entity name="asyncoperation"><attribute name="name" alias="name" groupby="true"/><attribute name="asyncoperationid" alias="n" aggregate="count"/><filter><condition attribute="statecode" operator="eq" value="1"/></filter></entity></fetch>`;
      let rows;
      try { rows = await api.fetchAggregate(xml); }
      catch (e) { if (isAggregateLimit(e.message)) return { level: "error", summary: "More than 50,000 suspended system jobs.", fix: "They wait for a retry that may never succeed — resume or cancel them (System Ops › System jobs)." }; throw e; }
      const list = rows.map(r => ({ name: r.name || "(no name)", count: Number(r.n) || 0 })).sort((a, b) => b.count - a.count);
      const total = list.reduce((a, r) => a + r.count, 0);
      if (!total) return { level: "ok", summary: "No suspended system job." };
      return { level: "warn", summary: `${plural(total, "suspended job")} — top: ${list[0].name} (${n(list[0].count)}).`, fix: "Suspended jobs wait for a retry that often never succeeds — fix the cause, then resume or cancel them.", columns: ["Job", "Suspended"], rows: list.map(r => [r.name, r.count]) };
    },
  },
  {
    id: "flows-disabled-owner", area: "Automation", title: "Active cloud flows owned by disabled users",
    async run(api) {
      const xml = `<fetch><entity name="workflow"><attribute name="name"/><attribute name="workflowid"/><filter><condition attribute="category" operator="eq" value="5"/><condition attribute="statecode" operator="eq" value="1"/></filter><link-entity name="systemuser" from="systemuserid" to="ownerid" alias="o"><attribute name="fullname"/><filter><condition attribute="isdisabled" operator="eq" value="1"/></filter></link-entity></entity></fetch>`;
      const rows = await api.fetchAll(xml);
      if (!rows.length) return { level: "ok", summary: "No active cloud flow is owned by a disabled user." };
      return { level: "warn", summary: `${plural(rows.length, "active cloud flow")} owned by disabled users — they stop when the owner's connections expire.`, fix: "Reassign them to a service account (or add co-owners) and re-bind their connections.", columns: ["Flow", "Owner"], rows: rows.map(r => [r.name, r["o.fullname"] || ""]) };
    },
  },
  {
    id: "update-steps-unfiltered", area: "Plug-ins", title: "Synchronous Update plug-in steps without filtering attributes",
    async run(api) {
      const xml = `<fetch><entity name="sdkmessageprocessingstep"><attribute name="name"/><attribute name="stage"/><filter><condition attribute="mode" operator="eq" value="0"/><condition attribute="statecode" operator="eq" value="0"/><condition attribute="customizationlevel" operator="eq" value="1"/><condition attribute="filteringattributes" operator="null"/></filter><link-entity name="sdkmessage" from="sdkmessageid" to="sdkmessageid" alias="m"><filter><condition attribute="name" operator="eq" value="Update"/></filter></link-entity><link-entity name="sdkmessagefilter" from="sdkmessagefilterid" to="sdkmessagefilterid" link-type="outer" alias="f"><attribute name="primaryobjecttypecode"/></link-entity></entity></fetch>`;
      const rows = await api.fetchAll(xml);
      if (!rows.length) return { level: "ok", summary: "Every synchronous Update step of a custom plug-in filters on its columns." };
      return { level: "warn", summary: `${plural(rows.length, "synchronous Update step")} ${rows.length === 1 ? "runs" : "run"} on every update of any column of ${rows.length === 1 ? "its" : "their"} table — slower saves, and loops when ${rows.length === 1 ? "it updates" : "they update"} the record itself.`, fix: "Set filtering attributes to the columns the plug-in really reads (Plugin Registration Tool).", columns: ["Step", "Table", "Stage"], rows: rows.map(r => [r.name, fv(r, "f.primaryobjecttypecode"), fv(r, "stage")]) };
    },
  },
  {
    id: "sync-workflows", area: "Automation", title: "Real-time (synchronous) classic workflows",
    async run(api) {
      const xml = `<fetch><entity name="workflow"><attribute name="name"/><attribute name="primaryentity"/><filter><condition attribute="category" operator="eq" value="0"/><condition attribute="mode" operator="eq" value="1"/><condition attribute="statecode" operator="eq" value="1"/><condition attribute="type" operator="eq" value="1"/></filter></entity></fetch>`;
      const rows = await api.fetchAll(xml);
      if (!rows.length) return { level: "ok", summary: "No active real-time workflow." };
      return { level: "info", summary: `${plural(rows.length, "active real-time workflow")} — they run inside the save itself (its duration, its errors).`, fix: "Fine when intended; move what can wait to background workflows or cloud flows.", columns: ["Workflow", "Table"], rows: rows.map(r => [r.name, r.primaryentity || ""]) };
    },
  },
  {
    id: "connrefs-unbound", area: "Automation", title: "Connection references without a connection",
    async run(api) {
      const rows = await api.odataAll("connectionreferences?$select=connectionreferencedisplayname,connectionreferencelogicalname,connectorid&$filter=connectionid eq null");
      if (!rows.length) return { level: "ok", summary: "Every connection reference has a connection." };
      return { level: "warn", summary: `${plural(rows.length, "connection reference")} without a connection — flows that use ${rows.length === 1 ? "it" : "them"} can't run.`, fix: "Solutions › the solution › Connection references: pick a connection for each.", columns: ["Connection reference", "Logical name", "Connector"], rows: rows.map(r => [r.connectionreferencedisplayname || "", r.connectionreferencelogicalname || "", String(r.connectorid || "").split("/").pop()]) };
    },
  },
  {
    id: "envvars-empty", area: "Solutions", title: "Environment variables with neither a value nor a default",
    async run(api) {
      // definitions without a default, minus those that have a value row — two reads, compared here
      const defs = await api.odataAll("environmentvariabledefinitions?$select=environmentvariabledefinitionid,schemaname,displayname&$filter=defaultvalue eq null");
      const vals = defs.length ? await api.odataAll("environmentvariablevalues?$select=_environmentvariabledefinitionid_value") : [];
      const has = new Set(vals.map(v => String(v._environmentvariabledefinitionid_value || "").toLowerCase()));
      const rows = defs.filter(d => !has.has(String(d.environmentvariabledefinitionid || "").toLowerCase()));
      if (!rows.length) return { level: "ok", summary: "Every environment variable has a value or a default." };
      return { level: "warn", summary: `${plural(rows.length, "environment variable")} with nothing in ${rows.length === 1 ? "it" : "them"} — whatever reads ${rows.length === 1 ? "it" : "them"} gets an empty value.`, fix: "Env Variables module: give each a value for this environment.", columns: ["Variable", "Schema name"], rows: rows.map(r => [r.displayname || "", r.schemaname || ""]) };
    },
  },
  {
    id: "users-no-role", area: "Security", title: "Enabled users without a security role",
    async run(api) {
      const rows = await api.odataAll("systemusers?$select=fullname,internalemailaddress&$filter=isdisabled eq false and accessmode eq 0 and applicationid eq null and not systemuserroles_association/any(r:r/roleid ne null)");
      if (!rows.length) return { level: "ok", summary: "Every enabled interactive user has a role." };
      return { level: "info", summary: `${plural(rows.length, "enabled user")} without a role of their own — they see nothing unless one of their teams has a role.`, fix: "Users & Licenses / Security Audit: assign a role, or disable the accounts no longer used.", columns: ["User", "Email"], rows: rows.map(r => [r.fullname || "", r.internalemailaddress || ""]) };
    },
  },
  {
    id: "unmanaged-in-prod", area: "Solutions", title: "Unmanaged solutions in production",
    async run(api) {
      if (!api.isProd) return { level: "skip", summary: "Not a production environment." };
      const rows = await api.odataAll("solutions?$select=friendlyname,uniquename,version&$filter=ismanaged eq false and isvisible eq true and uniquename ne 'Default' and uniquename ne 'Active' and uniquename ne 'Basic'");
      if (!rows.length) return { level: "ok", summary: "No unmanaged solution besides the default ones." };
      return { level: "warn", summary: `${plural(rows.length, "unmanaged solution")} in production — changes made here can't be removed by an upgrade and drift from your source.`, fix: "Deploy managed solutions from a development environment.", columns: ["Solution", "Unique name", "Version"], rows: rows.map(r => [r.friendlyname || "", r.uniquename || "", r.version || ""]) };
    },
  },
  {
    id: "log-tables", area: "Storage", title: "Log tables size",
    async run(api) {
      const names = ["asyncoperation", "workflowlog", "plugintracelog", "bulkdeletefailure", "importlog", "duplicaterecord"];
      const { counts } = await api.counts(names);
      const LIMIT = { asyncoperation: 1000000, workflowlog: 1000000, plugintracelog: 500000 };
      const big = names.filter(k => LIMIT[k] && (counts[k] || 0) >= LIMIT[k]);
      const rows = names.map(k => [k, counts[k] ?? "", LIMIT[k] ? n(LIMIT[k]) : ""]);
      if (big.length) return { level: "warn", summary: `${big.map(k => `${k} ${n(counts[k])} rows`).join(", ")} — log rows count against database storage and slow the screens that read them.`, fix: "Schedule bulk deletes of completed system jobs and old workflow / trace logs (Settings › Data management › Bulk record deletion).", columns: ["Table", "Rows (Dataverse snapshot ≤ 24 h)", "Flag at"], rows };
      return { level: "ok", summary: `Log tables are reasonable (system jobs ${n(counts.asyncoperation)}, workflow logs ${n(counts.workflowlog)}, trace logs ${n(counts.plugintracelog)}).`, columns: ["Table", "Rows (Dataverse snapshot ≤ 24 h)", "Flag at"], rows };
    },
  },
];

// Run every check (one at a time — gentle on the org's request budget). onResult(id, result) is
// called as each one finishes; a check that throws is reported "failed" with the server's reason.
export async function runChecks(api, { checks = CHECKS, onResult = () => {}, shouldStop = () => false } = {}) {
  const out = {};
  for (const c of checks) {
    if (shouldStop()) break;
    let r;
    try { r = await c.run(api); }
    catch (e) { r = { level: "failed", summary: e.message || String(e) }; }
    out[c.id] = r;
    onResult(c.id, r);
  }
  return out;
}

// Tally of the levels, for the header.
export function tally(results) {
  const t = { error: 0, warn: 0, info: 0, ok: 0, skip: 0, failed: 0 };
  for (const r of Object.values(results || {})) if (r && t[r.level] != null) t[r.level]++;
  return t;
}

const ORDER = { error: 0, failed: 1, warn: 2, info: 3, ok: 4, skip: 5 };
export const sortedChecks = (results, checks = CHECKS) => checks.filter(c => results[c.id]).sort((a, b) => ORDER[results[a.id].level] - ORDER[results[b.id].level]);

// Export: one row per finding item (or one per check when it lists nothing).
export const REPORT_HEADERS = ["Area", "Check", "Result", "Summary", "Item", "Details", "What to do"];
export function reportRows(results, checks = CHECKS) {
  const out = [];
  for (const c of sortedChecks(results, checks)) {
    const r = results[c.id];
    const base = [c.area, c.title, LEVEL_LABEL[r.level] || r.level, r.summary];
    if (r.rows && r.rows.length && r.level !== "ok") for (const row of r.rows) out.push([...base, String(row[0] ?? ""), row.slice(1).map(String).filter(Boolean).join(" · "), r.fix || ""]);
    else out.push([...base, "", "", r.fix || ""]);
  }
  return out;
}

// A plain-text report to paste in a ticket or a chat.
export function reportText(results, { org = "", at = new Date() } = {}, checks = CHECKS) {
  const t = tally(results);
  const lines = [`Colvio health check — ${org || "environment"} — ${at.toISOString().slice(0, 16).replace("T", " ")} UTC`, `${t.error} problem(s), ${t.warn} warning(s), ${t.info} note(s), ${t.ok} OK${t.failed ? `, ${t.failed} couldn't run` : ""}`, ""];
  for (const c of sortedChecks(results, checks)) {
    const r = results[c.id];
    if (r.level === "skip") continue;
    lines.push(`[${LEVEL_LABEL[r.level]}] ${c.title}: ${r.summary}`);
    if (r.fix && r.level !== "ok") lines.push(`    → ${r.fix}`);
  }
  return lines.join("\n");
}
