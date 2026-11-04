// Automation › 🎯 Fires on — what runs when a column of a table changes, read from what Dataverse
// stores for each kind of registration: a plug-in step's filtering attributes
// (sdkmessageprocessingstep.filteringattributes), a classic workflow's "Record fields change" list
// (workflow.triggeronupdateattributelist, where "Record status changes" is statecode and "Record is
// assigned" is ownerid), a cloud flow's Dataverse trigger (subscriptionRequest/* in its definition:
// change type, table, "Select columns", row filter, scope). An EMPTY column list on an Update
// trigger means "every column" — the fact an audit is usually after. Business rules (client-side,
// form logic), actions (called, not triggered) and BPFs are not triggers and are left out; a flow
// whose trigger is manual, scheduled or on another connector has no table and is listed as such on
// the Cloud flows tab only. Pure: no React, no API.
const lc = (s) => String(s ?? "").trim().toLowerCase();
export const splitColumns = (s) => String(s ?? "").split(",").map(lc).filter(Boolean);

// the Dataverse trigger's change type (SubscriptionRequest.Message) and scope
export const DV_MESSAGE = { 1: ["create"], 2: ["delete"], 3: ["update"], 4: ["create", "update"], 5: ["create", "delete"], 6: ["update", "delete"], 7: ["create", "update", "delete"] };
export const DV_SCOPE = { 1: "User", 2: "Business unit", 3: "Parent: child business units", 4: "Organization" };
export const KIND_LABEL = { step: "Plug-in step", workflow: "Workflow", flow: "Cloud flow" };
export const TIMING_LABEL = { sync: "Sync", realtime: "Real-time", async: "Async", background: "Background" };
export const STAGE_LABEL = { 10: "Pre-validation", 20: "Pre-operation", 40: "Post-operation" };
// what blocks the save comes first: sync steps and real-time workflows, then the asynchronous rest
const TIMING_ORDER = { sync: 0, realtime: 1, async: 2, background: 2 };
const ON_NONE = { create: false, update: false, delete: false, other: "" };
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// a plug-in step → one trigger row (message Create / Update / Delete; anything else is "other")
export function stepTrigger(s) {
  const msg = lc(s.message);
  const on = { ...ON_NONE, create: msg === "create", update: msg === "update", delete: msg === "delete" };
  if (!on.create && !on.update && !on.delete) on.other = s.message || "";
  const columns = on.update ? splitColumns(s.filteringAttributes) : [];
  return { kind: "step", id: s.id, name: s.pluginType || s.name || "", detail: s.assembly || "", entity: lc(s.entity), on, columns, everyColumn: on.update && columns.length === 0, timing: s.mode === 0 ? "sync" : "async", stage: s.stage ?? null, active: s.state === 0, owner: s.runAsId ? (s.runAs || "a fixed user") : "", managed: !!s.managed, scope: "", rowFilter: "", pending: false, raw: s };
}

// a classic workflow (category 0) → one trigger row; the designer needs at least one field for
// "Record fields change", so a non-empty list IS the update trigger
export function workflowTrigger(p) {
  const columns = splitColumns(p.triggerUpdate);
  const on = { ...ON_NONE, create: !!p.triggerCreate, update: columns.length > 0, delete: !!p.triggerDelete };
  if (!on.create && !on.update && !on.delete) on.other = p.onDemand ? "On demand" : p.child ? "As a child workflow" : "";
  return { kind: "workflow", id: p.id, name: p.name || "", detail: "", entity: lc(p.entity), on, columns, everyColumn: false, timing: p.mode === 1 ? "realtime" : "background", stage: null, active: p.state === 1, owner: p.owner || "", managed: !!p.managed, scope: "", rowFilter: "", pending: false, raw: p };
}

// a cloud flow (category 5) with its parsed definition (flowIdentity.parseFlowIdentity: undefined =
// not read yet, null = not parseable) → one trigger row
export function flowTrigger(p, fi) {
  const base = { kind: "flow", id: p.id, name: p.name || "", detail: "", entity: lc(p.entity), on: { ...ON_NONE }, columns: [], everyColumn: false, timing: "async", stage: null, active: p.state === 1, owner: p.owner || "", managed: !!p.managed, scope: "", rowFilter: "", pending: fi === undefined, raw: p };
  if (fi === undefined) return base;
  const t = fi?.trigger || null;
  if (!t) return { ...base, on: { ...ON_NONE, other: fi === null ? "definition not readable" : "no trigger" } };
  if (t.entity) {
    const kinds = DV_MESSAGE[Number(t.message)] || [];
    const on = { ...ON_NONE, create: kinds.includes("create"), update: kinds.includes("update"), delete: kinds.includes("delete") };
    if (!kinds.length) on.other = `Dataverse trigger (change type ${t.message ?? "?"})`;
    const columns = on.update ? (t.columns || []).map(lc) : [];
    return { ...base, entity: lc(t.entity), on, columns, everyColumn: on.update && columns.length === 0, scope: DV_SCOPE[Number(t.scope)] || "", rowFilter: t.rowFilter || "" };
  }
  return { ...base, on: { ...ON_NONE, other: otherTriggerText(t) } };
}
const otherTriggerText = (t) => t.type === "Recurrence" ? "Recurrence" : t.type === "Request" ? (t.kind === "Button" ? "Manual (button)" : `Request${t.kind ? " · " + t.kind : ""}`) : [t.connector, t.operation].filter(Boolean).join(": ") || t.type || "unknown trigger";

