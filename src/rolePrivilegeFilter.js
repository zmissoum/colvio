// Security › "Has privilege" filter — pure helpers: readable privilege names, the picker's search,
// depth-mask normalisation and "which roles hold it" matching. No React, no bridge.

// The Dataverse depth values, as the rest of the Security module labels them.
export const DEPTH_LABEL = { 0: "None", 1: "User", 2: "Business Unit", 4: "Parent: Child BU", 8: "Organization" };

// prvAppendToCustomerGroup -> Append To · CustomerGroup
// prvDeleteAccount -> Delete · Account
// prvReadAudit -> Read · Audit
export function formatPrivName(name) {
  if (!name || !name.startsWith("prv")) return name || "";
  const raw = name.substring(3); // strip "prv"
  // Split on camelCase boundaries: "AppendToCustomerGroup" -> ["Append", "To", "Customer", "Group"]
  const parts = raw.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2").split(" ");
  if (parts.length <= 1) return raw;
  // Known action words
  const actions = new Set(["Read","Write","Create","Delete","Append","Assign","Share","Import","Export","Publish","Bulk","Execute","Act"]);
  // Find where the action ends and the entity begins
  let actionEnd = 1;
  for (let i = 1; i < parts.length; i++) {
    if (actions.has(parts[i]) || parts[i] === "To" || parts[i] === "On" || parts[i] === "All") {
      actionEnd = i + 1;
    } else break;
  }
  const action = parts.slice(0, actionEnd).join(" ");
  const entity = parts.slice(actionEnd).join("");
  if (!entity) return action;
  return action + " · " + entity;
}

// roleprivileges.privilegedepthmask → 1 / 2 / 4 / 8 (0 = not granted). A mask carries one depth;
// should several bits ever be set, the widest one is what the role effectively grants.
export function depthFromMask(mask) {
  const m = Number(mask) || 0;
  for (const d of [8, 4, 2, 1]) if (m & d) return d;
  return 0;
}

// Picker search over the org's privilege catalog ([{ id, name }]). Every word typed must appear in
// the name or its readable label, so "export excel" finds prvExportToExcel and "read account"
// finds prvReadAccount. Exact name first, then names starting with the query, then the rest —
// shorter names before longer ones (prvReadAccount before prvReadAccountTeamMembership).
export function searchPrivileges(catalog, query, limit = 30) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return [];
  const words = q.split(/\s+/);
  const bare = q.replace(/\s+/g, "");
  const scored = [];
  for (const p of catalog || []) {
    if (!p?.name) continue;
    const name = p.name.toLowerCase();
    const hay = name + " " + formatPrivName(p.name).toLowerCase();
    if (!words.every(w => hay.includes(w)) && !name.includes(bare)) continue;
    const rank = name === bare || name === "prv" + bare ? 0
      : name.startsWith(bare) || name.startsWith("prv" + bare) ? 1 : 2;
    scored.push({ p, rank });
  }
  scored.sort((a, b) => a.rank - b.rank || a.p.name.length - b.p.name.length || a.p.name.localeCompare(b.p.name));
  return scored.slice(0, limit).map(s => s.p);
}

// The listed roles (root copies, { id, rootId, name }) that hold the privilege at minDepth or wider.
// grants = [{ roleId, mask }] for every business-unit copy; a role matches on its own id or its
// root id. Widest depth first, then by name.
export function rolesHolding(roles, grants, minDepth = 1) {
  const depthOf = new Map();
  for (const g of grants || []) {
    const id = String(g?.roleId || "").toLowerCase();
    if (!id) continue;
    const d = depthFromMask(g.mask);
    if (d > (depthOf.get(id) || 0)) depthOf.set(id, d);
  }
  const out = [];
  for (const r of roles || []) {
    const d = Math.max(depthOf.get(String(r.id || "").toLowerCase()) || 0, depthOf.get(String(r.rootId || "").toLowerCase()) || 0);
    if (d > 0 && d >= minDepth) out.push({ role: r, depth: d });
  }
  out.sort((a, b) => b.depth - a.depth || a.role.name.localeCompare(b.role.name));
  return out;
}

// CSV / Excel rows for the filter's result.
export function holderExportRows(privilege, holders) {
  return (holders || []).map(h => [
    h.role.name,
    h.role.isCustom ? "Custom" : "Managed",
    privilege?.name || "",
    formatPrivName(privilege?.name || ""),
    DEPTH_LABEL[h.depth] || String(h.depth),
  ]);
}
