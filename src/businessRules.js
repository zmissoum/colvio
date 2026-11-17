// Automation › Business rules — what a business rule does, read from its definition: the
// workflow row (category 2) holds the rule as XAML (workflow.xaml), the same serialized
// Windows Workflow the classic workflows use, with the form actions as mcwc:* activities
// (Microsoft.Crm.Workflow.ClientActivities). Its scope sits on the same row:
// processtriggerscope 2 = Entity (every form + the server on save), 1 = Form, with
// processtriggerformid naming the one form — none = All forms.
//
// The shape the designer writes (checked against rules exported in public solutions):
//   mxswa:Workflow
//     ActivityReference ConditionSequence          ← one IF … (ELSE IF …) (ELSE …)
//       Activities: GetEntityProperty (column → variable), EvaluateExpression CreateCrmType
//         (a fixed value → variable), EvaluateCondition (operand, operator, parameters → boolean),
//         EvaluateLogicalCondition (And / Or of two booleans), then the ConditionBranch(es):
//       ConditionBranch  Condition=[var]  Then = Composite (the actions, or a nested IF)
//       ConditionBranch  Condition=[True]          ← the ELSE ("Otherwise") of the designer
//   an action = Sequence DisplayName="SetVisibilityStep1: <label>" around one mcwc activity:
//     SetVisibility IsVisible · SetDisplayMode IsReadOnly · SetFieldRequiredLevel RequiredLevel
//     SetMessage (StepLabels › StepLabel Description) · SetDefaultValue / SetAttributeValue
//     (the column and value are the SetEntityProperty of the same Sequence; no value = clear)
// Anything else is shown by its own name, never dropped. Pure: no React, no API.
import { parseXml } from "./viewInspectorUtils.js";

const local = (t) => String(t || "").replace(/^.*:/, "");
const keyOf = (el) => {
  for (const k of Object.keys(el.attrs || {})) if (k === "x:Key" || k === "Key" || /:Key$/.test(k)) return el.attrs[k];
  return null;
};
// "Microsoft.Crm.Workflow.Activities.ConditionSequence, Microsoft.Crm.Workflow, …" → ConditionSequence
const kindOf = (el) => local(el.tag) === "ActivityReference"
  ? String(el.attrs.AssemblyQualifiedName || "").split(",")[0].trim().split(".").pop()
  : local(el.tag);
// the keyed argument / property of an activity: directly under it or under its .Arguments / .Properties
function keyed(el, key) {
  if (!el) return null;
  for (const c of el.children) {
    if (keyOf(c) === key) return c;
    if (/\.(Arguments|Properties)$/.test(local(c.tag))) for (const g of c.children) if (keyOf(g) === key) return g;
  }
  return null;
}
const argText = (el, key) => String(keyed(el, key)?.text || "").trim();
const varOf = (s) => /^\[\s*([A-Za-z_]\w*)\s*\]$/.exec(String(s || "").trim())?.[1] || null;
const activitiesOf = (el) => keyed(el, "Activities")?.children || [];
const lc = (s) => String(s ?? "").trim().toLowerCase();

