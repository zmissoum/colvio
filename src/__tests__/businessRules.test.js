import { describe, it, expect } from "vitest";
import { parseBusinessRule, paramTokens, businessRuleScope, scopeWarning, hasFormOnlyActions, valueText, condText, actionText, ruleLines } from "../businessRules.js";
import { DEMO_RULES, buildRuleXaml, demoBusinessRuleDefs, demoFormNames, DEMO_FORM_ACCOUNT } from "../businessRulesDemo.js";

// A definition in the shape the business rule designer saves (written by hand for this test, in the
// format of rules exported from real solutions): an IF with two conditions joined by And, a nested
// IF, the designer's ELSE (a ConditionBranch whose condition is [True]), and every kind of action.
const AQN = (n) => `Microsoft.Crm.Workflow.Activities.${n}, Microsoft.Crm.Workflow, Version=9.0.0.0, Culture=neutral, PublicKeyToken=31bf3856ad364e35`;
const PE = "[InputEntities(&quot;primaryEntity&quot;)]";
const TMP = "[CreatedEntities(&quot;primaryEntity#Temp&quot;)]";
const get = (col, v) => `<mxswa:GetEntityProperty Attribute="${col}" Entity="${PE}" EntityName="new_order" Value="[${v}]"><mxswa:GetEntityProperty.TargetType><InArgument x:TypeArguments="s:Type"><mxswa:ReferenceLiteral x:TypeArguments="s:Type"><x:Null /></mxswa:ReferenceLiteral></InArgument></mxswa:GetEntityProperty.TargetType></mxswa:GetEntityProperty>`;
const lit = (params, v) => `<mxswa:ActivityReference AssemblyQualifiedName="${AQN("EvaluateExpression")}" DisplayName="EvaluateExpression"><mxswa:ActivityReference.Arguments><InArgument x:TypeArguments="x:String" x:Key="ExpressionOperator">CreateCrmType</InArgument><InArgument x:TypeArguments="s:Object[]" x:Key="Parameters">[New Object() { ${params} }]</InArgument><OutArgument x:TypeArguments="x:Object" x:Key="Result">[${v}]</OutArgument></mxswa:ActivityReference.Arguments></mxswa:ActivityReference>`;
const cond = (op, operand, params, out) => `<mxswa:ActivityReference AssemblyQualifiedName="${AQN("EvaluateCondition")}" DisplayName="EvaluateCondition"><mxswa:ActivityReference.Arguments><InArgument x:TypeArguments="mxsq:ConditionOperator" x:Key="ConditionOperator">${op}</InArgument>${params ? `<InArgument x:TypeArguments="s:Object[]" x:Key="Parameters">[New Object() { ${params} }]</InArgument>` : '<x:Null x:Key="Parameters" />'}<InArgument x:TypeArguments="x:Object" x:Key="Operand">[${operand}]</InArgument><OutArgument x:TypeArguments="x:Boolean" x:Key="Result">[${out}]</OutArgument></mxswa:ActivityReference.Arguments></mxswa:ActivityReference>`;
const branch = (name, condition, actions, description = "") => `<mxswa:ActivityReference AssemblyQualifiedName="${AQN("ConditionBranch")}" DisplayName="${name}"><mxswa:ActivityReference.Arguments><InArgument x:TypeArguments="x:Boolean" x:Key="Condition">${condition}</InArgument></mxswa:ActivityReference.Arguments><mxswa:ActivityReference.Properties><mxswa:ActivityReference x:Key="Then" AssemblyQualifiedName="${AQN("Composite")}" DisplayName="${name}"><mxswa:ActivityReference.Properties><sco:Collection x:TypeArguments="Variable" x:Key="Variables" /><sco:Collection x:TypeArguments="Activity" x:Key="Activities">${actions}</sco:Collection></mxswa:ActivityReference.Properties></mxswa:ActivityReference><x:Null x:Key="Else" /><x:String x:Key="Description">${description}</x:String></mxswa:ActivityReference.Properties></mxswa:ActivityReference>`;
const ifSeq = (body) => `<mxswa:ActivityReference AssemblyQualifiedName="${AQN("ConditionSequence")}" DisplayName="ConditionStep1"><mxswa:ActivityReference.Arguments><InArgument x:TypeArguments="x:Boolean" x:Key="Wait">False</InArgument></mxswa:ActivityReference.Arguments><mxswa:ActivityReference.Properties><sco:Collection x:TypeArguments="Variable" x:Key="Variables" /><sco:Collection x:TypeArguments="Activity" x:Key="Activities">${body}</sco:Collection><x:Boolean x:Key="ContainsElseBranch">False</x:Boolean></mxswa:ActivityReference.Properties></mxswa:ActivityReference>`;
const OPT = "Microsoft.Xrm.Sdk.Workflow.WorkflowPropertyType.OptionSetValue";

