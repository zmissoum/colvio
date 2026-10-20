// Metadata › ➕ Columns from file — a CSV / Excel sheet describes columns (one per row); Colvio
// checks every row against the table and the org, builds Dataverse's own metadata bodies and
// creates them one by one, then publishes the table once. Pure: parsing, validation, bodies.

// Recognised headers (case-insensitive, spaces and underscores ignored) → spec keys.
const HEADER_ALIASES = {
  label: ["displayname", "display", "label", "columnname", "title"],
  schema: ["schemaname", "schema", "logicalname", "logical", "internalname"],
  type: ["type", "datatype", "kind"],
  required: ["required", "requiredlevel", "requirement", "mandatory"],
  maxLength: ["maxlength", "length", "max length", "size"],
  precision: ["precision", "decimals", "decimalplaces"],
  min: ["min", "minvalue", "minimum"],
  max: ["max", "maxvalue", "maximum"],
  options: ["options", "values", "choices", "optionset", "choicevalues"],
  description: ["description", "help", "tooltip"],
  target: ["target", "targettable", "lookuptarget", "relatedtable", "referencedentity"],
  format: ["format", "subtype"],
};
const normHeader = (h) => String(h || "").toLowerCase().replace(/[\s_\-.]/g, "");

// Type words in the file → Colvio's kinds.
const TYPE_WORDS = {
  string: ["string", "text", "singleline", "singlelineoftext", "line", "nvarchar"],
  memo: ["memo", "multiline", "multilineoftext", "textarea", "multipleline", "multiplelinesoftext", "longtext"],
  integer: ["integer", "int", "wholenumber", "whole", "number", "int32"],
  bigint: ["bigint", "biginteger", "int64", "long"],
  decimal: ["decimal", "decimalnumber", "numeric"],
  double: ["double", "float", "floatingpoint", "floatingpointnumber"],
  money: ["money", "currency", "amount"],
  boolean: ["boolean", "bool", "twooptions", "twooption", "yesno", "yes/no", "bit", "flag", "checkbox"],
  datetime: ["datetime", "dateandtime", "timestamp"],
  date: ["date", "dateonly"],
  picklist: ["picklist", "choice", "optionset", "option", "dropdown", "select", "enum", "singlechoice"],
  multiselect: ["multiselect", "multiselectpicklist", "multichoice", "multiselectchoice", "choicesmulti", "multiselectoptionset", "choices", "choicesmultiselect", "multiselectchoices"],
  lookup: ["lookup", "reference", "relation", "relationship", "foreignkey", "fk"],
};
export const KIND_LABEL = { string: "Text", memo: "Multiline text", integer: "Whole number", bigint: "Big integer", decimal: "Decimal", double: "Float", money: "Currency", boolean: "Yes/No", datetime: "Date and time", date: "Date only", picklist: "Choice", multiselect: "Choices (multi-select)", lookup: "Lookup" };
export const KINDS = Object.keys(KIND_LABEL);
// "Choices (multi-select)" → "choicesmultiselect"; "Yes/No" keeps its slash.
const normType = (w) => String(w || "").toLowerCase().replace(/[^a-z0-9/]/g, "");
export function kindOf(word) {
  const w = normType(word);
  for (const [k, list] of Object.entries(TYPE_WORDS)) if (list.includes(w)) return k;
  return null;
}

const REQ_WORDS = { None: ["", "no", "none", "optional", "false", "0", "n"], Recommended: ["recommended", "businessrecommended", "recommend"], ApplicationRequired: ["required", "yes", "true", "1", "y", "mandatory", "businessrequired", "applicationrequired", "systemrequired"] };
export function requiredOf(word) {
  const w = normHeader(word);
  for (const [k, list] of Object.entries(REQ_WORDS)) if (list.includes(w)) return k;
  return null;
}

