// Demo store for Metadata › choice values editor: each demo choice column's options live in
// memory and the four actions change them, so the editor behaves like it does on an org.
import { FLDS } from "./shared.jsx";

const store = new Map(); // "entity.field" → { isGlobal, name, options: [{ value, label }] }

function get(entity, field) {
  const k = `${entity}.${field}`;
  if (!store.has(k)) {
    const f = FLDS.find(x => x.l === field);
    store.set(k, { isGlobal: field === "customertypecode", name: field === "customertypecode" ? "account_customertypecode" : "", options: (f?.opts || []).map(o => ({ value: o.v, label: o.l })) });
  }
  return store.get(k);
}
const keyOf = (b) => (b.OptionSetName ? [...store.entries()].find(([, v]) => v.name === b.OptionSetName)?.[0] : `${b.EntityLogicalName}.${b.AttributeLogicalName}`);
const labelOf = (b) => b.Label?.LocalizedLabels?.[0]?.Label || "";

export function demoOptionSetInfo(entity, field) {
  const s = get(entity, field);
  return { isGlobal: s.isGlobal, name: s.name, managed: false, customizable: true, languageCode: 1033, options: s.options.map(o => ({ ...o, color: null })) };
}

export function demoOptionSetChange(op, body) {
  const s = store.get(keyOf(body));
  if (!s) throw new Error("Unknown choice.");
  if (op === "insert") {
    const value = body.Value ?? Math.max(100000000, ...s.options.map(o => o.value + 1));
    if (s.options.some(o => o.value === value)) throw new Error(`Value ${value} already exists.`);
    s.options.push({ value, label: labelOf(body) });
    return { NewOptionValue: value };
  }
  if (op === "update") { const o = s.options.find(x => x.value === body.Value); if (!o) throw new Error("No such option."); o.label = labelOf(body); return { ok: true }; }
  if (op === "delete") { s.options = s.options.filter(x => x.value !== body.Value); return { ok: true }; }
  if (op === "order") { const by = new Map(s.options.map(o => [o.value, o])); s.options = body.Values.map(v => by.get(v)).filter(Boolean); return { ok: true }; }
  throw new Error("Unknown change.");
}
