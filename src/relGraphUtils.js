// Relationship-graph classification — PURE, unit-tested.
//
// Why: EntityDefinitions returns relationships in metadata order, which puts the SYSTEM
// plumbing first (createdby/modifiedby/owner*/currency/process — created with the table).
// With the graph capped at 12 visible nodes per row, the user's BUSINESS relationships
// (the ones a data model is about) landed beyond the cap and looked missing (user-hit).
// Classification is by the lookup FIELD for parents (the system fields are the same on
// every table) and by the child TABLE for children (async jobs, sync errors, plumbing).

export const SYS_PARENT_FIELDS = new Set([
  "createdby", "modifiedby", "createdonbehalfby", "modifiedonbehalfby",
  "owninguser", "owningteam", "owningbusinessunit", "ownerid",
  "transactioncurrencyid", "stageid", "processid", "slaid", "slainvokedid",
]);

export const SYS_CHILD_ENTITIES = new Set([
  "asyncoperation", "syncerror", "processsession", "duplicaterecord",
  "bulkdeletefailure", "principalobjectattributeaccess", "mailboxtrackingfolder",
  "userentityinstancedata", "workflowlog", "traceassociation",
]);

export function isSystemParent(rel) { return SYS_PARENT_FIELDS.has((rel?.lookupField || "").toLowerCase()); }
export function isSystemChild(rel) { return SYS_CHILD_ENTITIES.has((rel?.targetEntity || "").toLowerCase()); }

// Parent lookups grouped per target table AND per kind: a business lookup to systemuser
// (preferredsystemuserid…) must not be swallowed by the createdby/ownerid group that also
// targets systemuser — that group is system plumbing and starts hidden.
export function groupParents(rels) {
  const groups = new Map();
  for (const r of rels || []) {
    const key = `${r.targetEntity}|${isSystemParent(r) ? "sys" : "biz"}`;
    const g = groups.get(key);
    if (g) g.count++; else groups.set(key, { ...r, count: 1 });
  }
  return [...groups.values()];
}

// Map layout: rows wrap to the pane's width. A single row per band used to be wider than the pane
// (6 children = 1044 px at 1280), hiding nodes behind a sideways scroll that reset on every table switch.
export function nodesPerRow(paneWidth, nodeW, gap) {
  return Math.max(1, Math.floor((paneWidth - gap) / (nodeW + gap)));
}

// Positions (x = node centre, y = node top) of `count` nodes wrapped `perRow` per row, each row
// centred on cx; height = the band's total height.
export function wrapRow(count, { perRow, cx, top, nodeW, nodeH, gap, rowGap }) {
  const per = Math.max(1, perRow);
  const pos = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / per), col = i % per;
    const inRow = Math.min(per, count - row * per);
    pos.push({ x: cx - ((inRow - 1) * (nodeW + gap)) / 2 + col * (nodeW + gap), y: top + row * (nodeH + rowGap) });
  }
  const rows = Math.max(1, Math.ceil(count / per));
  return { pos, height: rows * nodeH + (rows - 1) * rowGap };
}

// Splits into {business, system}, each sorted by target so the layout is deterministic
// (metadata order isn't) — business first is the whole point.
export function splitRels(rels, isSystem) {
  const business = [], system = [];
  (rels || []).forEach(r => (isSystem(r) ? system : business).push(r));
  const byTarget = (a, b) => (a.targetEntity || a.otherEntity || "").localeCompare(b.targetEntity || b.otherEntity || "");
  return { business: business.sort(byTarget), system: system.sort(byTarget) };
}
