// Demo business rules (Automation › Business rules): their definitions written in the shape the
// business rule designer saves — the XAML of the workflow row, with the same activities, keys and
// variable names (ConditionSequence › ConditionBranch › Sequence "SetVisibilityStep1: …" › mcwc:*),
// and the scope columns. businessRules.js reads them like a live org's.
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const DEMO_FORM_ACCOUNT = id(101); // the "Account" main form (Metadata › Dependencies demo)
export const DEMO_RULE_SAP = id(104);     // "Lock SAP ID once synced" (same id as the Dependencies demo)

const V = "Version=9.0.0.0, Culture=neutral, PublicKeyToken=31bf3856ad364e35";
const NS = [
  'xmlns="http://schemas.microsoft.com/netfx/2009/xaml/activities"',
  `xmlns:mcwc="clr-namespace:Microsoft.Crm.Workflow.ClientActivities;assembly=Microsoft.Crm.Workflow, ${V}"`,
  `xmlns:mcwo="clr-namespace:Microsoft.Crm.Workflow.ObjectModel;assembly=Microsoft.Crm, ${V}"`,
  `xmlns:mxs="clr-namespace:Microsoft.Xrm.Sdk;assembly=Microsoft.Xrm.Sdk, ${V}"`,
  `xmlns:mxsq="clr-namespace:Microsoft.Xrm.Sdk.Query;assembly=Microsoft.Xrm.Sdk, ${V}"`,
  `xmlns:mxswa="clr-namespace:Microsoft.Xrm.Sdk.Workflow.Activities;assembly=Microsoft.Xrm.Sdk.Workflow, ${V}"`,
  'xmlns:s="clr-namespace:System;assembly=mscorlib, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089"',
  'xmlns:scg="clr-namespace:System.Collections.Generic;assembly=mscorlib, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089"',
  'xmlns:sco="clr-namespace:System.Collections.ObjectModel;assembly=mscorlib, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089"',
  'xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"',
].join(" ");
const AQN = (n) => `Microsoft.Crm.Workflow.Activities.${n}, Microsoft.Crm.Workflow, ${V}`;
const Q = "&quot;";
const PE = `[InputEntities(${Q}primaryEntity${Q})]`;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const TYPE = { Boolean: "x:Boolean", String: "x:String", Decimal: "s:Decimal", Money: "mxs:Money", Integer: "x:Int32", OptionSetValue: "mxs:OptionSetValue" };

const getProp = (col, ent, v) => `<mxswa:GetEntityProperty Attribute="${col}" Entity="${PE}" EntityName="${ent}" Value="[${v}]"><mxswa:GetEntityProperty.TargetType><InArgument x:TypeArguments="s:Type"><mxswa:ReferenceLiteral x:TypeArguments="s:Type"><x:Null /></mxswa:ReferenceLiteral></InArgument></mxswa:GetEntityProperty.TargetType></mxswa:GetEntityProperty>`;
const literal = (type, value, v) => `<mxswa:ActivityReference AssemblyQualifiedName="${AQN("EvaluateExpression")}" DisplayName="EvaluateExpression"><mxswa:ActivityReference.Arguments><InArgument x:TypeArguments="x:String" x:Key="ExpressionOperator">CreateCrmType</InArgument><InArgument x:TypeArguments="s:Object[]" x:Key="Parameters">[New Object() { Microsoft.Xrm.Sdk.Workflow.WorkflowPropertyType.${type}, ${Q}${esc(value)}${Q}${type === "OptionSetValue" ? `, ${Q}Picklist${Q}` : ""} }]</InArgument><InArgument x:TypeArguments="s:Type" x:Key="TargetType"><mxswa:ReferenceLiteral x:TypeArguments="s:Type" Value="${TYPE[type] || "x:String"}" /></InArgument><OutArgument x:TypeArguments="x:Object" x:Key="Result">[${v}]</OutArgument></mxswa:ActivityReference.Arguments></mxswa:ActivityReference>`;
const evalCond = (op, operand, params, out) => `<mxswa:ActivityReference AssemblyQualifiedName="${AQN("EvaluateCondition")}" DisplayName="EvaluateCondition"><mxswa:ActivityReference.Arguments><InArgument x:TypeArguments="mxsq:ConditionOperator" x:Key="ConditionOperator">${op}</InArgument>${params.length ? `<InArgument x:TypeArguments="s:Object[]" x:Key="Parameters">[New Object() { ${params.join(", ")} }]</InArgument>` : '<x:Null x:Key="Parameters" />'}<InArgument x:TypeArguments="x:Object" x:Key="Operand">[${operand}]</InArgument><OutArgument x:TypeArguments="x:Boolean" x:Key="Result">[${out}]</OutArgument></mxswa:ActivityReference.Arguments></mxswa:ActivityReference>`;
const evalLogic = (op, l, r, out) => `<mxswa:ActivityReference AssemblyQualifiedName="${AQN("EvaluateLogicalCondition")}" DisplayName="EvaluateLogicalCondition"><mxswa:ActivityReference.Arguments><InArgument x:TypeArguments="mxsq:LogicalOperator" x:Key="LogicalOperator">${op}</InArgument><InArgument x:TypeArguments="x:Boolean" x:Key="LeftOperand">[${l}]</InArgument><InArgument x:TypeArguments="x:Boolean" x:Key="RightOperand">[${r}]</InArgument><OutArgument x:TypeArguments="x:Boolean" x:Key="Result">[${out}]</OutArgument></mxswa:ActivityReference.Arguments></mxswa:ActivityReference>`;
const tmp = (ent) => `<Assign x:TypeArguments="mxs:Entity" To="[CreatedEntities(${Q}primaryEntity#Temp${Q})]" Value="[New Entity(${Q}${ent}${Q})]" /><Assign x:TypeArguments="s:Guid" To="[CreatedEntities(${Q}primaryEntity#Temp${Q}).Id]" Value="${PE.replace("]", ".Id]")}" />`;