// every registration that fires on a table → { rows, byEntity (table → rows), pendingFlows }
export function buildTriggerIndex({ steps = [], procs = [], flowDefs = {} } = {}) {
  const rows = [];
  for (const s of steps || []) rows.push(stepTrigger(s));
  for (const p of procs || []) {
    const cat = String(p.category);
    if (cat === "0") rows.push(workflowTrigger(p));
    else if (cat === "5") rows.push(flowTrigger(p, flowDefs[lc(p.id)]));
  }
  const byEntity = new Map();
  for (const r of rows) { if (!r.entity) continue; if (!byEntity.has(r.entity)) byEntity.set(r.entity, []); byEntity.get(r.entity).push(r); }
  return { rows, byEntity, pendingFlows: rows.filter(r => r.pending).length };
}

const sortRows = (a, b) => (TIMING_ORDER[a.timing] - TIMING_ORDER[b.timing]) || ((a.stage ?? 99) - (b.stage ?? 99)) || (Number(b.active) - Number(a.active)) || a.name.localeCompare(b.name);

// What runs when `column` of `entity` changes — an Update trigger that lists the column or runs on
// every column. Without a column: everything registered on the table. The table's Create / Delete
// triggers are not about a column: counted, not listed, when a column is asked.
export function firesOn(index, entity, column) {
  const e = lc(entity), c = lc(column);
  const all = index?.byEntity?.get(e) || [];
  const pick = c ? all.filter(r => r.on.update && (r.everyColumn || r.columns.includes(c))) : all;
  const groups = { step: [], workflow: [], flow: [] };
  for (const r of pick) groups[r.kind].push(r);
  for (const k of Object.keys(groups)) groups[k].sort(sortRows);
  return {
    entity: e, column: c, groups,
    total: pick.length,
    active: pick.filter(r => r.active).length,
    blocking: pick.filter(r => r.active && (r.timing === "sync" || r.timing === "realtime")).length,
    everyColumn: pick.filter(r => r.everyColumn).length,
    alsoCreate: c ? all.filter(r => r.on.create).length : 0,
    alsoDelete: c ? all.filter(r => r.on.delete).length : 0,
    pending: all.filter(r => r.pending).length,
  };
}

// the columns something watches on a table: Map column → how many list it, plus how many run on every column
export function watchedColumns(index, entity) {
  const m = new Map(); let every = 0;
  for (const r of index?.byEntity?.get(lc(entity)) || []) {
    if (!r.on.update) continue;
    if (r.everyColumn) { every++; continue; }
    for (const c of r.columns) m.set(c, (m.get(c) || 0) + 1);
  }
  return { columns: m, everyColumn: every };
}

const listText = (cols, max) => cols.length <= max ? cols.join(", ") : `${cols.slice(0, max).join(", ")} +${cols.length - max}`;

// "Create · Update (name, telephone1) · Delete", "Update (every column)", "On demand"
export function triggerText(r, { max = 4 } = {}) {
  if (r.pending) return "definition not read yet";
  const parts = [];
  if (r.on.create) parts.push("Create");
  if (r.on.update) parts.push(r.everyColumn ? "Update (every column)" : `Update (${listText(r.columns, max)})`);
  if (r.on.delete) parts.push("Delete");
  if (!parts.length && r.on.other) parts.push(r.on.other);
  return parts.join(" · ") || "—";
}

// the Cloud flows tab's Trigger cell, from the parsed definition's trigger (undefined: not read)
export function flowTriggerText(t) {
  if (t === undefined) return "";
  if (!t) return "no trigger";
  if (t.entity) {
    const kinds = DV_MESSAGE[Number(t.message)] || [];
    const verb = kinds.length ? kinds.map(cap).join(" or ") : `change type ${t.message ?? "?"}`;
    const cols = kinds.includes("update") ? (t.columns?.length ? listText(t.columns, 4) : "every column") : "";
    return [`${verb} of ${t.entity}`, cols, DV_SCOPE[Number(t.scope)] || "", t.rowFilter ? `rows: ${t.rowFilter}` : ""].filter(Boolean).join(" · ");
  }
  return otherTriggerText(t);
}

export const FIRES_HEADERS = ["kind", "name", "detail", "entity", "trigger", "columns", "timing", "stage", "scope", "rowFilter", "state", "owner", "managed"];
export const firesExportRows = (res) => [...res.groups.step, ...res.groups.workflow, ...res.groups.flow].map(r => [
  KIND_LABEL[r.kind], r.name, r.detail, r.entity, triggerText(r, { max: 999 }), r.everyColumn ? "every column" : r.columns.join(","), TIMING_LABEL[r.timing] || r.timing,
  r.stage ? (STAGE_LABEL[r.stage] || String(r.stage)) : "", r.scope, r.rowFilter, r.pending ? "not read" : r.active ? "Active" : "Inactive", r.owner, r.managed ? "Managed" : "Unmanaged",
]);
