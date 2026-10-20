// Automation › plug-in steps, the write side (what the Plugin Registration Tool is opened for most
// often): enable / disable steps — one or a whole selection, in $batch chunks — and edit the
// filtering attributes of an Update step. Pure: plans, normalisation, the words of confirmations.

export const STEP_SET = "sdkmessageprocessingsteps";
export const STEP_PK = "sdkmessageprocessingstepid";
const NAME_RE = /^[a-z_][a-z0-9_]*$/;

// sdkmessageprocessingstep state: 0 Enabled (status 1), 1 Disabled (status 2).
export const statePatch = (enable) => (enable ? { statecode: 0, statuscode: 1 } : { statecode: 1, statuscode: 2 });

// Only Update steps filter on columns; internal stages (30, 5…) aren't registrations.
export const canEditFiltering = (s) => s?.message === "Update" && [10, 20, 40].includes(Number(s?.stage)) && !!s?.entity;

// "Name, telephone1,,name " → ["name", "telephone1"] (lower-case, unique, sorted, valid names only).
export function parseFiltering(str) {
  return [...new Set(String(str || "").split(",").map(x => x.trim().toLowerCase()).filter(x => NAME_RE.test(x)))].sort();
}
export const formatFiltering = (list) => parseFiltering((list || []).join(","))
  .join(",");

export function filteringDiff(before, after) {
  const b = new Set(parseFiltering(before)), a = new Set(parseFiltering(after));
  return { added: [...a].filter(x => !b.has(x)), removed: [...b].filter(x => !a.has(x)) };
}

// The columns a step can filter on: every column of the table that can change (valid for update),
// plus whatever the step filters on today even if the metadata no longer lists it.
export function filterableColumns(fields, current) {
  const cur = new Set(parseFiltering(current));
  const out = (fields || []).filter(f => f && f.logical && (f.validForUpdate !== false || cur.has(String(f.logical).toLowerCase())))
    .map(f => ({ l: String(f.logical).toLowerCase(), d: f.display || f.logical, t: f.type || "" }));
  for (const c of cur) if (!out.some(f => f.l === c)) out.push({ l: c, d: c, t: "(not in metadata)" });
  return out.sort((x, y) => x.l.localeCompare(y.l));
}

// Enable / disable a selection: the steps that actually change, as batch items, and the rest.
export function statePlan(steps, enable) {
  const want = enable ? 0 : 1;
  const change = (steps || []).filter(s => Number(s.state) !== want);
  return {
    items: change.map(s => ({ keyValue: s.id, record: statePatch(enable) })),
    change, unchanged: (steps || []).length - change.length,
    managed: change.filter(s => s.managed).length,
    sync: change.filter(s => Number(s.mode) === 0).length,
  };
}

// The confirmation text — says what stops (or starts) running, for whom, from when.
export function stateConfirmText(plan, enable) {
  const n = plan.change.length;
  const lines = [`${enable ? "Enable" : "Disable"} ${n} plug-in step${n === 1 ? "" : "s"}?`, ""];
  for (const s of plan.change.slice(0, 8)) lines.push(`• ${s.name || s.pluginType}`);
  if (n > 8) lines.push(`• … and ${n - 8} more`);
  lines.push("");
  lines.push(enable ? "They run again on the next matching operation, for every user." : "They stop running at once, for every user, until enabled again — whatever they enforce (validation, numbering, integration) stops too.");
  if (plan.managed) lines.push(`${plan.managed} of them come from managed solutions — the next import of those solutions may set their state back.`);
  if (plan.unchanged) lines.push(`${plan.unchanged} selected step${plan.unchanged === 1 ? " is" : "s are"} already ${enable ? "enabled" : "disabled"} — left as is.`);
  return lines.join("\n");
}

// After the batch: the local rows updated to what was written (failed rows keep their state).
// Batch errors number their rows from 1 (row N = plan.items[N - 1]), never-sent rows included.
export function applyStateLocally(steps, plan, enable, errors) {
  const failed = new Set((errors || []).map(e => plan.items[(Number(e.row) || 0) - 1]?.keyValue).filter(Boolean));
  const done = new Set(plan.items.map(i => i.keyValue).filter(id => !failed.has(id)));
  const want = enable ? 0 : 1;
  return (steps || []).map(s => (done.has(s.id) ? { ...s, state: want } : s));
}
