// Security › Field security — pure helpers: who can read / create / update each SECURED column of a
// table. In Dataverse a security role grants rights on whole tables; a column's own access exists
// only once the column is secured, and is then granted by field security profiles (fieldpermission
// rows: canread / cancreate / canupdate / canreadunmasked) given to users and teams, not to roles.
// No React, no bridge.

// fieldpermission picklists: canread / cancreate / canupdate → 0 Not allowed · 4 Allowed;
// canreadunmasked (masked columns) → 0 Not allowed · 1 One record · 3 All records.
export const ALLOWED = 4;
export const UNMASKED_LABEL = { 0: "Not allowed", 1: "One record", 3: "All records" };
export const RIGHTS = [["read", "R", "Read"], ["create", "C", "Create"], ["update", "U", "Update"]];

const lc = (v) => (v == null ? "" : String(v).toLowerCase());

// One fieldpermission row as the content script returns it → booleans the grid reads.
export function permFromRow(r) {
  return {
    profileId: lc(r.profileId),
    entity: lc(r.entity),
    column: lc(r.column),
    read: Number(r.canread) === ALLOWED,
    create: Number(r.cancreate) === ALLOWED,
    update: Number(r.canupdate) === ALLOWED,
    unmasked: r.canreadunmasked == null ? null : Number(r.canreadunmasked),
  };
}

// Tables that carry at least one field permission, most columns first: the picker's short list.
export function tablesWithPermissions(perms) {
  const m = new Map();
  for (const p of perms || []) {
    if (!p.entity) continue;
    if (!m.has(p.entity)) m.set(p.entity, new Set());
    m.get(p.entity).add(p.column);
  }
  return [...m.entries()].map(([entity, cols]) => ({ entity, columns: cols.size }))
    .sort((a, b) => b.columns - a.columns || a.entity.localeCompare(b.entity));
}

// The grid for one table: one row per secured column (plus any column a profile still names but
// that is no longer secured — Dataverse ignores such a permission, so it is flagged), one cell per
// profile that names a column of this table. A secured column no profile lets anyone read is
// flagged too: only System Administrators can see its values.
export function buildFieldGrid(entity, securedColumns, perms, profiles) {
  const ent = lc(entity);
  const mine = (perms || []).filter(p => p.entity === ent);
  const profById = new Map((profiles || []).map(p => [lc(p.id), p]));
  const usedProfiles = [...new Set(mine.map(p => p.profileId))]
    .map(id => profById.get(id) || { id, name: id, description: "" })
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const cols = new Map();
  for (const c of securedColumns || []) cols.set(lc(c.logical), { column: lc(c.logical), display: c.display || c.logical, type: c.type || "", secured: true });
  for (const p of mine) if (!cols.has(p.column)) cols.set(p.column, { column: p.column, display: p.column, type: "", secured: false });
  const rows = [...cols.values()].map(c => {
    const cells = {};
    for (const p of mine) if (p.column === c.column) cells[p.profileId] = p;
    const readers = Object.values(cells).filter(x => x.read).length;
    return { ...c, cells, readers, nobody: c.secured && readers === 0 };
  }).sort((a, b) => (a.secured === b.secured ? 0 : a.secured ? -1 : 1) || a.column.localeCompare(b.column));
  return { entity: ent, profiles: usedProfiles, rows, showUnmasked: mine.some(p => p.unmasked != null && p.unmasked !== 0) };
}

// "R C U" for a cell — the allowed rights only, "—" when the profile grants nothing on the column.
export function cellText(cell) {
  if (!cell) return "";
  const s = RIGHTS.filter(([k]) => cell[k]).map(([, l]) => l).join(" ");
  return s || "—";
}

// One export row per column × profile that names it; a secured column no profile names gets one
// row with an empty profile, so the file shows it too.
export function fieldExportRows(grid) {
  const yn = (b) => (b ? "Yes" : "No");
  const out = [];
  for (const r of grid.rows) {
    const ids = Object.keys(r.cells);
    if (!ids.length) { out.push([grid.entity, r.column, r.display, r.secured ? "Yes" : "No", "", "", "", "", ""]); continue; }
    for (const p of grid.profiles) {
      const c = r.cells[lc(p.id)];
      if (!c) continue;
      out.push([grid.entity, r.column, r.display, r.secured ? "Yes" : "No", p.name, yn(c.read), yn(c.create), yn(c.update), c.unmasked == null ? "" : (UNMASKED_LABEL[c.unmasked] || String(c.unmasked))]);
    }
  }
  return out;
}
export const FIELD_EXPORT_HEADERS = ["table", "column", "displayName", "secured", "profile", "read", "create", "update", "readUnmasked"];
