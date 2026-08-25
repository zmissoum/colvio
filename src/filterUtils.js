// OData $filter clause construction for one Builder condition — PURE, unit-tested.
//
// The type-driven quoting IS the injection defense: values only go in UNQUOTED when they
// match the strict shape their field type requires (number, GUID, true/false) — anything
// else is single-quote-escaped and quoted, so "1 or 1 eq 1" in a numeric condition can
// never become executable OData. Moved out of Explorer.jsx so these guarantees are pinned
// by tests instead of living untested inside the component.

export function buildFilterClause(fieldName, op, val, fl = []) {
  const getOdataName = (logicalName) => fl.find(x => x.l === logicalName)?.odata || logicalName;
  const getFieldType = (logicalName) => fl.find(x => x.l === logicalName)?.t || "String";

  if (!fieldName) return "";
  if (op === "is_null") return `${getOdataName(fieldName)} eq null`;
  if (op === "is_not_null") return `${getOdataName(fieldName)} ne null`;
  if (!val) return "";
  const odataField = getOdataName(fieldName);
  const fType = getFieldType(fieldName);
  const escaped = val.replace(/'/g, "''");
  const isStringType = fType === "String" || fType === "Memo";

  if (op === "contains" || op === "startswith" || op === "endswith") {
    if (!isStringType) { op = "eq"; }
    else return `${op}(${odataField},'${escaped}')`;
  }
  if (op === "not_contains" || op === "not_startswith" || op === "not_endswith") {
    if (!isStringType) { op = "ne"; }
    else { const fn = op.replace("not_", ""); return `not ${fn}(${odataField},'${escaped}')`; }
  }
  const noQuoteTypes = new Set(["Integer", "Picklist", "State", "Status", "Boolean", "Money", "Decimal", "Double", "BigInt"]);
  if (noQuoteTypes.has(fType)) {
    // Security: validate numeric value to prevent OData injection (e.g. "1 or 1 eq 1")
    const sanitized = val.trim();
    if (fType === "Boolean" && (sanitized === "true" || sanitized === "false")) return `${odataField} ${op} ${sanitized}`;
    if (/^-?\d+(\.\d+)?$/.test(sanitized)) return `${odataField} ${op} ${sanitized}`;
    return `${odataField} ${op} '${escaped}'`; // fallback to quoted string if not a valid number
  }

  // Lookup / Customer / Owner (polymorphic principal) and the Uniqueidentifier primary key are all
  // compared by GUID — unquoted in OData. Owner/Uniqueidentifier were missing → "incompatible types"
  // 400 (e.g. ownerid eq 'guid'). getOdataName already maps these to the _value column.
  if (fType === "Lookup" || fType === "Customer" || fType === "Owner" || fType === "Uniqueidentifier") {
    // Security: validate GUID format to prevent OData injection
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val.trim())) return `${odataField} ${op} ${val.trim()}`;
    return `${odataField} ${op} '${escaped}'`; // fallback
  }

  return `${odataField} ${op} '${escaped}'`;
}
