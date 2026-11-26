// Metadata › the size and format of a column — max length of a text, range and precision of a
// number, behavior of a date, max size of a file. Dataverse keeps these on the TYPED attribute
// metadata only (StringAttributeMetadata, DecimalAttributeMetadata…), never on the base
// AttributeMetadata, so getFields reads one cast per type and merges them here. Pure.

// The typed casts getFields reads, with the properties each one holds.
export const FACET_CASTS = [
  ["StringAttributeMetadata", "LogicalName,MaxLength,Format"],
  ["MemoAttributeMetadata", "LogicalName,MaxLength,Format"],
  ["IntegerAttributeMetadata", "LogicalName,MinValue,MaxValue,Format"],
  ["BigIntAttributeMetadata", "LogicalName,MinValue,MaxValue"],
  ["DecimalAttributeMetadata", "LogicalName,MinValue,MaxValue,Precision"],
  ["DoubleAttributeMetadata", "LogicalName,MinValue,MaxValue,Precision"],
  ["MoneyAttributeMetadata", "LogicalName,MinValue,MaxValue,Precision,PrecisionSource"],
  ["DateTimeAttributeMetadata", "LogicalName,Format,DateTimeBehavior"],
  ["FileAttributeMetadata", "LogicalName,MaxSizeInKB"],
  ["ImageAttributeMetadata", "LogicalName,MaxSizeInKB"],
];

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

// Rows of the typed casts (any order, any mix) → { logicalName: facets }.
export function facetMap(rows) {
  const out = {};
  for (const a of rows || []) {
    if (!a?.LogicalName) continue;
    const f = out[a.LogicalName] || (out[a.LogicalName] = {});
    if (num(a.MaxLength) != null) f.maxLength = a.MaxLength;
    if (num(a.MinValue) != null) f.minValue = a.MinValue;
    if (num(a.MaxValue) != null) f.maxValue = a.MaxValue;
    if (num(a.Precision) != null) f.precision = a.Precision;
    if (num(a.PrecisionSource) != null) f.precisionSource = a.PrecisionSource;
    if (num(a.MaxSizeInKB) != null) f.maxSizeKB = a.MaxSizeInKB;
    if (typeof a.Format === "string" && a.Format) f.format = a.Format;
    const beh = a.DateTimeBehavior?.Value ?? a.DateTimeBehavior;
    if (typeof beh === "string" && beh) f.dateBehavior = beh;
  }
  return out;
}

// The ranges Dataverse gives a new column when none is set — shown only when narrowed.
const DEFAULT_RANGE = {
  Integer: [-2147483648, 2147483647],
  BigInt: [-9223372036854775808, 9223372036854775807],
  Decimal: [-100000000000, 100000000000],
  Double: [-100000000000, 100000000000],
  Money: [-922337203685477, 922337203685477],
};
const n = (v) => v.toLocaleString("en-US", { maximumFractionDigits: 10 });
const BEHAVIOR = { UserLocal: "user local", DateOnly: "date only", TimeZoneIndependent: "time-zone independent" };
const MONEY_SOURCE = { 1: "org pricing precision", 2: "currency precision" };
// Formats that are just the type's plain default — not worth a word.
const PLAIN_FORMAT = new Set(["Text", "TextArea", "None"]);