const XAML = `<Activity x:Class="XrmWorkflowTest" xmlns="http://schemas.microsoft.com/netfx/2009/xaml/activities" xmlns:mcwc="clr-namespace:Microsoft.Crm.Workflow.ClientActivities;assembly=Microsoft.Crm.Workflow" xmlns:mcwo="clr-namespace:Microsoft.Crm.Workflow.ObjectModel;assembly=Microsoft.Crm" xmlns:mxs="clr-namespace:Microsoft.Xrm.Sdk;assembly=Microsoft.Xrm.Sdk" xmlns:mxsq="clr-namespace:Microsoft.Xrm.Sdk.Query;assembly=Microsoft.Xrm.Sdk" xmlns:mxswa="clr-namespace:Microsoft.Xrm.Sdk.Workflow.Activities;assembly=Microsoft.Xrm.Sdk.Workflow" xmlns:s="clr-namespace:System;assembly=mscorlib" xmlns:sco="clr-namespace:System.Collections.ObjectModel;assembly=mscorlib" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml">
<x:Members><x:Property Name="InputEntities" Type="InArgument(scg:IDictionary(x:String, mxs:Entity))" /></x:Members>
<mxswa:Workflow>${ifSeq(
  get("new_status", "ConditionBranchStep2_1") + lit(`${OPT}, &quot;100000001&quot;, &quot;Picklist&quot;`, "ConditionBranchStep2_2") +
  cond("Equal", "ConditionBranchStep2_1", "ConditionBranchStep2_2", "ConditionBranchStep2_3") +
  get("new_amount", "ConditionBranchStep2_4") + lit("Microsoft.Xrm.Sdk.Workflow.WorkflowPropertyType.Money, &quot;1000&quot;", "ConditionBranchStep2_5") +
  cond("GreaterThan", "ConditionBranchStep2_4", "ConditionBranchStep2_5", "ConditionBranchStep2_6") +
  `<mxswa:ActivityReference AssemblyQualifiedName="${AQN("EvaluateLogicalCondition")}" DisplayName="EvaluateLogicalCondition"><mxswa:ActivityReference.Arguments><InArgument x:TypeArguments="mxsq:LogicalOperator" x:Key="LogicalOperator">And</InArgument><InArgument x:TypeArguments="x:Boolean" x:Key="LeftOperand">[ConditionBranchStep2_3]</InArgument><InArgument x:TypeArguments="x:Boolean" x:Key="RightOperand">[ConditionBranchStep2_6]</InArgument><OutArgument x:TypeArguments="x:Boolean" x:Key="Result">[ConditionBranchStep2_condition]</OutArgument></mxswa:ActivityReference.Arguments></mxswa:ActivityReference>` +
  branch("ConditionBranchStep2", "[ConditionBranchStep2_condition]",
    `<Sequence DisplayName="SetFieldRequiredLevelStep1: Approver required"><Assign x:TypeArguments="mxs:Entity" To="${TMP}" Value="[New Entity(&quot;new_order&quot;)]" /><mcwc:SetFieldRequiredLevel ControlId="new_approver" ControlType="standard" DisplayName="SetFieldRequiredLevelStep1" Entity="${PE}" EntityName="new_order" RequiredLevel="Required" /></Sequence>` +
    `<Sequence DisplayName="SetMessageStep2: Too big"><mcwc:SetMessage ControlId="new_amount" Entity="${PE}" EntityName="new_order" Level="[Nothing]"><mcwc:SetMessage.StepLabels><mcwo:StepLabel Description="Orders over 1,000 need an approver, say &quot;why&quot;" LabelId="00000000-0000-0000-0000-000000000001" LanguageCode="1033" /><mcwo:StepLabel Description="Commandes de plus de 1 000 : approbateur" LabelId="00000000-0000-0000-0000-000000000002" LanguageCode="1036" /></mcwc:SetMessage.StepLabels></mcwc:SetMessage></Sequence>` +
    ifSeq(get("new_approver", "ConditionBranchStep4_1") + cond("Null", "ConditionBranchStep4_1", "", "ConditionBranchStep4_condition") +
      branch("ConditionBranchStep4", "[ConditionBranchStep4_condition]",
        `<Sequence DisplayName="SetAttributeValueStep3: Copy owner"><Sequence.Variables><Variable x:TypeArguments="x:Object" Name="SetAttributeValueStep3_1" /></Sequence.Variables>${get("ownerid", "SetAttributeValueStep3_1")}<mxswa:SetEntityProperty Attribute="new_approver" Entity="${TMP}" EntityName="new_order" Value="[SetAttributeValueStep3_1]" /><mcwc:SetAttributeValue DisplayName="SetAttributeValueStep3" Entity="${PE}" EntityName="new_order" /></Sequence>`)),
    "Big order") +
  lit("Microsoft.Xrm.Sdk.Workflow.WorkflowPropertyType.Boolean, &quot;true&quot;", "ConditionBranchStep3_1") +
  branch("ConditionBranchStep3", "[True]",
    `<Sequence DisplayName="SetVisibilityStep4: Hide approver"><mcwc:SetVisibility ControlId="new_approver" ControlType="standard" Entity="${PE}" EntityName="new_order" IsVisible="False" /></Sequence>` +
    `<Sequence DisplayName="SetAttributeValueStep5: Clear approver"><Sequence.Variables><Variable x:TypeArguments="x:Object" Name="SetAttributeValueStep5_1" /></Sequence.Variables><mxswa:SetEntityProperty Attribute="new_approver" Entity="${TMP}" EntityName="new_order" Value="[SetAttributeValueStep5_1]" /><mcwc:SetAttributeValue DisplayName="SetAttributeValueStep5" Entity="${PE}" EntityName="new_order" /></Sequence>` +
    `<Sequence DisplayName="SetDefaultValueStep6: New Action">${lit("Microsoft.Xrm.Sdk.Workflow.WorkflowPropertyType.String, &quot;Pending, see note&quot;", "SetDefaultValueStep6_1")}<mxswa:SetEntityProperty Attribute="new_note" Entity="${TMP}" EntityName="new_order" Value="[SetDefaultValueStep6_1]" /><mcwc:SetDefaultValue DisplayName="SetDefaultValueStep6" Entity="${PE}" EntityName="new_order" /></Sequence>` +
    `<Sequence DisplayName="SetDisplayModeStep7: "><mcwc:SetDisplayMode ControlId="new_amount" ControlType="standard" Entity="${PE}" EntityName="new_order" IsReadOnly="False" /></Sequence>` +
    `<Sequence DisplayName="MysteryStep8"><mcwc:ShowRecommendation ControlId="new_note" Entity="${PE}" EntityName="new_order" /></Sequence>`)
)}</mxswa:Workflow></Activity>`;