// The sheet (array of arrays, first row = headers) → { columns: { key: index }, specs, unknownHeaders }.
export function parseSpecSheet(aoa) {
  const all = aoa || [];
  const filled = (r) => Array.isArray(r) && r.some(c => String(c ?? "").trim() !== "");
  const h0 = all.findIndex(filled);
  if (h0 < 0) return { columns: {}, specs: [], unknownHeaders: [], error: "The file is empty." };
  const rows = [all[h0]];
  const headers = rows[0].map(normHeader);
  const columns = {}, unknownHeaders = [];
  const claim = (key, i) => { if (columns[key] == null) { columns[key] = i; return true; } return false; };
  const bareName = [];
  headers.forEach((h, i) => {
    if (!h) return;
    if (h === "name") { bareName.push(i); return; }
    const key = Object.keys(HEADER_ALIASES).find(k => HEADER_ALIASES[k].map(normHeader).includes(h));
    if (!key || !claim(key, i)) unknownHeaders.push(rows[0][i]);
  });
  // a bare "Name" header is the display name — unless the sheet has one already, then it's the schema name
  for (const i of bareName) if (!claim("label", i) && !claim("schema", i)) unknownHeaders.push(rows[0][i]);
  if (columns.label == null && columns.schema == null) return { columns, specs: [], unknownHeaders, error: "No “Display name” (or “Schema name”) column in the header row." };
  if (columns.type == null) return { columns, specs: [], unknownHeaders, error: "No “Type” column in the header row." };
  const get = (r, k) => (columns[k] == null ? "" : String(r[columns[k]] ?? "").trim());
  // row numbers are the sheet's own (1-based, header included), empty rows skipped
  const specs = all.slice(h0 + 1).map((r, i) => [r, h0 + i + 2]).filter(([r]) => filled(r)).map(([r, row]) => ({
    row, label: get(r, "label"), schema: get(r, "schema"), typeWord: get(r, "type"), requiredWord: get(r, "required"),
    maxLength: get(r, "maxLength"), precision: get(r, "precision"), min: get(r, "min"), max: get(r, "max"),
    options: get(r, "options"), description: get(r, "description"), target: get(r, "target"), format: get(r, "format"),
  }));
  return { columns, specs, unknownHeaders };
}

// "Annual revenue (EUR)" → "AnnualRevenueEUR"; the schema name is prefix + that.
export function deriveSchemaName(label, prefix) {
  const words = String(label || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
  const body = words.map(w => w[0].toUpperCase() + w.slice(1)).join("");
  const p = String(prefix || "").toLowerCase().replace(/_?$/, "_");
  return body ? (p + body).slice(0, 50) : "";
}
const SCHEMA_RE = /^[a-z][a-z0-9]*_[A-Za-z0-9_]+$/;

// "A;B;C" or "1:A;2:B" or "A|B" → [{ value, label }] (values filled from valuePrefix when absent).
export function parseOptions(text, valuePrefix = 10000) {
  const parts = String(text || "").split(/[;|\n]/).map(x => x.trim()).filter(Boolean);
  const out = [];
  parts.forEach((p, i) => {
    const m = p.match(/^(-?\d+)\s*[:=]\s*(.+)$/);
    out.push(m ? { value: Number(m[1]), label: m[2].trim(), explicit: true } : { value: valuePrefix * 10000 + i, label: p });
  });
  return out;
}

// "4,000" is four thousand and "4,5" four and a half: a comma followed by exactly three digits groups,
// any other comma is a decimal point.
const num = (s) => {
  if (s === "") return null;
  let t = String(s).trim().replace(/\s/g, "");
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, ""); else if (!t.includes(".")) t = t.replace(",", ".");
  return Number(t);
};
const INT_MIN = -2147483648, INT_MAX = 2147483647;

