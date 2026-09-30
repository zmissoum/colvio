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

// Splits into {business, system}, each sorted by target so the layout is deterministic
// (metadata order isn't) — business first is the whole point.
export function splitRels(rels, isSystem) {
  const business = [], system = [];
  (rels || []).forEach(r => (isSystem(r) ? system : business).push(r));
  const byTarget = (a, b) => (a.targetEntity || a.otherEntity || "").localeCompare(b.targetEntity || b.otherEntity || "");
  return { business: business.sort(byTarget), system: system.sort(byTarget) };
}
