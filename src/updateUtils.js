// Typed write preparation — the SHARED defense for every user-typed value Colvio PATCHes
// (Explorer bulk update, Explorer inline edit, Show-All-Data field edit). PURE, unit-tested.
//
// Born from two user-hit bug classes:
//  - raw strings into numeric/GUID fields die on the server with a cryptic 400 (the Loader
//    learned this in v1.11.138 — this module closes the same hole on the OTHER write paths);
//  - a silent parseInt fallback turned a mistyped number into null and CLEARED the field.
// Every refusal happens BEFORE anything is sent, with a readable reason.
import { coerceForFieldType } from "./loaderUtils.js";

export const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Scalar coercion for one NON-EMPTY typed-in value (empty = clear is the caller's decision).
 * @returns {ok:true, value} | {ok:false, reason} — never a silent null.
 */
export function coerceScalarForEdit(rawStr, t) {
  const s = String(rawStr ?? "").trim();
  if (t === "Uniqueidentifier") {
    if (!GUID_RE.test(s)) return { ok: false, reason: "expects a GUID (36 characters like 00000000-0000-0000-0000-000000000000)" };
    return { ok: true, value: s };
  }
  if (t === "DateTime") {
    if (isNaN(Date.parse(s))) return { ok: false, reason: `"${s}" is not a recognizable date — use ISO format: 2026-08-26 or 2026-08-26T14:30:00Z` };
    return { ok: true, value: s };
  }
  if (t === "Picklist" || t === "State" || t === "Status") {
    const c = coerceForFieldType(s, "Integer");
    if (!c.ok) return { ok: false, reason: "is an option set — use the option's NUMERIC value, not the label" };
    return c;
  }
  if (t) return coerceForFieldType(s, t); // numerics + Boolean coerced or refused; String/Memo pass through
  return { ok: true, value: s };
}

/**
 * Full PATCH-body preparation for one field. Lookups can't be written through their _value
 * column at all — they need nav@odata.bind toward the target's entity set (empty clears via
 * {nav: null}); polymorphic lookups need the caller to name the target table.
 * @param meta {fieldTypes: {field→type}, lookupBinds: {field→[{nav,target,set}]}, odataFieldMap}
 * @returns {ok:true, body, localValue} | {ok:false, reason, needsTarget?} — body is the PATCH
 *          fragment, localValue what the displayed row should show after the write.
 */
export function prepareUpdate(meta, field, rawStr, lookupTarget) {
  const { fieldTypes, lookupBinds, odataFieldMap } = meta || {};
  const odataField = odataFieldMap?.[field] || field;
  const t = fieldTypes?.[field];
  const isEmpty = rawStr === "" || rawStr === "null";
  if (t === "Lookup" || t === "Owner" || t === "Customer") {
    const binds = lookupBinds?.[field];
    if (!binds?.length) return { ok: false, reason: `"${field}" is a lookup but its relationship metadata isn't available here — use the Data Loader for this update.` };
    const b = binds.length === 1 ? binds[0] : binds.find(x => x.target === lookupTarget);
    if (!b) return { ok: false, needsTarget: true, reason: `"${field}" can point to ${binds.map(x => x.target).join(" or ")} — pick the target table first.` };
    if (isEmpty) return { ok: true, body: { [b.nav]: null }, localValue: null }; // clears the lookup
    const g = String(rawStr).trim();
    if (!GUID_RE.test(g)) return { ok: false, reason: `"${field}" is a lookup to ${b.target} — the value must be that record's GUID (36 characters), not text. Matching on a name or business code is the Data Loader's job (lookup resolve mode / alternate keys).` };
    if (!b.set) return { ok: false, reason: `Can't resolve the entity set for "${b.target}" — use the Data Loader for this update.` };
    return { ok: true, body: { [`${b.nav}@odata.bind`]: `/${b.set}(${g})` }, localValue: g };
  }
  if (isEmpty) return { ok: true, body: { [odataField]: null }, localValue: null };
  if (t === undefined) { // no metadata (raw query on another table, aliases) — legacy heuristic
    let val = rawStr;
    if (val === "true") val = true;
    else if (val === "false") val = false;
    else if (!isNaN(val) && String(val).trim() !== "") val = Number(val);
    return { ok: true, body: { [odataField]: val }, localValue: val };
  }
  const c = coerceScalarForEdit(rawStr, t);
  // Reasons that embed the typed value already read fine alone; bare ones get the field name.
  if (!c.ok) return { ok: false, reason: c.reason.startsWith('"') ? c.reason : `"${field}" ${c.reason}` };
  return { ok: true, body: { [odataField]: c.value }, localValue: c.value };
}