// "[New Object() { Microsoft.Xrm.Sdk.Workflow.WorkflowPropertyType.Boolean, "1" }]" → tokens
export function paramTokens(text) {
  const s = String(text || "").trim();
  const m = /^\[\s*New\s+Object\(\)\s*\{([\s\S]*)\}\s*\]$/i.exec(s);
  if (!m) { const v = varOf(s); return v ? [{ var: v }] : []; }
  const out = [];
  let cur = "", inQ = false;
  for (const ch of m[1]) {
    if (ch === '"') { inQ = !inQ; cur += ch; continue; }
    if (ch === "," && !inQ) { out.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.map(t => {
    const q = /^"([\s\S]*)"$/.exec(t);
    if (q) return { str: q[1].replace(/""/g, '"') };
    const ty = /WorkflowPropertyType\.(\w+)$/.exec(t);
    if (ty) return { type: ty[1] };
    if (/^[A-Za-z_]\w*$/.test(t) && !/^(Nothing)$/i.test(t)) return { var: t };
    return { raw: t };
  });
}

// every variable the definition computes, by name — names are unique in a definition
// (ConditionBranchStep2_1, SetDefaultValueStep3_1 …), so one pass over the whole tree is enough
function collectDefs(node, defs) {
  for (const el of node.children || []) {
    const k = kindOf(el);
    if (k === "GetEntityProperty") {
      const v = varOf(el.attrs.Value);
      if (v) defs.set(v, { kind: "field", column: lc(el.attrs.Attribute), entity: lc(el.attrs.EntityName) });
    } else if (k === "EvaluateExpression") {
      const v = varOf(argText(el, "Result"));
      const op = argText(el, "ExpressionOperator");
      const toks = paramTokens(argText(el, "Parameters"));
      if (v) {
        if (op === "CreateCrmType") defs.set(v, { kind: "literal", type: toks.find(t => t.type)?.type || "", values: toks.filter(t => t.str !== undefined).map(t => t.str) });
        else defs.set(v, { kind: "expr", op, args: toks });
      }
    } else if (k === "EvaluateCondition") {
      const v = varOf(argText(el, "Result"));
      if (v) defs.set(v, { kind: "cond", op: argText(el, "ConditionOperator"), operand: varOf(argText(el, "Operand")), params: paramTokens(argText(el, "Parameters")) });
    } else if (k === "EvaluateLogicalCondition") {
      const v = varOf(argText(el, "Result"));
      if (v) defs.set(v, { kind: "logic", op: argText(el, "LogicalOperator"), left: varOf(argText(el, "LeftOperand")), right: varOf(argText(el, "RightOperand")) });
    }
    collectDefs(el, defs);
  }
}

// a value: another column, a fixed value, a formula — or null when nothing computes it
function resolveValue(tok, defs, depth = 0) {
  if (!tok) return null;
  if (tok.str !== undefined) return { kind: "literal", type: "String", values: [tok.str] };
  if (tok.raw !== undefined) return { kind: "raw", text: tok.raw };
  if (!tok.var || depth > 12) return null;
  const d = defs.get(tok.var);
  if (!d) return null;
  if (d.kind === "field") return { kind: "field", column: d.column };
  if (d.kind === "literal") return { kind: "literal", type: d.type, values: d.values };
  if (d.kind === "expr") return { kind: "expr", op: d.op, args: d.args.filter(a => !a.type).map(a => resolveValue(a, defs, depth + 1)) };
  return null;
}

function resolveCond(v, defs, depth = 0) {
  const d = v ? defs.get(v) : null;
  if (!d || depth > 40) return { type: "unknown", var: v || "" };
  if (d.kind === "cond") {
    const operand = d.operand ? defs.get(d.operand) : null;
    return {
      type: "cond",
      column: operand?.kind === "field" ? operand.column : "",
      left: operand?.kind === "field" ? null : resolveValue(d.operand ? { var: d.operand } : null, defs),
      op: d.op,
      values: d.params.filter(t => !t.type).map(t => resolveValue(t, defs)).filter(Boolean),
    };
  }
  if (d.kind === "logic") {
    const items = [];
    for (const side of [d.left, d.right]) {
      const c = resolveCond(side, defs, depth + 1);
      if (c.type === "logic" && lc(c.op) === lc(d.op)) items.push(...c.items); else items.push(c);
    }
    return { type: "logic", op: d.op, items };
  }
  return { type: "unknown", var: v };
}

const LEVEL = { required: "required", none: "none", recommended: "recommended", applicationrequired: "required", systemrequired: "required" };

function parseAction(el, seq, defs) {
  const k = local(el.tag);
  const column = lc(el.attrs.ControlId);
  const isTrue = (s) => /^\[?true\]?$/i.test(String(s || "").trim());
  if (k === "SetVisibility") return { action: isTrue(el.attrs.IsVisible) ? "show" : "hide", column };
  if (k === "SetDisplayMode") return { action: isTrue(el.attrs.IsReadOnly) ? "lock" : "unlock", column };
  if (k === "SetFieldRequiredLevel") return { action: "required", level: LEVEL[lc(el.attrs.RequiredLevel)] || lc(el.attrs.RequiredLevel) || "?", column };
  if (k === "SetMessage") {
    const labels = [];
    const walk = (n) => { for (const c of n.children) { if (local(c.tag) === "StepLabel") labels.push({ lang: c.attrs.LanguageCode || "", text: c.attrs.Description || "" }); walk(c); } };
    walk(el);
    const level = String(el.attrs.Level || "").trim();
    return { action: "error", column, message: labels[0]?.text || "", messages: labels, level: /^\[?Nothing\]?$/i.test(level) || !level ? "" : level };
  }
  if (k === "SetDefaultValue" || k === "SetAttributeValue") {
    // the column and the value: the SetEntityProperty of the same Sequence
    const sets = (seq?.children || []).filter(c => local(c.tag) === "SetEntityProperty");
    const sp = sets[sets.length - 1] || null;
    const value = sp ? resolveValue(varOf(sp.attrs.Value) ? { var: varOf(sp.attrs.Value) } : null, defs) : null;
    return { action: k === "SetDefaultValue" ? "default" : "set", column: lc(sp?.attrs.Attribute) || column, value };
  }
  return { action: "other", name: k, column };
}

const SKIP = new Set(["GetEntityProperty", "EvaluateExpression", "EvaluateCondition", "EvaluateLogicalCondition", "Assign", "SetEntityProperty", "Null", "Variable", "ConditionBranch"]);
const isClientAction = (el) => /^mcwc:/i.test(el.tag) || ["SetVisibility", "SetDisplayMode", "SetFieldRequiredLevel", "SetMessage", "SetDefaultValue", "SetAttributeValue"].includes(local(el.tag));
const labelOf = (seq) => {
  const m = /^[^:]*:\s*([\s\S]+)$/.exec(String(seq?.attrs?.DisplayName || ""));
  const t = m ? m[1].trim() : "";
  return /^new action$/i.test(t) ? "" : t;
};

function parseSteps(list, defs) {
  const out = [];
  for (const el of list) {
    const k = kindOf(el);
    if (k === "ConditionSequence") out.push(parseIf(el, defs));
    else if (local(el.tag) === "Sequence") {
      const acts = el.children.filter(isClientAction);
      if (acts.length) for (const a of acts) out.push({ type: "action", label: labelOf(el), ...parseAction(a, el, defs) });
      else out.push(...parseSteps(el.children.filter(c => !/\.Variables$/.test(local(c.tag))), defs));
    } else if (isClientAction(el)) out.push({ type: "action", label: "", ...parseAction(el, null, defs) });
    else if (k === "Composite") out.push(...parseSteps(activitiesOf(el), defs));
    else if (!SKIP.has(k) && !/\.(Variables|Arguments|Properties|TargetType)$/.test(local(el.tag))) out.push({ type: "action", label: "", action: "other", name: k, column: "" });
  }
  return out;
}

function parseIf(seq, defs) {
  const branches = [];
  for (const b of activitiesOf(seq)) {
    if (kindOf(b) !== "ConditionBranch") continue;
    const condText = argText(b, "Condition");
    const isElse = /^\[\s*True\s*\]$/i.test(condText);
    const then = keyed(b, "Then");
    const elseEl = keyed(b, "Else");
    branches.push({
      kind: branches.length === 0 && !isElse ? "if" : isElse ? "else" : "elseif",
      when: isElse ? null : resolveCond(varOf(condText), defs),
      description: String(keyed(b, "Description")?.text || "").trim(),
      then: then ? parseSteps(kindOf(then) === "Composite" ? activitiesOf(then) : [then], defs) : [],
    });
    if (elseEl && local(elseEl.tag) !== "Null") branches.push({ kind: "else", when: null, description: "", then: parseSteps(kindOf(elseEl) === "Composite" ? activitiesOf(elseEl) : [elseEl], defs) });
  }
  return { type: "if", branches };
}

function walkColumns(steps, reads, acts, others) {
  const fromValue = (v) => {
    if (!v) return;
    if (v.kind === "field" && v.column) reads.add(v.column);
    if (v.kind === "expr") v.args.forEach(fromValue);
  };
  const fromCond = (c) => {
    if (!c) return;
    if (c.type === "cond") { if (c.column) reads.add(c.column); fromValue(c.left); c.values.forEach(fromValue); }
    if (c.type === "logic") c.items.forEach(fromCond);
  };
  for (const s of steps) {
    if (s.type === "if") for (const b of s.branches) { fromCond(b.when); walkColumns(b.then, reads, acts, others); }
    else if (s.type === "action") {
      if (s.column) acts.add(s.column);
      fromValue(s.value);
      if (s.action === "other" && s.name) others.add(s.name);
    }
  }
}

// → { steps, reads, acts, others } — or null without a definition, { error } when it isn't one
export function parseBusinessRule(xaml) {
  if (!xaml || typeof xaml !== "string") return null;
  const root = parseXml(xaml);
  let wf = null;
  const find = (n) => { for (const c of n.children) { if (wf) return; if (local(c.tag) === "Workflow") { wf = c; return; } find(c); } };
  find(root);
  if (!wf) return { error: "The definition holds no workflow body." };
  const defs = new Map();
  collectDefs(wf, defs);
  const steps = parseSteps(wf.children, defs);
  const reads = new Set(), acts = new Set(), others = new Set();
  walkColumns(steps, reads, acts, others);
  return { steps, reads: [...reads], acts: [...acts], others: [...others] };
}

// ── Scope ────────────────────────────────────────────────────────────────────
// processtriggerscope: 1 Form · 2 Entity (Microsoft's processtrigger_scope choice); a Form rule with
// a processtriggerformid runs on that form only, without one on every form ("All forms").
export function businessRuleScope(triggerScope, formId, formName) {
  const s = triggerScope == null || triggerScope === "" ? null : Number(triggerScope);
  if (s === 2) return { kind: "entity", label: "Entity", detail: "Every form, and the server on each save — imports, API writes and flows included" };
  if (s === 1 && formId) return { kind: "form", label: formName ? `Form: ${formName}` : "One form", detail: `The ${formName ? `"${formName}"` : "one"} form only — other forms, imports, API writes and flows skip it` };
  if (s === 1) return { kind: "allforms", label: "All forms", detail: "Every main and quick create form — imports, API writes and flows skip it" };
  return { kind: "unknown", label: "unknown", detail: "The scope couldn't be read" };
}

// actions that only exist on a form: an Entity-scope rule still runs them there, the server ignores them
export const FORM_ONLY = new Set(["show", "hide", "lock", "unlock", "required"]);
// every action of a rule, whatever branch it sits in
export function allActions(parsed) {
  const all = [];
  const walk = (steps) => { for (const s of steps || []) { if (s.type === "if") s.branches.forEach(b => walk(b.then)); else all.push(s); } };
  if (parsed && !parsed.error) walk(parsed.steps);
  return all;
}
// the gotcha worth a line: a rule that blocks or writes data but runs on forms only
export function scopeWarning(scope, parsed) {
  if (!parsed || parsed.error || !scope || (scope.kind !== "form" && scope.kind !== "allforms")) return "";
  const enforce = allActions(parsed).some(a => a.action === "error" || a.action === "set" || a.action === "default");
  return enforce ? "It shows errors or sets values on forms only: imports, API writes and flows save without it. The Entity scope would apply it on the server too." : "";
}
// an Entity-scope rule whose form actions (show / hide, lock, required) the server skips
export const hasFormOnlyActions = (parsed) => allActions(parsed).some(a => FORM_ONLY.has(a.action));

// ── Text ─────────────────────────────────────────────────────────────────────
export const COND_OP = {
  equal: "equals", notequal: "does not equal",
  greaterthan: "is greater than", greaterequal: "is greater than or equal to",
  lessthan: "is less than", lessequal: "is less than or equal to",
  null: "does not contain data", notnull: "contains data",
  beginswith: "begins with", doesnotbeginwith: "does not begin with",
  endswith: "ends with", doesnotendwith: "does not end with",
  like: "contains", notlike: "does not contain", contains: "contains", doesnotcontain: "does not contain",
  in: "is one of", notin: "is not one of",
};
const EXPR_OP = { add: "+", subtract: "−", multiply: "×", divide: "÷" };

// label(column) → the name to show; options(column) → [{ value, label }] for a choice column
export function valueText(v, column, label = (c) => c, options = () => null) {
  if (!v) return "(empty)";
  if (v.kind === "field") return `[${label(v.column)}]`;
  if (v.kind === "raw") return v.text;
  if (v.kind === "expr") {
    const sym = EXPR_OP[lc(v.op)];
    const parts = v.args.map(a => valueText(a, column, label, options));
    return sym ? parts.join(` ${sym} `) : `${v.op}(${parts.join(", ")})`;
  }
  const t = lc(v.type), vals = v.values || [];
  if (t === "boolean") return /^(1|true)$/i.test(vals[0] || "") ? "Yes" : /^(0|false)$/i.test(vals[0] || "") ? "No" : String(vals[0] ?? "");
  if (t === "optionsetvalue") {
    const opt = (options(column) || []).find(o => String(o.value) === String(vals[0]));
    return opt ? `${opt.label} (${vals[0]})` : String(vals[0] ?? "");
  }
  if (t === "entityreference") return vals[2] ? `"${vals[2]}" (${vals[0]})` : `${vals[0] || "record"} ${vals[1] || ""}`.trim();
  if (t === "string") return `"${vals[0] ?? ""}"`;
  return vals.length ? vals.join(", ") : "(empty)";
}

export function condText(c, label = (x) => x, options = () => null) {
  if (!c) return "";
  if (c.type === "logic") {
    const j = ` ${String(c.op || "").toUpperCase() || "?"} `;
    return c.items.map(i => (i.type === "logic" ? `(${condText(i, label, options)})` : condText(i, label, options))).join(j);
  }
  if (c.type === "cond") {
    const who = c.column ? label(c.column) : valueText(c.left, "", label, options);
    const op = COND_OP[lc(c.op)] || c.op;
    const vals = c.values.map(v => valueText(v, c.column, label, options));
    // several values on one condition (a choice ticked twice in the designer): any of them
    if (vals.length > 1 && lc(c.op) === "equal") return `${who} equals ${vals.slice(0, -1).join(", ")} or ${vals[vals.length - 1]}`;
    if (vals.length > 1 && lc(c.op) === "notequal") return `${who} is neither ${vals.slice(0, -1).join(", ")} nor ${vals[vals.length - 1]}`;
    return vals.length ? `${who} ${op} ${vals.join(", ")}` : `${who} ${op}`;
  }
  return "a condition Colvio can't read";
}

const LEVEL_TEXT = { required: "business required", none: "not business required", recommended: "business recommended" };
export function actionText(a, label = (x) => x, options = () => null) {
  const col = a.column ? label(a.column) : "";
  switch (a.action) {
    case "show": return `Show ${col}`;
    case "hide": return `Hide ${col}`;
    case "lock": return `Lock ${col}`;
    case "unlock": return `Unlock ${col}`;
    case "required": return `Make ${col} ${LEVEL_TEXT[a.level] || a.level}`;
    case "error": return `Show error on ${col}: "${a.message}"${a.level ? ` (${a.level})` : ""}`;
    case "default": return `Default ${col} to ${valueText(a.value, a.column, label, options)}`;
    case "set": return a.value ? `Set ${col} to ${valueText(a.value, a.column, label, options)}` : `Clear ${col}`;
    default: return `${a.name || "Action"}${col ? ` on ${col}` : ""}`;
  }
}

// the whole rule as lines (export, tooltips): IF … / THEN … / ELSE …, indented by depth
export function ruleLines(parsed, label = (x) => x, options = () => null) {
  if (!parsed) return [];
  if (parsed.error) return [parsed.error];
  const out = [];
  const walk = (steps, depth) => {
    const pad = "  ".repeat(depth);
    for (const s of steps) {
      if (s.type === "if") {
        for (const b of s.branches) {
          out.push(`${pad}${b.kind === "if" ? "IF" : b.kind === "elseif" ? "ELSE IF" : "ELSE"}${b.when ? " " + condText(b.when, label, options) : ""}`);
          walk(b.then, depth + 1);
        }
      } else out.push(`${pad}${actionText(s, label, options)}`);
    }
  };
  walk(parsed.steps, 0);
  return out;
}
