// Security roles › privilege matrices computed in the panel from ONE read of the role ↔ privilege
// table (roleprivileges) and the org's privilege catalog — the org-wide "who can do what" view
// used to open every role one by one. Pure.
import { depthFromMask } from "./rolePrivilegeFilter.js";

// AccessRights enum → the make.powerapps column. A privilege carries exactly one of these.
export const ACCESS_RIGHT_OP = { 1: "Read", 2: "Write", 4: "Append", 16: "AppendTo", 32: "Create", 65536: "Delete", 262144: "Share", 524288: "Assign" };
const OP_RIGHT = Object.fromEntries(Object.entries(ACCESS_RIGHT_OP).map(([k, v]) => [v, Number(k)]));

// prvReadAccount → 1, prvAppendToAccount → 16, prvExportToExcel → 0 (miscellaneous).
export function accessRightFromName(name) {
  const n = String(name || "");
  if (!n.startsWith("prv")) return 0;
  const rest = n.slice(3);
  for (const op of ["AppendTo", "Append", "Create", "Read", "Write", "Delete", "Share", "Assign"]) {
    if (rest.startsWith(op) && rest.length > op.length) return OP_RIGHT[op];
  }
  return 0;
}

// One role: its granted depths (privilege id → 1/2/4/8) × the catalog → the grid the Matrix view
// shows: a row per table with the 8 operations (0 = not granted), the rest as "misc".
export function matrixFor(grantedDepth, catalog) {
  const entities = {};
  const misc = [];
  for (const pid in catalog) {
    const nm = catalog[pid].name || "";
    const op = ACCESS_RIGHT_OP[catalog[pid].accessRight];
    const depth = grantedDepth.get(String(pid).toLowerCase()) || 0;
    // A table privilege: a core operation AND the name is prv<Op><TableSchemaName>.
    const entity = op && nm.startsWith("prv" + op) ? nm.substring(3 + op.length) : null;
    if (op && entity) {
      (entities[entity] = entities[entity] || {})[op] = Math.max(entities[entity][op] || 0, depth);
    } else {
      misc.push({ id: pid, name: nm, depth });
    }
  }
  return {
    entities: Object.keys(entities).sort((a, b) => a.localeCompare(b)).map(e => ({ entity: e, ops: entities[e] })),
    misc: misc.sort((a, b) => a.name.localeCompare(b.name)),
  };
}

// Every role at once: grants = [{ roleId, privilegeId, mask }] → Map(roleId → { entities, misc }).
// Roles with no grant row still get an empty matrix when listed in roleIds.
export function matricesFromGrants(grants, catalog, roleIds = []) {
  const depths = new Map();
  for (const g of grants || []) {
    const r = String(g?.roleId || "").toLowerCase();
    const p = String(g?.privilegeId || "").toLowerCase();
    if (!r || !p) continue;
    if (!depths.has(r)) depths.set(r, new Map());
    const m = depths.get(r);
    const d = depthFromMask(g.mask);
    if (d > (m.get(p) || 0)) m.set(p, d);
  }
  for (const id of roleIds || []) { const r = String(id).toLowerCase(); if (!depths.has(r)) depths.set(r, new Map()); }
  const cat = {};
  for (const pid in catalog) cat[String(pid).toLowerCase()] = catalog[pid];
  const out = new Map();
  for (const [r, m] of depths) out.set(r, matrixFor(m, cat));
  return out;
}

// The catalog the panel gets ([{ id, name, accessRight }]) → the id-keyed shape matrixFor reads.
export function catalogIndex(list) {
  const out = {};
  for (const p of list || []) if (p?.id) out[String(p.id).toLowerCase()] = { name: p.name, accessRight: p.accessRight || accessRightFromName(p.name) };
  return out;
}