// Every spec checked against the prefix, the table's columns and the org's tables. Returns specs
// with { kind, required, schema, logical, errors, warnings }.
export function validateSpecs(specs, { prefix, existingFields = [], entities = [], valuePrefix = 10000 } = {}) {
  const existing = new Set(existingFields.map(f => String(f.logical || f.l || "").toLowerCase()));
  const tables = new Set(entities.map(e => String(e.logical || e.l || "").toLowerCase()));
  const seen = new Map();
  const p = String(prefix || "").toLowerCase().replace(/_?$/, "_");
  return (specs || []).map(s => {
    const errors = [], warnings = [];
    const kind = kindOf(s.typeWord);
    if (!s.typeWord) errors.push("No type."); else if (!kind) errors.push(`Unknown type “${s.typeWord}” (text, multiline, whole number, decimal, float, currency, yes/no, date, datetime, choice, multiselect, lookup).`);
    if (!s.label && !s.schema) errors.push("No display name.");
    let schema = s.schema || deriveSchemaName(s.label, p);
    if (schema && !/_/.test(schema)) schema = p + schema;
    if (!schema) errors.push("No schema name could be derived.");
    else if (!SCHEMA_RE.test(schema)) errors.push(`Schema name “${schema}” must be prefix_Name with letters, digits and underscores.`);
    else if (!schema.toLowerCase().startsWith(p)) errors.push(`Schema name “${schema}” doesn't start with the solution's prefix ${p}.`);
    else if (schema.length > 50) errors.push("Schema name is longer than 50 characters.");
    const logical = schema.toLowerCase();
    if (logical && existing.has(logical)) errors.push(`Column ${logical} already exists on the table.`);
    if (logical && seen.has(logical)) errors.push(`Same schema name as row ${seen.get(logical)}.`); else if (logical) seen.set(logical, s.row);
    const required = s.requiredWord ? requiredOf(s.requiredWord) : "None";
    if (required == null) errors.push(`Unknown required level “${s.requiredWord}” (optional, recommended, required).`);
    const label = s.label || schema.replace(/^[^_]*_/, "");
    if (label.length > 50) warnings.push("Display name over 50 characters is cut.");
    let options = [];
    if (kind === "picklist" || kind === "multiselect") {
      options = parseOptions(s.options, valuePrefix);
      if (!options.length) errors.push("A choice needs its options (Options column: “A;B;C” or “1:A;2:B”).");
      const vals = new Set(), labs = new Set();
      for (const o of options) {
        if (!Number.isInteger(o.value)) errors.push(`Option value “${o.value}” isn't a whole number.`);
        if (vals.has(o.value)) errors.push(`Option value ${o.value} given twice.`); vals.add(o.value);
        if (labs.has(o.label.toLowerCase())) errors.push(`Option “${o.label}” given twice.`); labs.add(o.label.toLowerCase());
      }
    }
    if (kind === "boolean" && s.options) {
      options = parseOptions(s.options, valuePrefix);
      if (options.length !== 2) errors.push("A yes/no column takes exactly two options (“No;Yes”).");
      else if (options.every(o => o.explicit) && !(options.some(o => o.value === 0) && options.some(o => o.value === 1))) errors.push("A yes/no column's values are 0 (no) and 1 (yes) — “0:No;1:Yes”.");
    }
    if (kind === "lookup") {
      if (!s.target) errors.push("A lookup needs its target table (Target column).");
      else if (tables.size && !tables.has(s.target.toLowerCase())) errors.push(`Target table “${s.target}” isn't in this org.`);
    }
    const maxLength = num(s.maxLength), precision = num(s.precision), min = num(s.min), max = num(s.max);
    if (kind === "string" && maxLength != null && (!Number.isInteger(maxLength) || maxLength < 1 || maxLength > 4000)) errors.push("Max length of a text column: 1 to 4000.");
    if (kind === "memo" && maxLength != null && (!Number.isInteger(maxLength) || maxLength < 1 || maxLength > 1048576)) errors.push("Max length of a multiline column: 1 to 1,048,576.");
    if (kind === "decimal" && precision != null && (!Number.isInteger(precision) || precision < 0 || precision > 10)) errors.push("Precision: 0 to 10.");
    if (kind === "double" && precision != null && (!Number.isInteger(precision) || precision < 0 || precision > 5)) errors.push("Precision of a float: 0 to 5.");
    if (kind === "money" && precision != null && (!Number.isInteger(precision) || precision < 0 || precision > 4)) errors.push("Currency precision: 0 to 4.");
    if (kind === "integer") { for (const [n, v] of [["Min", min], ["Max", max]]) if (v != null && (!Number.isInteger(v) || v < INT_MIN || v > INT_MAX)) errors.push(`${n} must be a whole number in the int32 range.`); }
    if (min != null && max != null && min > max) errors.push("Min is above max.");
    if ((s.min || s.max) && Number.isNaN(min + max)) errors.push("Min / max must be numbers.");
    if ((s.maxLength && Number.isNaN(maxLength)) || (s.precision && Number.isNaN(precision))) errors.push("Max length / precision must be numbers.");
    if (s.format && kind === "string" && !stringFormat(s.format)) warnings.push(`Format “${s.format}” unknown for text — Text used.`);
    return { ...s, kind, required, schema, logical, label, options, maxLength, precision, min, max, errors, warnings };
  });
}