describe("business rules - reading a definition", () => {
  const p = parseBusinessRule(XAML);
  it("reads IF / nested IF / ELSE with every kind of action, in the designer's order", () => {
    expect(ruleLines(p)).toEqual([
      "IF new_status equals 100000001 AND new_amount is greater than 1000",
      "  Make new_approver business required",
      "  Show error on new_amount: \"Orders over 1,000 need an approver, say \"why\"\"",
      "  IF new_approver does not contain data",
      "    Set new_approver to [ownerid]",
      "ELSE",
      "  Hide new_approver",
      "  Clear new_approver",
      "  Default new_note to \"Pending, see note\"",
      "  Unlock new_amount",
      "  ShowRecommendation on new_note",
    ]);
  });
  it("lists the columns it reads (conditions and copied values) and acts on, and the steps it can't describe", () => {
    expect(p.reads).toEqual(["new_status", "new_amount", "new_approver", "ownerid"]);
    expect(p.acts).toEqual(["new_approver", "new_amount", "new_note"]);
    expect(p.others).toEqual(["ShowRecommendation"]);
  });
  it("keeps the designer's labels, the branch description and every language of a message", () => {
    const top = p.steps[0].branches[0];
    expect(top.description).toBe("Big order");
    expect(top.then[0]).toMatchObject({ action: "required", level: "required", column: "new_approver", label: "Approver required" });
    expect(top.then[1].messages.map(m => m.lang)).toEqual(["1033", "1036"]);
    const els = p.steps[0].branches[1];
    expect(els).toMatchObject({ kind: "else", when: null });
    expect(els.then.find(a => a.action === "default").label).toBe(""); // "New Action" is the designer's placeholder
  });
  it("names the columns and the choice values when the table's metadata is known", () => {
    const label = (c) => ({ new_status: "Status", new_amount: "Amount", new_approver: "Approver", ownerid: "Owner" }[c] || c);
    const options = (c) => (c === "new_status" ? [{ value: 100000001, label: "Submitted" }] : null);
    expect(ruleLines(p, label, options).slice(0, 2)).toEqual(["IF Status equals Submitted (100000001) AND Amount is greater than 1000", "  Make Approver business required"]);
    expect(actionText(p.steps[0].branches[0].then[2].branches[0].then[0], label)).toBe("Set Approver to [Owner]");
  });
  it("no definition → null; not a workflow → an error said as such, never an empty rule", () => {
    expect(parseBusinessRule("")).toBe(null);
    expect(parseBusinessRule(null)).toBe(null);
    expect(parseBusinessRule("<Activity><Sequence /></Activity>")).toEqual({ error: "The definition holds no workflow body." });
    expect(parseBusinessRule("<Activity><mxswa:Workflow /></Activity>")).toEqual({ steps: [], reads: [], acts: [], others: [] });
  });
});