// A column (getFields shape) → its facets as short parts: ["max 100", "Email"], ["2 decimals", "0 – 100"]…
export function facetParts(f) {
  if (!f) return [];
  const out = [];
  const t = f.type;
  if ((t === "String" || t === "Memo") && f.maxLength != null) out.push(`max ${n(f.maxLength)}`);
  if (t === "Money") {
    if (f.precisionSource === 1 || f.precisionSource === 2) out.push(MONEY_SOURCE[f.precisionSource]);
    else if (f.precision != null) out.push(`${f.precision} decimal${f.precision === 1 ? "" : "s"}`);
  } else if ((t === "Decimal" || t === "Double") && f.precision != null) out.push(`${f.precision} decimal${f.precision === 1 ? "" : "s"}`);
  if (DEFAULT_RANGE[t] && (f.minValue != null || f.maxValue != null)) {
    const [dMin, dMax] = DEFAULT_RANGE[t];
    if (f.minValue !== dMin || f.maxValue !== dMax) out.push(`${f.minValue != null ? n(f.minValue) : "…"} – ${f.maxValue != null ? n(f.maxValue) : "…"}`);
  }
  if (t === "DateTime") {
    if (f.format) out.push(f.format === "DateOnly" ? "date" : f.format === "DateAndTime" ? "date and time" : f.format);
    if (f.dateBehavior) out.push(BEHAVIOR[f.dateBehavior] || f.dateBehavior);
  } else if (f.format && !PLAIN_FORMAT.has(f.format)) out.push(f.format);
  if ((t === "File" || t === "Image") && f.maxSizeKB != null) out.push(f.maxSizeKB >= 1024 ? `max ${n(Math.round(f.maxSizeKB / 1024 * 10) / 10)} MB` : `max ${n(f.maxSizeKB)} KB`);
  return out;
}
export const facetText = (f) => facetParts(f).join(" · ");

// Every facet in full, for the cell's tooltip (defaults included).
export function facetTitle(f) {
  if (!f) return "";
  const lines = [];
  if (f.maxLength != null) lines.push(`Max length: ${n(f.maxLength)} characters`);
  if (f.precision != null && f.precisionSource !== 1 && f.precisionSource !== 2) lines.push(`Precision: ${f.precision}`);
  if (f.precisionSource === 1 || f.precisionSource === 2) lines.push(`Precision: ${MONEY_SOURCE[f.precisionSource]}`);
  if (f.minValue != null) lines.push(`Min: ${n(f.minValue)}`);
  if (f.maxValue != null) lines.push(`Max: ${n(f.maxValue)}`);
  if (f.format) lines.push(`Format: ${f.format}`);
  if (f.dateBehavior) lines.push(`Behavior: ${f.dateBehavior}`);
  if (f.maxSizeKB != null) lines.push(`Max size: ${n(f.maxSizeKB)} KB`);
  return lines.join("\n");
}

// The export columns of "Export All Fields".
export const FACET_HEADERS = ["Max length", "Precision", "Min", "Max", "Format"];
export function facetCells(f) {
  const p = f?.precisionSource === 1 || f?.precisionSource === 2 ? MONEY_SOURCE[f.precisionSource] : f?.precision;
  return [f?.maxLength ?? "", p ?? "", f?.minValue ?? "", f?.maxValue ?? "", [f?.format, f?.dateBehavior].filter(Boolean).join(" · ") || (f?.maxSizeKB != null ? `max ${f.maxSizeKB} KB` : "")];
}

// Demo mode: the account columns' facets as a stock Dataverse org has them.
const S = (maxLength, format = "Text") => ({ maxLength, format });
export const DEMO_FACETS = {
  name: S(160), accountnumber: S(20), new_sapid: S(20), new_siretcode: S(17),
  telephone1: S(50, "Phone"), telephone2: S(50, "Phone"), fax: S(50, "Phone"),
  websiteurl: S(200, "Url"), emailaddress1: S(100, "Email"),
  address1_line1: S(250), address1_line2: S(250), address1_city: S(80), address1_stateorprovince: S(50),
  address1_postalcode: S(20), address1_country: S(80),
  revenue: { precisionSource: 2, precision: 2, minValue: 0, maxValue: 100000000000000 },
  numberofemployees: { minValue: 0, maxValue: 1000000000, format: "None" },
  createdon: { format: "DateAndTime", dateBehavior: "UserLocal" },
  modifiedon: { format: "DateAndTime", dateBehavior: "UserLocal" },
};