const STRING_FORMATS = { text: "Text", email: "Email", url: "Url", phone: "Phone", tickersymbol: "TickerSymbol", textarea: "TextArea", richtext: "RichText", json: "Json" };
const stringFormat = (w) => STRING_FORMATS[normHeader(w)] || null;

const L = (text, lang) => ({ "@odata.type": "Microsoft.Dynamics.CRM.Label", LocalizedLabels: [{ "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel", Label: String(text), LanguageCode: lang }] });
const optionSet = (options, lang, type = "Picklist") => ({ "@odata.type": "Microsoft.Dynamics.CRM.OptionSetMetadata", IsGlobal: false, OptionSetType: type, Options: options.map(o => ({ Value: o.value, Label: L(o.label, lang) })) });

// Dataverse's request for one checked spec: { kind: "attribute"|"relationship", body }.
export function buildCreateBody(spec, { entity, languageCode = 1033 } = {}) {
  const lang = Number(languageCode) || 1033;
  const base = {
    SchemaName: spec.schema, DisplayName: L(spec.label.slice(0, 50), lang),
    RequiredLevel: { Value: spec.required || "None", CanBeChanged: true, ManagedPropertyLogicalName: "canmodifyrequirementlevelsettings" },
    ...(spec.description ? { Description: L(spec.description.slice(0, 2000), lang) } : {}),
  };
  const T = (name, typeName) => ({ "@odata.type": `Microsoft.Dynamics.CRM.${name}AttributeMetadata`, AttributeType: name, AttributeTypeName: { Value: `${typeName || name}Type` } });
  let body;
  switch (spec.kind) {
    case "string": body = { ...T("String"), ...base, MaxLength: spec.maxLength ?? 100, FormatName: { Value: stringFormat(spec.format) || "Text" } }; break;
    case "memo": body = { ...T("Memo"), ...base, MaxLength: spec.maxLength ?? 2000, Format: "TextArea", FormatName: { Value: normHeader(spec.format) === "richtext" ? "RichText" : "TextArea" } }; break;
    case "integer": body = { ...T("Integer"), ...base, Format: "None", MinValue: spec.min ?? INT_MIN, MaxValue: spec.max ?? INT_MAX }; break;
    case "bigint": body = { ...T("BigInt"), ...base }; break;
    case "decimal": body = { ...T("Decimal"), ...base, Precision: spec.precision ?? 2, MinValue: spec.min ?? -100000000000, MaxValue: spec.max ?? 100000000000 }; break;
    case "double": body = { ...T("Double"), ...base, Precision: spec.precision ?? 2, MinValue: spec.min ?? -100000000000, MaxValue: spec.max ?? 100000000000 }; break;
    case "money": body = { ...T("Money"), ...base, PrecisionSource: spec.precision != null ? 0 : 2, ...(spec.precision != null ? { Precision: spec.precision } : {}), MinValue: spec.min ?? -922337203685477, MaxValue: spec.max ?? 922337203685477 }; break;
    case "boolean": {
      let no = "No", yes = "Yes";
      if (spec.options?.length === 2) {
        const [a, b] = spec.options;
        // "1:Yes;0:No" — explicit values decide which label is which; without values the order is No;Yes
        if (a.explicit && b.explicit) { yes = (a.value === 1 ? a : b).label; no = (a.value === 1 ? b : a).label; } else { no = a.label; yes = b.label; }
      }
      body = { ...T("Boolean"), ...base, DefaultValue: false, OptionSet: { TrueOption: { Value: 1, Label: L(yes, lang) }, FalseOption: { Value: 0, Label: L(no, lang) }, OptionSetType: "Boolean" } };
      break;
    }
    case "datetime": body = { ...T("DateTime"), ...base, Format: "DateAndTime", DateTimeBehavior: { Value: "UserLocal" } }; break;
    case "date": body = { ...T("DateTime"), ...base, Format: "DateOnly", DateTimeBehavior: { Value: "DateOnly" } }; break;
    case "picklist": body = { ...T("Picklist"), ...base, OptionSet: optionSet(spec.options, lang) }; break;
    case "multiselect": body = { "@odata.type": "Microsoft.Dynamics.CRM.MultiSelectPicklistAttributeMetadata", AttributeType: "Virtual", AttributeTypeName: { Value: "MultiSelectPicklistType" }, ...base, OptionSet: optionSet(spec.options, lang) }; break;
    case "lookup": {
      const target = String(spec.target).toLowerCase();
      return {
        kind: "relationship",
        body: {
          "@odata.type": "Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata",
          SchemaName: `${spec.schema.split("_")[0]}_${target}_${entity}_${spec.schema.replace(/^[^_]*_/, "")}`.slice(0, 100),
          ReferencedEntity: target, ReferencingEntity: entity,
          Lookup: { "@odata.type": "Microsoft.Dynamics.CRM.LookupAttributeMetadata", AttributeType: "Lookup", AttributeTypeName: { Value: "LookupType" }, ...base },
          AssociatedMenuConfiguration: { Behavior: "UseCollectionName", Group: "Details", Order: 10000 },
          CascadeConfiguration: { Assign: "NoCascade", Delete: "RemoveLink", Merge: "NoCascade", Reparent: "NoCascade", Share: "NoCascade", Unshare: "NoCascade" },
        },
      };
    }
    default: throw new Error(`Unsupported kind ${spec.kind}`);
  }
  return { kind: "attribute", body };
}

// The CSV template offered for download.
export const TEMPLATE_HEADERS = ["Display name", "Schema name", "Type", "Required", "Max length", "Precision", "Min", "Max", "Options", "Target", "Format", "Description"];
export const TEMPLATE_ROWS = [
  ["SAP ID", "", "Text", "Recommended", "20", "", "", "", "", "", "", "Identifier of the company in SAP"],
  ["Credit limit", "", "Currency", "No", "", "2", "0", "", "", "", "", ""],
  ["Risk level", "", "Choice", "No", "", "", "", "", "Low;Medium;High", "", "", ""],
  ["Audited", "", "Yes/No", "No", "", "", "", "", "No;Yes", "", "", ""],
  ["Last audit", "", "Date", "No", "", "", "", "", "", "", "", ""],
  ["Key account manager", "", "Lookup", "No", "", "", "", "", "", "systemuser", "", "Who follows this account"],
  ["Internal notes", "", "Multiline", "No", "4000", "", "", "", "", "", "", ""],
];

export function summarizeResults(results) {
  const ok = results.filter(r => r.ok).length;
  const failed = results.filter(r => r.ok === false).length;
  return { ok, failed, skipped: results.length - ok - failed };
}
