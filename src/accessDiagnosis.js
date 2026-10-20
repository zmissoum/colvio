// Show All Data › "Why can (can't) this user see / edit this record?" — Dataverse's own answer
// (RetrievePrincipalAccess) explained right by right from the user's roles, their teams' roles, the
// record's owner and business unit, the BU tree and the record's shares. Pure: no React, no bridge.
// The context comes from one content-script action (a fixed number of reads, none per role/team).

export const RIGHTS = ["Read", "Write", "Append", "AppendTo", "Delete", "Assign", "Share"];
export const RIGHT_LABEL = { Read: "Read", Write: "Write", Append: "Append", AppendTo: "Append to", Delete: "Delete", Assign: "Assign", Share: "Share" };
export const DEPTH_LABEL = { 1: "User", 2: "Business Unit", 4: "Parent: Child BU", 8: "Organization" };
export const SYSADMIN_TEMPLATE = "627090ff-40a3-4053-8790-584edc5be201";
export const ACCESS_MODE = { 0: "Read-Write", 1: "Administrative", 2: "Read", 3: "Support User", 4: "Non-interactive", 5: "Delegated Admin" };
const OWNER_TEAM_TYPES = new Set([0, 2, 3]); // owner, Entra security group, Microsoft 365 group — access teams (1) carry no roles

const lc = (v) => (v == null ? "" : String(v).toLowerCase());

// "ReadAccess, WriteAccess, AppendToAccess" → Set { Read, Write, AppendTo }; "None" → empty.
export function parseAccessRights(s) {
  const out = new Set();
  for (const m of String(s || "").matchAll(/([A-Za-z]+)Access/g)) out.add(m[1]);
  return out;
}

// SecurityPrivilegeMetadata → "Read" / "AppendTo"…; the name decides when the type is missing.
const TYPE_NUM = { 1: "Create", 2: "Read", 3: "Write", 4: "Delete", 5: "Assign", 6: "Share", 7: "Append", 8: "AppendTo" };
export function privilegeRight(p) {
  const t = p?.PrivilegeType ?? p?.type;
  if (typeof t === "string" && t !== "None") return t;
  if (TYPE_NUM[t]) return TYPE_NUM[t];
  const m = String(p?.Name || p?.name || "").match(/^prv(AppendTo|Append|Create|Read|Write|Delete|Assign|Share)/);
  return m ? m[1] : null;
}

export function depthFromMask(mask) {
  const m = Number(mask) || 0;
  for (const d of [8, 4, 2, 1]) if (m & d) return d;
  return 0;
}

// BU tree helpers: within(child, ancestor) — child is the ancestor or below it.
export function buTree(bus) {
  const parent = new Map(), name = new Map();
  for (const b of bus || []) { parent.set(lc(b.id), lc(b.parentId)); name.set(lc(b.id), b.name || ""); }
  const within = (child, ancestor) => {
    let c = lc(child), guard = 0;
    const a = lc(ancestor);
    if (!c || !a) return false;
    while (c && guard++ < 10000) { if (c === a) return true; c = parent.get(c) || ""; }
    return false;
  };
  return { parent, name, within, nameOf: (id) => name.get(lc(id)) || "" };
}

// Does a privilege at `depth`, scoped to business unit `scopeBu`, reach the record?
// ownsIt = the record is owned by the principal the Basic level counts for.
export function reaches(depth, scopeBu, rec, ownsIt, tree) {
  if (depth >= 8) return true;
  if (depth >= 4) return tree.within(rec.buId, scopeBu);
  if (depth >= 2) return !!rec.buId && lc(rec.buId) === lc(scopeBu);
  if (depth >= 1) return !!ownsIt;
  return false;
}

// The narrowest depth that reaches the record from the user's own BU (what a role would need).
export function depthNeeded(ctx, tree) {
  const rec = ctx.record || {}, u = ctx.user || {};
  if (ctx.entity?.ownership === "OrganizationOwned") return 8;
  if (lc(rec.ownerId) === lc(u.id)) return 1;
  if (rec.buId && lc(rec.buId) === lc(u.buId)) return 2;
  if (tree.within(rec.buId, u.buId)) return 4;
  return 8;
}

