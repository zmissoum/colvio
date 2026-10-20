// Metadata › "What breaks if I delete this?" — the components Dataverse says would block deleting a
// column, a table or a choice (RetrieveDependenciesForDelete), named and grouped, each with how to
// remove that dependency. One read for the dependencies, then one read per component type to name
// them (ids grouped, never one request per component). Pure: shaping, labels, hints.

// componenttype values (the dependency table's global choice) → readable names
export const COMPONENT_LABEL = {
  1: "Table", 2: "Column", 3: "Relationship", 4: "Choice value", 9: "Choice (global)", 10: "Relationship",
  14: "Alternate key", 16: "Privilege", 20: "Security role", 21: "Role privilege", 24: "Form", 25: "Organization",
  26: "View", 29: "Process", 31: "Report", 36: "Email template", 37: "Contract template", 39: "Mail merge template",
  44: "Duplicate detection rule", 45: "Duplicate detection condition", 46: "Relationship mapping", 47: "Column mapping",
  48: "Ribbon command", 50: "Ribbon customization", 52: "Ribbon rule", 55: "Ribbon diff", 59: "Chart", 60: "Form",
  61: "Web resource", 62: "Site map", 63: "Connection role", 64: "Complex control", 65: "Hierarchy rule",
  66: "Custom control (PCF)", 68: "Custom control default config", 70: "Field security profile", 71: "Field permission",
  80: "Model-driven app", 90: "Plug-in type", 91: "Plug-in assembly", 92: "Plug-in step", 93: "Plug-in step image",
  95: "Service endpoint", 150: "Routing rule", 151: "Routing rule item", 152: "SLA", 153: "SLA item",
  154: "Record creation rule", 155: "Record creation rule item", 161: "Mobile offline profile", 162: "Mobile offline profile item",
  165: "Similarity rule", 166: "Data source mapping", 208: "Import map", 300: "Canvas app", 371: "Connector", 372: "Connector",
  380: "Environment variable", 381: "Environment variable value", 400: "AI project type", 401: "AI project", 402: "AI configuration",
  430: "Table analytics configuration", 431: "Column image configuration", 432: "Table image configuration",
};

// workflow.category → what the "process" really is
const PROCESS_KIND = { 0: "Classic workflow", 1: "Dialog", 2: "Business rule", 3: "Custom action", 4: "Business process flow", 5: "Cloud flow", 6: "Desktop flow" };
// systemform.type → form kind
const FORM_KIND = { 0: "Dashboard", 2: "Main form", 5: "Mobile form", 6: "Quick view form", 7: "Quick create form", 8: "Dialog", 9: "Task flow form", 10: "Interactive dashboard", 11: "Card form", 12: "Main form (interactive)", 103: "Power BI dashboard" };

export const DEPENDENCY_TYPE = { 0: "None", 1: "Solution internal", 2: "Published", 4: "Unpublished" };

const lc = (v) => (v == null ? "" : String(v).toLowerCase());

// The dependency rows of the function → plain objects (lower-case ids).
export function normalizeDeps(rows) {
  return (rows || []).map(r => ({
    type: Number(r.dependentcomponenttype),
    id: lc(r.dependentcomponentobjectid),
    parentId: lc(r.dependentcomponentparentid),
    requiredType: Number(r.requiredcomponenttype),
    requiredId: lc(r.requiredcomponentobjectid),
    requiredParentId: lc(r.requiredcomponentparentid),
    dependencyType: Number(r.dependencytype),
  })).filter(d => d.id && Number.isFinite(d.type));
}

// The components to name, each once: every dependent, and every required one that isn't the
// component being deleted (a table's dependencies can go through one of its columns or keys).
export function itemsToResolve(deps, targetId) {
  const seen = new Set(), out = [];
  const add = (type, id, parentId) => {
    if (!id || !Number.isFinite(type)) return;
    const k = `${type}|${id}`;
    if (seen.has(k)) return;
    seen.add(k); out.push({ type, id, parentId: parentId || "" });
  };
  const t = lc(targetId);
  for (const d of deps || []) {
    add(d.type, d.id, d.parentId);
    if (d.requiredId && d.requiredId !== t) add(d.requiredType, d.requiredId, d.requiredParentId);
  }
  return out;
}

// What the component is, with its kind when the record says it (a process's category, a form's type).
export function componentKind(type, info) {
  if (type === 29 && info && PROCESS_KIND[info.category] != null) return PROCESS_KIND[info.category];
  if ((type === 24 || type === 60) && info && FORM_KIND[info.formType] != null) return FORM_KIND[info.formType];
  return COMPONENT_LABEL[type] || `Component type ${type}`;
}

