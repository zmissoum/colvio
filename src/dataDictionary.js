// Metadata › data dictionary — every column of the chosen tables, one row per column, read by
// packets of tables (one metadata query each) and streamed to a file. Pure: row shaping.

export const DICT_CHUNK = 20;
export const DICT_HEADERS = ["Table", "Table display name", "Column", "Schema name", "Display name", "Type", "Required", "Custom", "Primary key", "Primary name", "Valid for create", "Valid for update", "Description", "Table description"];

export const labelOf = (l) => l?.UserLocalizedLabel?.Label || l?.LocalizedLabels?.[0]?.Label || "";
const REQUIRED = { None: "Optional", Recommended: "Recommended", ApplicationRequired: "Required", SystemRequired: "System required" };
export const requiredLabel = (r) => REQUIRED[r?.Value ?? r] || String(r?.Value ?? r ?? "");
// AttributeTypeName.Value ("StringType", "LookupType"…) → "String", "Lookup"; AttributeType as fallback.
export const typeLabel = (a) => (String(a?.AttributeTypeName?.Value || a?.AttributeType || "").replace(/Type$/, "")) || "";

// EntityDefinitions rows (with their Attributes) → dictionary rows, table by table, columns sorted.
// Helper columns that only mirror another one (AttributeOf: the name of a lookup, a yomi…) are left out.
export function dictRows(defs) {
  const out = [];
  for (const e of (defs || []).slice().sort((a, b) => String(a.LogicalName).localeCompare(String(b.LogicalName)))) {
    const tLabel = labelOf(e.DisplayName), tDesc = labelOf(e.Description);
    const attrs = (e.Attributes || []).filter(a => !a.AttributeOf).sort((a, b) => String(a.LogicalName).localeCompare(String(b.LogicalName)));
    for (const a of attrs) {
      out.push([
        e.LogicalName, tLabel, a.LogicalName, a.SchemaName || "", labelOf(a.DisplayName), typeLabel(a), requiredLabel(a.RequiredLevel),
        a.IsCustomAttribute ? "Yes" : "No", a.IsPrimaryId ? "Yes" : "", a.IsPrimaryName ? "Yes" : "",
        a.IsValidForCreate ? "Yes" : "No", a.IsValidForUpdate ? "Yes" : "No", labelOf(a.Description), tDesc,
      ]);
    }
  }
  return out;
}

export function chunks(list, n = DICT_CHUNK) {
  const out = [];
  for (let i = 0; i < (list || []).length; i += n) out.push(list.slice(i, i + n));
  return out;
}

// One option (choice) of a column → what the panel shows and exports.
export function optionRow(o) {
  return {
    value: o?.Value,
    label: labelOf(o?.Label) || `Value ${o?.Value}`,
    labels: (o?.Label?.LocalizedLabels || []).map(l => l && l.Label).filter(Boolean),
    color: o?.Color || null,
    description: labelOf(o?.Description),
    isDefault: !!o?.IsDefaultValue,
  };
}
// Typed attribute-metadata rows (Picklist / MultiSelect / State / Status) → { column: options[] }.
export function optionSetsFrom(rows) {
  const out = {};
  for (const a of rows || []) {
    const local = a?.OptionSet?.Options || [];
    const opts = local.length ? local : (a?.GlobalOptionSet?.Options || []);
    if (a?.LogicalName) out[a.LogicalName] = opts.map(optionRow);
  }
  return out;
}