// Where the record sits from the user's point of view, in words.
export function recordPosition(ctx, tree) {
  const rec = ctx.record || {}, u = ctx.user || {};
  if (ctx.entity?.ownership === "OrganizationOwned") return "The table is organization-owned: a role gives all its rows or none.";
  const bu = tree.nameOf(rec.buId) || "its business unit";
  const ubu = tree.nameOf(u.buId) || "theirs";
  if (lc(rec.ownerId) === lc(u.id)) return `The user owns the record (business unit ${bu}).`;
  const teamOwner = (ctx.teams || []).find(t => lc(t.id) === lc(rec.ownerId));
  const who = rec.ownerName ? `${rec.ownerType === "team" ? "team " : ""}${rec.ownerName}` : "someone else";
  const owned = `Owned by ${who}${teamOwner ? " — a team the user belongs to" : ""}`;
  if (rec.buId && lc(rec.buId) === lc(u.buId)) return `${owned}, in the user's own business unit ${bu}.`;
  if (tree.within(rec.buId, u.buId)) return `${owned}, in ${bu} — below the user's business unit ${ubu}.`;
  return `${owned}, in ${bu} — outside the user's business unit branch (${ubu}).`;
}

const isSysAdmin = (r) => lc(r.templateId) === SYSADMIN_TEMPLATE || /^system administrator$/i.test(String(r.name || ""));

// The whole diagnosis. ctx = the content-script context (see getAccessContext).
export function diagnoseAccess(ctx) {
  const tree = buTree(ctx.bus);
  const u = ctx.user || {}, rec = ctx.record || {};
  const orgOwned = ctx.entity?.ownership === "OrganizationOwned";
  const privByRight = {};
  for (const p of ctx.entity?.privileges || []) { const r = privilegeRight(p); if (r && !privByRight[r]) privByRight[r] = lc(p.PrivilegeId || p.id); }
  const grant = new Map();
  for (const g of ctx.grants || []) {
    const k = `${lc(g.roleId)}|${lc(g.privilegeId)}`;
    grant.set(k, Math.max(grant.get(k) || 0, depthFromMask(g.mask)));
  }
  const truth = ctx.effective == null ? null : parseAccessRights(ctx.effective);
  const sysadmin = (u.roles || []).find(isSysAdmin);
  const teamIds = new Set((ctx.teams || []).map(t => lc(t.id)));
  const ownsUser = lc(rec.ownerId) === lc(u.id);
  const need = depthNeeded(ctx, tree);
  const rows = [];

  for (const right of RIGHTS) {
    const privId = privByRight[right];
    if (!privId) { rows.push({ right, applicable: false, granted: truth ? truth.has(right) : null, paths: [], note: orgOwned && (right === "Assign" || right === "Share") ? "Organization-owned rows have no owner — nothing to assign or share." : "The table has no such privilege." }); continue; }
    const paths = [];
    if (sysadmin) paths.push({ kind: "sysadmin", ok: true, label: `System Administrator role (${sysadmin.name})` });
    let best = 0;
    for (const r of u.roles || []) {
      const d = grant.get(`${lc(r.id)}|${privId}`) || 0;
      if (!d) continue;
      best = Math.max(best, d);
      const scope = r.buId || u.buId;
      const ok = orgOwned || reaches(d, scope, rec, ownsUser, tree);
      const other = r.buId && u.buId && lc(r.buId) !== lc(u.buId) ? ` (assigned in ${tree.nameOf(r.buId) || "another business unit"})` : "";
      paths.push({ kind: "role", ok, depth: d, label: `role ${r.name}${other}`, roleId: r.id });
    }
    for (const t of ctx.teams || []) {
      if (!OWNER_TEAM_TYPES.has(Number(t.type))) continue;
      for (const r of t.roles || []) {
        const d = grant.get(`${lc(r.id)}|${privId}`) || 0;
        if (!d) continue;
        best = Math.max(best, d);
        const ownsTeam = lc(rec.ownerId) === lc(t.id);
        const inherited = Number(r.inherited) === 1;
        const ok = orgOwned || reaches(d, t.buId, rec, ownsTeam, tree) || (inherited && reaches(d, u.buId, rec, ownsUser, tree));
        paths.push({ kind: "team", ok, depth: d, label: `team ${t.name} › role ${r.name}${inherited ? " (members inherit it as their own)" : ""}`, teamId: t.id, scopeBu: t.buId });
      }
    }
    for (const s of ctx.shares || []) {
      if (!parseAccessRights(s.mask).has(right)) continue;
      const toUser = lc(s.principalId) === lc(u.id), toTeam = teamIds.has(lc(s.principalId));
      if (!toUser && !toTeam) continue;
      const t = toTeam ? (ctx.teams || []).find(x => lc(x.id) === lc(s.principalId)) : null;
      paths.push({ kind: "share", ok: best > 0 || !!sysadmin, label: toUser ? "shared with the user" : `shared with team ${t?.name || s.name || ""}`, needsPrivilege: !(best > 0 || sysadmin) });
    }
    const model = paths.some(p => p.ok);
    const granted = truth ? truth.has(right) : null;
    const why = paths.find(p => p.ok) || null;
    const row = { right, applicable: true, granted, model, paths, best, why, need };
    if (granted != null && granted !== model) row.mismatch = granted
      ? "Dataverse grants it through a path this check doesn't model — hierarchy security (manager or position), access inherited from a related record, or a team membership not visible here."
      : "A role or share should grant it, but Dataverse says no — Dataverse's answer is the truth (user disabled or in a restricted access mode, a role copy of another business unit…).";
    if (!(granted ?? model)) row.fixes = fixesFor(right, row, ctx, tree);
    rows.push(row);
  }

  const facts = [];
  if (u.disabled) facts.push({ level: "error", text: "The user is disabled — they can't sign in, whatever their roles." });
  if (u.accessMode != null && Number(u.accessMode) !== 0) facts.push({ level: Number(u.accessMode) === 2 || Number(u.accessMode) === 1 ? "warn" : "info", text: `Access mode: ${ACCESS_MODE[u.accessMode] || u.accessMode}${Number(u.accessMode) === 2 ? " — the user can read but never write" : Number(u.accessMode) === 1 ? " — settings only, no business data in the apps" : ""}.` });
  if (!(u.roles || []).length && !(ctx.teams || []).some(t => (t.roles || []).length)) facts.push({ level: "error", text: "No security role at all — directly or through a team." });
  if ((ctx.teams || []).some(t => Number(t.type) === 2 || Number(t.type) === 3)) facts.push({ level: "info", text: "Entra group teams list a member only once that user has signed in to this environment — a missing group team may simply not be materialized yet." });
  return { rows, position: recordPosition(ctx, tree), need, facts, tree };
}

