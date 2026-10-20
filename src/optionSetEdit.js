// Metadata › choice values editor — add, rename, reorder and delete the options of a choice column
// (local or global option set) through Dataverse's own actions (InsertOptionValue,
// UpdateOptionValue, OrderOption, DeleteOptionValue), then publish. Pure: request bodies,
// validation, ordering, the pre-delete count query.

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
export const INT_MIN = -2147483648, INT_MAX = 2147483647;
export const OP_ACTION = { insert: "InsertOptionValue", update: "UpdateOptionValue", delete: "DeleteOptionValue", order: "OrderOption" };

export function labelBody(text, languageCode) {
  return {
    "@odata.type": "Microsoft.Dynamics.CRM.Label",
    LocalizedLabels: [{ "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel", Label: String(text), LanguageCode: Number(languageCode) || 1033 }],
  };
}

// Which option set the action targets: a global one by name, a local one through its column.
export function targetParams(t) {
  if (t?.isGlobal) {
    if (!NAME_RE.test(String(t.name || ""))) throw new Error("Invalid global choice name.");
    return { OptionSetName: t.name };
  }
  if (!NAME_RE.test(String(t?.entity || "")) || !NAME_RE.test(String(t?.attribute || ""))) throw new Error("Invalid table or column name.");
  return { EntityLogicalName: t.entity, AttributeLogicalName: t.attribute };
}

export const insertBody = (t, label, value, lang) => ({ ...targetParams(t), Label: labelBody(label, lang), ...(value != null && value !== "" ? { Value: Number(value) } : {}) });
export const updateBody = (t, value, label, lang) => ({ ...targetParams(t), Value: Number(value), Label: labelBody(label, lang), MergeLabels: true });
export const deleteBody = (t, value) => ({ ...targetParams(t), Value: Number(value) });
export const orderBody = (t, values) => ({ ...targetParams(t), Values: (values || []).map(Number) });

// A new option: a label, and a value (optional — Dataverse then picks one with the publisher prefix).
export function validateNewOption(label, value, existing) {
  const l = String(label || "").trim();
  if (!l) return "Give the option a label.";
  if (l.length > 250) return "The label is longer than 250 characters.";
  if ((existing || []).some(o => String(o.label || "").trim().toLowerCase() === l.toLowerCase())) return `An option is already labelled “${l}”.`;
  if (value == null || value === "") return null;
  if (!/^-?\d+$/.test(String(value).trim())) return "The value must be a whole number.";
  const v = Number(value);
  if (v < INT_MIN || v > INT_MAX) return "The value is out of range.";
  if ((existing || []).some(o => Number(o.value) === v)) return `Value ${v} is already used.`;
  return null;
}

export function validateRename(label, option, existing) {
  const l = String(label || "").trim();
  if (!l) return "The label can't be empty.";
  if (l.length > 250) return "The label is longer than 250 characters.";
  if (l === String(option?.label || "").trim()) return "unchanged";
  if ((existing || []).some(o => Number(o.value) !== Number(option?.value) && String(o.label || "").trim().toLowerCase() === l.toLowerCase())) return `An option is already labelled “${l}”.`;
  return null;
}

// Move one value up (-1) or down (+1) in the order.
export function moveValue(values, index, dir) {
  const out = [...(values || [])];
  const j = index + dir;
  if (index < 0 || index >= out.length || j < 0 || j >= out.length) return out;
  [out[index], out[j]] = [out[j], out[index]];
  return out;
}
export const sameOrder = (a, b) => (a || []).length === (b || []).length && (a || []).every((v, i) => Number(v) === Number(b[i]));

// How many rows of the column hold the value — asked before a delete (rows keep the number, but
// no label shows any more). One aggregate; past 50,000 rows the server refuses and we say so.
export function countRowsFetch(entity, pk, attribute, value) {
  if (!NAME_RE.test(entity) || !NAME_RE.test(pk) || !NAME_RE.test(attribute)) throw new Error("Invalid name.");
  return `<fetch aggregate="true"><entity name="${entity}"><attribute name="${pk}" alias="n" aggregate="count"/><filter><condition attribute="${attribute}" operator="eq" value="${Number(value)}"/></filter></entity></fetch>`;
}

export function deleteConfirmText({ option, rows, isGlobal, name, column }) {
  const lines = [`Delete the option “${option.label}” (${option.value})${isGlobal ? ` from the global choice ${name}` : ` of ${column}`}?`, ""];
  if (rows == null) lines.push("Its use couldn't be counted.");
  else if (rows === "many") lines.push("More than 50,000 rows of this column hold it.");
  else if (rows > 0) lines.push(`${rows.toLocaleString("en-US")} row${rows === 1 ? "" : "s"} of this column hold it.`);
  else lines.push("No row of this column holds it.");
  if (rows !== 0) lines.push("They keep the number, but no label will show for it any more — views, forms and filters on it break silently.");
  if (isGlobal) lines.push("It's a global choice: other columns using it lose the option too.");
  lines.push("", "This can't be undone (re-creating the option gives it back its label, not its history).");
  return lines.join("\n");
}