describe("business rules - parameters, values and conditions", () => {
  it("splits the parameter list on commas outside quotes", () => {
    expect(paramTokens('[New Object() { Microsoft.Xrm.Sdk.Workflow.WorkflowPropertyType.String, "a, b", "Text" }]')).toEqual([{ type: "String" }, { str: "a, b" }, { str: "Text" }]);
    expect(paramTokens("[New Object() { ConditionBranchStep2_2, ConditionBranchStep2_3 }]")).toEqual([{ var: "ConditionBranchStep2_2" }, { var: "ConditionBranchStep2_3" }]);
    expect(paramTokens("[ConditionBranchStep2_2]")).toEqual([{ var: "ConditionBranchStep2_2" }]);
    expect(paramTokens("")).toEqual([]);
  });
  it("writes the fixed values the way the designer shows them", () => {
    expect(valueText({ kind: "literal", type: "Boolean", values: ["1"] })).toBe("Yes");
    expect(valueText({ kind: "literal", type: "Boolean", values: ["false"] })).toBe("No");
    expect(valueText({ kind: "literal", type: "OptionSetValue", values: ["3", "Picklist"] }, "customertypecode", c => c, () => [{ value: 3, label: "Customer" }])).toBe("Customer (3)");
    expect(valueText({ kind: "literal", type: "OptionSetValue", values: ["7", "Picklist"] })).toBe("7");
    expect(valueText({ kind: "literal", type: "EntityReference", values: ["account", "0001", "Contoso"] })).toBe("\"Contoso\" (account)");
    expect(valueText({ kind: "expr", op: "Add", args: [{ kind: "field", column: "revenue" }, { kind: "literal", type: "Money", values: ["10"] }] })).toBe("[revenue] + 10");
    expect(valueText({ kind: "expr", op: "Concat", args: [{ kind: "field", column: "a" }] })).toBe("Concat([a])");
    expect(valueText(null)).toBe("(empty)");
  });
  it("a condition holding several values means any of them", () => {
    const c = (op) => ({ type: "cond", column: "customertypecode", op, values: [{ kind: "literal", type: "OptionSetValue", values: ["3"] }, { kind: "literal", type: "OptionSetValue", values: ["5"] }] });
    expect(condText(c("Equal"))).toBe("customertypecode equals 3 or 5");
    expect(condText(c("NotEqual"))).toBe("customertypecode is neither 3 nor 5");
    expect(condText({ type: "logic", op: "Or", items: [c("Equal"), { type: "logic", op: "And", items: [c("Null"), c("NotNull")] }] })).toMatch(/^customertypecode equals 3 or 5 OR \(/);
    expect(condText({ type: "cond", column: "x", op: "SomethingNew", values: [] })).toBe("x SomethingNew");
  });
});

describe("business rules - scope", () => {
  it("processtriggerscope 2 = Entity, 1 = Form (one form with a form id, else All forms), else unknown", () => {
    expect(businessRuleScope(2, null)).toMatchObject({ kind: "entity", label: "Entity" });
    expect(businessRuleScope(1, "f1", "Account")).toMatchObject({ kind: "form", label: "Form: Account" });
    expect(businessRuleScope(1, "f1", "")).toMatchObject({ kind: "form", label: "One form" });
    expect(businessRuleScope(1, null)).toMatchObject({ kind: "allforms", label: "All forms" });
    expect(businessRuleScope(null, null)).toMatchObject({ kind: "unknown" });
    expect(businessRuleScope(undefined, null)).toMatchObject({ kind: "unknown" });
  });
  it("warns when a form-only rule blocks or writes data; notes the form actions an Entity rule's server run skips", () => {
    const p = parseBusinessRule(XAML);
    expect(scopeWarning(businessRuleScope(1, null), p)).toMatch(/forms only: imports, API writes and flows/);
    expect(scopeWarning(businessRuleScope(2, null), p)).toBe("");
    const showOnly = parseBusinessRule(buildRuleXaml(DEMO_RULES.find(r => r.id === "w7")));
    expect(scopeWarning(businessRuleScope(1, null), showOnly)).toBe("");
    expect(hasFormOnlyActions(showOnly)).toBe(true);
    expect(hasFormOnlyActions(parseBusinessRule(buildRuleXaml(DEMO_RULES.find(r => r.id === "w9"))))).toBe(false);
  });
});

describe("business rules - demo org", () => {
  it("every demo rule reads back whole, with nothing unknown", () => {
    for (const d of demoBusinessRuleDefs()) {
      const p = parseBusinessRule(d.xaml);
      expect(p.error, d.id).toBeUndefined();
      expect(p.others, d.id).toEqual([]);
      expect(p.acts.length, d.id).toBeGreaterThan(0);
    }
    const lines = Object.fromEntries(demoBusinessRuleDefs().map(d => [d.id, ruleLines(parseBusinessRule(d.xaml))]));
    expect(lines.w2).toEqual(["IF accountnumber contains data AND accountnumber does not begin with \"ACC-\"", "  Show error on accountnumber: \"Account numbers start with ACC- (for example ACC-001).\""]);
    expect(lines.w7[0]).toBe("IF customertypecode equals 3 or 5");
    expect(lines.w9).toEqual(["IF telephone2 does not contain data AND telephone1 contains data", "  Set telephone2 to [telephone1]"]);
  });
  it("one rule per scope, and the one-form rules name a form the demo knows", () => {
    const kinds = demoBusinessRuleDefs().map(d => businessRuleScope(d.scope, d.formId).kind);
    expect(new Set(kinds)).toEqual(new Set(["entity", "allforms", "form"]));
    expect(demoFormNames([DEMO_FORM_ACCOUNT.toUpperCase(), "other"])).toEqual({ [DEMO_FORM_ACCOUNT]: "Account" });
  });
});