// one action → the Sequence the designer writes around it
function action(a, ent, step) {
  const name = { show: "SetVisibility", hide: "SetVisibility", lock: "SetDisplayMode", unlock: "SetDisplayMode", required: "SetFieldRequiredLevel", optional: "SetFieldRequiredLevel", error: "SetMessage", set: "SetAttributeValue", default: "SetDefaultValue" }[a.a];
  const tag = `${name}Step${step}`;
  const ctl = `ControlId="${a.col}" ControlType="standard" Entity="${PE}" EntityName="${ent}"`;
  let body;
  if (a.a === "show" || a.a === "hide") body = `<mcwc:SetVisibility ${ctl} IsVisible="${a.a === "show" ? "True" : "False"}" />`;
  else if (a.a === "lock" || a.a === "unlock") body = `<mcwc:SetDisplayMode ${ctl} IsReadOnly="${a.a === "lock" ? "True" : "False"}" />`;
  else if (a.a === "required" || a.a === "optional") body = `${tmp(ent)}<mcwc:SetFieldRequiredLevel ${ctl} DisplayName="${tag}" RequiredLevel="${a.a === "required" ? "Required" : "None"}" />`;
  else if (a.a === "error") body = `<mcwc:SetMessage DisplayName="${tag}" ${ctl} Level="[Nothing]"><mcwc:SetMessage.StepLabels><mcwo:StepLabel Description="${esc(a.msg)}" LabelId="${id(900 + step)}" LanguageCode="1033" /></mcwc:SetMessage.StepLabels></mcwc:SetMessage>`;
  else {
    const v = `${tag}_1`;
    const value = a.field ? getProp(a.field, ent, v) : a.value ? literal(a.value[0], a.value[1], v) : "";
    body = `<Sequence.Variables><Variable x:TypeArguments="x:Object" Name="${v}" /></Sequence.Variables>${tmp(ent)}${value}<mxswa:SetEntityProperty Attribute="${a.col}" Entity="[CreatedEntities(${Q}primaryEntity#Temp${Q})]" EntityName="${ent}" Value="[${v}]"><mxswa:SetEntityProperty.TargetType><InArgument x:TypeArguments="s:Type"><mxswa:ReferenceLiteral x:TypeArguments="s:Type" Value="x:String" /></InArgument></mxswa:SetEntityProperty.TargetType></mxswa:SetEntityProperty><mcwc:${name} DisplayName="${tag}" Entity="${PE}" EntityName="${ent}" /><Assign x:TypeArguments="mxs:Entity" To="${PE}" Value="[CreatedEntities(${Q}primaryEntity#Temp${Q})]" />`;
  }
  return `<Sequence DisplayName="${tag}: ${esc(a.label || "New Action")}">${body}</Sequence>`;
}

