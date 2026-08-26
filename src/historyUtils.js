// Explorer query-history entry construction — PURE, unit-tested.
//
// Two invariants the tests pin down (both were user-hit when they lived untested in the
// component): (1) PRIVACY — filter VALUES are never persisted: the emitted query string is
// redacted to "$filter=..." and a builder snapshot's condition values are blanked; (2) a
// builder entry carries enough STRUCTURE (columns, condition fields+operators, sort, limit)
// to reopen in the Builder instead of dumping raw OData.

export function buildHistoryEntry({ entityLogical, query, mode, fieldCount, ts, builderState }) {
  // 1000 (was 200): the old cap could chop a long $select mid-token, so a restored entry was
  // broken for a SECOND reason besides the redacted filter. Display still truncates at 80.
  // /g is load-bearing: a query can carry SEVERAL $filter segments ($expand's inner filter comes
  // BEFORE the top-level one in the emitted URL) — without it the first was redacted and the
  // real WHERE values persisted verbatim, breaking the privacy promise (audit finding).
  const safeQuery = (query || "").replace(/\$filter=[^&]*/g, "$filter=...").substring(0, 1000);
  const entry = { entity: entityLogical || "?", query: safeQuery, mode, fields: fieldCount, ts };
  if (mode === "builder" && builderState) {
    let redacted = 0;
    entry.builder = {
      fields: builderState.fields,
      filterGroups: (builderState.filterGroups || []).map(g => ({
        logic: g.logic,
        conditions: (g.conditions || []).map(c => { if (c.value) redacted++; return { field: c.field, op: c.op, value: "" }; }),
      })),
      groupLogic: builderState.groupLogic,
      limit: builderState.limit,
      orderBy: builderState.orderBy,
      redacted,
      hadRel: !!builderState.hadRel,
      hadExpand: !!builderState.hadExpand,
    };
  }
  return entry;
}