// What would grant a denied right — the narrowest changes first.
export function fixesFor(right, row, ctx, tree) {
  const out = [];
  const lbl = RIGHT_LABEL[right];
  const table = ctx.entity?.displayName || ctx.entity?.logicalName || "the table";
  const need = row.need;
  if (ctx.entity?.ownership === "OrganizationOwned") {
    out.push(`Give the user (or one of their teams) a role with ${lbl} on ${table}.`);
    return out;
  }
  if (!row.best) out.push(`No role of the user or their teams has ${lbl} on ${table} at all — add it to a role (at least at User level).`);
  else if (row.best < need) out.push(`Their widest ${lbl} is ${DEPTH_LABEL[row.best]}; this record needs ${DEPTH_LABEL[need]}${need < 8 ? " or wider" : ""} — or, where the org allows roles from other business units, a role from the record's (${tree.nameOf(ctx.record?.buId) || "its BU"}).`);
  if (right !== "Assign" && right !== "Share") {
    if (row.best > 0) out.push(`Or share the record with the user (${lbl}) — they have the privilege, so a share would work.`);
    else out.push(`A share alone won't do: shared access needs the ${lbl} privilege at least at User level.`);
  }
  if (row.best > 0) out.push("Or assign the record to the user, or to a team they belong to.");
  return out;
}

// One-line verdict of a row, for the screen and the export.
export function rowVerdict(row) {
  if (!row.applicable) return row.note;
  const ok = row.granted ?? row.model;
  if (ok && row.why) return `${pathText(row.why)}`;
  if (ok) return "Granted by Dataverse";
  const tried = row.paths.filter(p => p.kind !== "share");
  if (!tried.length) return "No role gives this privilege";
  const best = tried.reduce((a, b) => ((b.depth || 0) > (a.depth || 0) ? b : a));
  return `Best: ${pathText(best)} — doesn't reach this record`;
}

export function pathText(p) {
  if (p.kind === "sysadmin") return p.label;
  if (p.kind === "share") return p.label + (p.needsPrivilege ? " — ignored: no privilege to back it" : "");
  return `${p.label} — ${DEPTH_LABEL[p.depth] || p.depth}`;
}

export const ACCESS_HEADERS = ["Right", "Dataverse says", "Why / why not", "What would grant it", "All paths"];
export const accessExportRows = (rows) => (rows || []).map(r => [
  RIGHT_LABEL[r.right], r.applicable ? ((r.granted ?? r.model) ? "Yes" : "No") : "n/a", rowVerdict(r) + (r.mismatch ? ` (${r.mismatch})` : ""),
  (r.fixes || []).join(" "), (r.paths || []).map(p => `${p.ok ? "✓" : "✗"} ${pathText(p)}`).join("; "),
]);