// a rule: { entity, branches: [{ when: [conditions] (all must hold), then: [actions] }, { then } = else] }
// a condition: { col, op, values: [[type, value] | { field }] }
export function buildRuleXaml(rule) {
  const ent = rule.entity;
  const vars = [], acts = [];
  let step = 0;
  rule.branches.forEach((b, bi) => {
    const br = `ConditionBranchStep${bi + 2}`;
    let k = 0;
    const nv = () => `${br}_${++k}`;
    let condVar = "True";
    if (b.when) {
      const results = [];
      for (const c of b.when) {
        const operand = nv();
        acts.push(getProp(c.col, ent, operand));
        const params = (c.values || []).map(val => {
          const pv = nv();
          acts.push(val.field ? getProp(val.field, ent, pv) : literal(val[0], val[1], pv));
          return pv;
        });
        const out = nv();
        acts.push(evalCond(c.op, operand, params, out));
        results.push(out);
      }
      let acc = results[0];
      for (let i = 1; i < results.length; i++) {
        const out = i === results.length - 1 ? `${br}_condition` : nv();
        acts.push(evalLogic("And", acc, results[i], out));
        acc = out;
      }
      if (results.length === 1) acts[acts.length - 1] = acts[acts.length - 1].replace(`[${acc}]</OutArgument>`, `[${br}_condition]</OutArgument>`);
      condVar = `${br}_condition`;
      vars.push(`<Variable x:TypeArguments="x:Boolean" Default="False" Name="${br}_condition" />`);
      for (let i = 1; i <= k; i++) vars.push(`<Variable x:TypeArguments="x:Object" Name="${br}_${i}" />`);
    } else {
      vars.push('<Variable x:TypeArguments="x:Boolean" Default="False" Name="True" />');
    }
    const then = b.then.map(a => action(a, ent, ++step)).join("");
    acts.push(`<mxswa:ActivityReference AssemblyQualifiedName="${AQN("ConditionBranch")}" DisplayName="${br}"><mxswa:ActivityReference.Arguments><InArgument x:TypeArguments="x:Boolean" x:Key="Condition">[${condVar}]</InArgument></mxswa:ActivityReference.Arguments><mxswa:ActivityReference.Properties><mxswa:ActivityReference x:Key="Then" AssemblyQualifiedName="${AQN("Composite")}" DisplayName="${br}"><mxswa:ActivityReference.Properties><sco:Collection x:TypeArguments="Variable" x:Key="Variables" /><sco:Collection x:TypeArguments="Activity" x:Key="Activities">${then}</sco:Collection></mxswa:ActivityReference.Properties></mxswa:ActivityReference><x:Null x:Key="Else" /><x:String x:Key="Description">${esc(b.description || "")}</x:String></mxswa:ActivityReference.Properties></mxswa:ActivityReference>`);
  });
  const cls = `XrmWorkflow${String(rule.id || "0").replace(/-/g, "")}`;
  return `<Activity x:Class="${cls}" ${NS}><x:Members><x:Property Name="InputEntities" Type="InArgument(scg:IDictionary(x:String, mxs:Entity))" /><x:Property Name="CreatedEntities" Type="InArgument(scg:IDictionary(x:String, mxs:Entity))" /></x:Members><mxswa:Workflow><mxswa:ActivityReference AssemblyQualifiedName="${AQN("ConditionSequence")}" DisplayName="ConditionStep1"><mxswa:ActivityReference.Arguments><InArgument x:TypeArguments="x:Boolean" x:Key="Wait">False</InArgument></mxswa:ActivityReference.Arguments><mxswa:ActivityReference.Properties><sco:Collection x:TypeArguments="Variable" x:Key="Variables">${vars.join("")}</sco:Collection><sco:Collection x:TypeArguments="Activity" x:Key="Activities">${acts.join("")}</sco:Collection><x:Boolean x:Key="ContainsElseBranch">False</x:Boolean></mxswa:ActivityReference.Properties></mxswa:ActivityReference></mxswa:Workflow></Activity>`;
}

// the demo org's rules — every one on account (FLDS), one per scope, one with a form-only gotcha
export const DEMO_RULES = [
  { id: "w2", entity: "account", scope: 2, formId: null, branches: [
    { description: "Wrong format", when: [{ col: "accountnumber", op: "NotNull" }, { col: "accountnumber", op: "DoesNotBeginWith", values: [["String", "ACC-"]] }],
      then: [{ a: "error", col: "accountnumber", label: "Format error", msg: "Account numbers start with ACC- (for example ACC-001)." }] },
  ] },
  { id: DEMO_RULE_SAP, entity: "account", scope: 1, formId: DEMO_FORM_ACCOUNT, branches: [
    { description: "Synced to SAP", when: [{ col: "new_sapid", op: "NotNull" }], then: [{ a: "lock", col: "new_sapid", label: "Lock SAP ID" }] },
    { then: [{ a: "unlock", col: "new_sapid", label: "Unlock SAP ID" }] },
  ] },
  { id: "w7", entity: "account", scope: 1, formId: null, branches: [
    { description: "Customer or partner", when: [{ col: "customertypecode", op: "Equal", values: [["OptionSetValue", "3"], ["OptionSetValue", "5"]] }],
      then: [{ a: "show", col: "industrycode", label: "Show Industry" }, { a: "required", col: "industrycode", label: "Industry required" }] },
    { then: [{ a: "optional", col: "industrycode", label: "Industry optional" }] },
  ] },
  { id: "w8", entity: "account", scope: 1, formId: DEMO_FORM_ACCOUNT, branches: [
    { description: "Negative revenue", when: [{ col: "revenue", op: "LessThan", values: [["Money", "0"]] }],
      then: [{ a: "error", col: "revenue", label: "Revenue error", msg: "Annual revenue can't be negative." }] },
  ] },
  { id: "w9", entity: "account", scope: 2, formId: null, branches: [
    { description: "No other phone yet", when: [{ col: "telephone2", op: "Null" }, { col: "telephone1", op: "NotNull" }],
      then: [{ a: "set", col: "telephone2", field: "telephone1", label: "Copy main phone" }] },
  ] },
];

// what getBusinessRulesPage answers in demo mode (one page)
export const demoBusinessRuleDefs = () => DEMO_RULES.map(r => ({ id: r.id, xaml: buildRuleXaml(r), scope: r.scope, formId: r.formId }));
export const demoFormNames = (ids) => Object.fromEntries((ids || []).map(v => String(v).toLowerCase()).filter(v => v === DEMO_FORM_ACCOUNT).map(v => [v, "Account"]));