// How to remove the dependency. `target` = "column" | "table" | "choice".
export function fixHint(type, info, target = "column") {
  const it = target === "table" ? "the table" : target === "choice" ? "the choice" : "the column";
  switch (type) {
    case 24: case 60:
      return target === "table" ? "The form shows it (lookup, sub-grid or quick view) — remove that control, save and publish." : `Remove ${it} from the form, save and publish.`;
    case 26: return target === "table" ? "The view links to it (related columns or a filter on it) — edit the view." : `Remove ${it} from the view: its columns, filter and sort.`;
    case 59: return `The chart groups or aggregates on ${it} — edit or delete the chart.`;
    case 29: {
      const c = info?.category;
      if (c === 2) return `A condition or action of the business rule uses ${it} — edit it and reactivate.`;
      if (c === 5) return `The cloud flow's trigger or an action uses ${it} — edit the flow (or remove it from its solution).`;
      if (c === 4) return `A stage step of the business process flow uses ${it} — remove the step and update the flow.`;
      if (c === 3) return `A parameter or step of the custom action uses ${it} — deactivate and edit it.`;
      return `A step or condition of the process uses ${it} — deactivate it, edit the steps, reactivate.`;
    }
    case 2: return target === "table" ? "A lookup column on another table points to it — delete that relationship first." : `A calculated, rollup or formula column uses ${it} — edit or delete that column first.`;
    case 3: case 10: return "Delete this relationship first (it removes its lookup column).";
    case 14: return `An alternate key includes ${it} — delete the key first.`;
    case 9: return "A column uses this choice — delete the column or switch it to another choice.";
    case 92: return `The plug-in step filters on ${it} (filtering attributes) — remove it there (Plugin Registration Tool).`;
    case 93: return `The plug-in step image carries ${it} — remove it from the image's attributes.`;
    case 46: return "The relationship maps this table — delete the mapping first.";
    case 47: return `A field mapping of a relationship uses ${it} — delete the mapping (relationship › Mappings).`;
    case 70: case 71: return `Field security: remove ${it} from the profile's field permissions, then turn field security off on it.`;
    case 44: case 45: return `A duplicate detection rule uses ${it} — unpublish the rule, then edit or delete it.`;
    case 61: return `A web resource declares a dependency on ${it} — edit the web resource's dependencies.`;
    case 64: case 66: case 68: return `A control is bound to ${it} — remove the control from the form or view.`;
    case 80: return `The app's components include ${it} — remove it in the app designer and publish the app.`;
    case 62: return "The site map has an entry for it — remove the subarea and publish the site map.";
    case 152: case 153: return `An SLA (KPI or condition) uses ${it} — deactivate the SLA and edit it.`;
    case 154: case 155: return `A record creation rule uses ${it} — deactivate it and edit the rule.`;
    case 161: case 162: return "A mobile offline profile includes it — remove it from the profile.";
    case 165: return `A similarity rule uses ${it} — edit the rule.`;
    case 20: case 21: case 16: return "A security role privilege refers to it.";
    case 300: return `The canvas app uses ${it} — edit the app (data source or controls) and republish.`;
    case 31: return `A report uses ${it} — edit or delete the report.`;
    case 36: case 37: case 39: return `A template uses ${it} — edit the template.`;
    default: return "Remove this reference, then try the delete again.";
  }
}

// Rows for the UI and the export: one per dependent component (several dependencies of the same
// component through different required parts are merged), sorted by kind then name; the
// component's own parts (every dependency "solution internal" — a table's own forms and columns)
// come last, flagged `internal`. names: { "<type>|<id>": { name, table, extra… } } from the resolver.
export function impactRows(deps, names, target = "column", targetId = "") {
  const by = new Map();
  const t = lc(targetId);
  for (const d of deps || []) {
    const k = `${d.type}|${d.id}`;
    const info = names?.[k] || {};
    let row = by.get(k);
    if (!row) {
      row = {
        key: k, type: d.type, id: d.id, kind: componentKind(d.type, info),
        name: info.name || "", table: info.table || "", detail: info.detail || "",
        hint: fixHint(d.type, info, target), unpublished: false, internal: true, through: [],
      };
      by.set(k, row);
    }
    if (d.dependencyType === 4) row.unpublished = true;
    if (d.dependencyType !== 1) row.internal = false;
    if (d.requiredId && d.requiredId !== t) {
      const rk = `${d.requiredType}|${d.requiredId}`;
      const rn = names?.[rk]?.name;
      const label = `${COMPONENT_LABEL[d.requiredType] || "Component"} ${rn || d.requiredId.slice(0, 8) + "…"}`;
      if (!row.through.includes(label)) row.through.push(label);
    }
  }
  return [...by.values()].sort((a, b) => (a.internal - b.internal) || a.kind.localeCompare(b.kind) || (a.name || a.id).localeCompare(b.name || b.id));
}

// [{ kind, internal, rows }] in row order.
export function groupRows(rows) {
  const out = [];
  for (const r of rows || []) {
    const last = out[out.length - 1];
    if (last && last.kind === r.kind && last.internal === r.internal) last.rows.push(r); else out.push({ kind: r.kind, internal: r.internal, rows: [r] });
  }
  return out;
}

export const IMPACT_HEADERS = ["Kind", "Name", "Table", "Detail", "Through", "Own part", "Unpublished", "How to remove it", "Component type", "Id"];
export const impactExportRows = (rows) => (rows || []).map(r => [r.kind, r.name, r.table, r.detail, r.through.join("; "), r.internal ? "Yes" : "", r.unpublished ? "Yes" : "", r.hint, r.type, r.id]);
