// Demo org for Automation › Who runs it: identities of every kind, connection references with and
// without a stored account, and flow definitions using them.
const g = (n) => `00000000-0000-4000-c000-${String(n).padStart(12, "0")}`;
export const DEMO_IDENT = {
  zakaria: g(1), alex: g(2), paul: g(3), svc: g(4), sapApp: g(5), msApp: g(6), system: g(7), team: g(8),
  flowSap: g(101), flowDigest: g(102), flowNotify: g(103),
  refSap: g(201), refDv: g(202), refMail: g(203),
};
const I = DEMO_IDENT;

export const DEMO_USERS = [
  { systemuserid: I.zakaria, fullname: "Zakaria Missoum", internalemailaddress: "zakaria@contoso.example", domainname: "zakaria@contoso.example", accessmode: 0, isdisabled: false },
  { systemuserid: I.alex, fullname: "Alex Baker", internalemailaddress: "alex@contoso.example", domainname: "alex@contoso.example", accessmode: 0, isdisabled: false },
  { systemuserid: I.paul, fullname: "Paul Durand", internalemailaddress: "paul.durand@contoso.example", domainname: "paul.durand@contoso.example", accessmode: 0, isdisabled: true },
  { systemuserid: I.svc, fullname: "svc-integration", internalemailaddress: "svc-integration@contoso.example", domainname: "svc-integration@contoso.example", accessmode: 4, isdisabled: false },
  { systemuserid: I.sapApp, fullname: "SAP Connector (app)", internalemailaddress: "", domainname: "", applicationid: "11111111-2222-4333-8444-555555555555", accessmode: 4, isdisabled: false },
  { systemuserid: I.msApp, fullname: "# Dynamics 365 Sales Insights", internalemailaddress: "", domainname: "", applicationid: "99999999-8888-4777-8666-555555555555", accessmode: 4, isdisabled: false },
  { systemuserid: I.system, fullname: "SYSTEM", internalemailaddress: "", domainname: "", accessmode: 0, isdisabled: false },
];

export const DEMO_REFS = [
  { id: I.refSap, name: "SAP connector (Contoso)", logicalName: "contoso_sapconnection", connectorId: "/providers/Microsoft.PowerApps/apis/shared_sap", connectionId: "", state: 0, ownerId: I.paul, ownerType: "systemuser", owner: "Paul Durand" },
  { id: I.refDv, name: "Dataverse (integration)", logicalName: "contoso_dataverse", connectorId: "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps", connectionId: "shared-commondataser-0a1b2c", state: 0, ownerId: I.svc, ownerType: "systemuser", owner: "svc-integration" },
  { id: I.refMail, name: "Office 365 Outlook", logicalName: "contoso_outlook", connectorId: "/providers/Microsoft.PowerApps/apis/shared_office365", connectionId: "shared-office365-9z8y7x", state: 0, ownerId: I.alex, ownerType: "systemuser", owner: "Alex Baker" },
];
export const DEMO_INSTANCES = [
  { id: g(301), name: "svc-integration@contoso.example", accountName: "svc-integration@contoso.example", internalId: "shared-commondataser-0a1b2c", connectorInternalId: "shared_commondataserviceforapps", status: "Connected", state: 0, refId: I.refDv },
  { id: g(302), name: "alex@contoso.example", accountName: "alex@contoso.example", internalId: "shared-office365-9z8y7x", connectorInternalId: "shared_office365", status: "Connected", state: 0, refId: I.refMail },
];
// a flow's clientdata: its connection references, and (optionally) a definition with a trigger
// and actions — what Runs as / Sends email as read
const cd = (refs, def = null) => JSON.stringify({ properties: { connectionReferences: Object.fromEntries(refs.map(([key, ref, src]) => [key, { runtimeSource: src || "embedded", connection: { connectionReferenceLogicalName: ref }, api: { name: key } }])), ...(def ? { definition: { $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#", contentVersion: "1.0.0.0", ...def } } : {}) }, schemaVersion: "1.0.0.0" });
const dv = (operationId, parameters) => ({ type: "OpenApiConnection", inputs: { host: { apiId: "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps", connectionName: "shared_commondataserviceforapps", operationId }, parameters } });
const o365 = (operationId, parameters) => ({ type: "OpenApiConnection", inputs: { host: { apiId: "/providers/Microsoft.PowerApps/apis/shared_office365", connectionName: "shared_office365", operationId }, parameters } });
export const DEMO_FLOW_DEFS = [
  { id: I.flowSap, clientdata: cd([["shared_commondataserviceforapps", "contoso_dataverse"], ["shared_sap", "contoso_sapconnection"]], {
    triggers: { When_an_account_is_added: { type: "OpenApiConnectionWebhook", inputs: { host: { apiId: "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps", connectionName: "shared_commondataserviceforapps", operationId: "SubscribeWebhookTrigger" }, parameters: { "subscriptionRequest/message": 1, "subscriptionRequest/entityname": "account", "subscriptionRequest/scope": 4 } } } },
    actions: { Get_the_account: dv("GetItem", { entityName: "accounts", recordId: "@triggerOutputs()?['body/accountid']" }), Create_in_SAP: { type: "OpenApiConnection", inputs: { host: { apiId: "/providers/Microsoft.PowerApps/apis/shared_sap", connectionName: "shared_sap", operationId: "CallRfc" }, parameters: { rfc: "BAPI_CUSTOMER_CREATE" } } } },
  }) },
  { id: I.flowDigest, clientdata: cd([["shared_commondataserviceforapps", "contoso_dataverse"], ["shared_office365", "contoso_outlook"]], {
    triggers: { Every_Monday: { type: "Recurrence", recurrence: { frequency: "Week", interval: 1 } } },
    actions: {
      List_new_accounts: dv("ListRecords", { entityName: "accounts", $filter: "createdon ge @{addDays(utcNow(), -7)}" }),
      Send_the_digest: o365("SendEmailV2", { "emailMessage/To": "sales@contoso.example", "emailMessage/Subject": "Weekly accounts", "emailMessage/Body": "<p>…</p>", "emailMessage/From": "noreply@contoso.example" }),
      If_any_failed: { type: "If", expression: { greater: ["@length(body('List_new_accounts')?['value'])", 50] }, actions: { Warn_the_team: o365("SharedMailboxSendEmailV2", { "emailMessage/MailboxAddress": "sales-ops@contoso.example", "emailMessage/To": "ops@contoso.example", "emailMessage/Subject": "Big week" }) }, else: { actions: {} } },
      Log_it_in_Dataverse: { type: "Scope", actions: { Send_from_Dataverse: dv("PerformBoundAction", { entityName: "emails", actionName: "SendEmail", recordId: "@outputs('Create_the_email')?['body/activityid']", "item/IssueSend": true }) } },
    },
  }) },
  { id: I.flowNotify, clientdata: cd([["shared_office365", "contoso_outlook", "invoker"]], {
    triggers: { When_a_case_is_created: { type: "OpenApiConnectionWebhook", inputs: { host: { apiId: "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps", connectionName: "shared_commondataserviceforapps", operationId: "SubscribeWebhookTrigger" }, parameters: { "subscriptionRequest/message": 1, "subscriptionRequest/entityname": "incident", "subscriptionRequest/scope": 4, "subscriptionRequest/runas": 2 } } } },
    actions: {
      Tell_the_owner: o365("SendEmailV2", { "emailMessage/To": "@triggerOutputs()?['body/_ownerid_value']", "emailMessage/Subject": "New case" }),
    },
  }) },
];

// Classic workflows' XAML (the shapes Colvio reads: a Send Email step's From, fixed or from the row)
const xamlStep = (step, fromBlock) => `<Activity x:Class="XrmWorkflow00000000000000000000000000000000" xmlns="http://schemas.microsoft.com/netfx/2009/xaml/activities" xmlns:mxswa="clr-namespace:Microsoft.Xrm.Sdk.Workflow.Activities;assembly=Microsoft.Xrm.Sdk.Workflow, Version=9.0.0.0, Culture=neutral, PublicKeyToken=31bf3856ad364e35" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml">
  <mxswa:Workflow>
    <mxswa:ActivityReference AssemblyQualifiedName="Microsoft.Crm.Workflow.Activities.StepComposite, Microsoft.Crm.Workflow, Version=9.0.0.0, Culture=neutral, PublicKeyToken=31bf3856ad364e35" DisplayName="${step}">
      <mxswa:ActivityReference.Activities>
        <mxswa:ActivityReference AssemblyQualifiedName="Microsoft.Crm.Workflow.Activities.CreateCrmType, Microsoft.Crm.Workflow, Version=9.0.0.0, Culture=neutral, PublicKeyToken=31bf3856ad364e35" DisplayName="CreateCrmType">
          <mxswa:ActivityReference.Arguments>
            <InArgument x:TypeArguments="x:String" x:Key="Type">Microsoft.Xrm.Sdk.Entity</InArgument>
            <InArgument x:TypeArguments="x:String" x:Key="LogicalName">email</InArgument>
            <OutArgument x:TypeArguments="x:Object" x:Key="Result">[CreateStep1_1]</OutArgument>
          </mxswa:ActivityReference.Arguments>
        </mxswa:ActivityReference>
${fromBlock}
        <mxswa:ActivityReference AssemblyQualifiedName="Microsoft.Crm.Workflow.Activities.SetEntityProperty, Microsoft.Crm.Workflow, Version=9.0.0.0, Culture=neutral, PublicKeyToken=31bf3856ad364e35" DisplayName="SetEntityProperty">
          <mxswa:ActivityReference.Arguments>
            <InArgument x:TypeArguments="x:String" x:Key="Attribute">from</InArgument>
            <InArgument x:TypeArguments="mxs:Entity" x:Key="Entity">[CreateStep1_1]</InArgument>
            <InArgument x:TypeArguments="x:String" x:Key="EntityName">email</InArgument>
            <InArgument x:TypeArguments="x:Object" x:Key="Value">[CreateStep1_3]</InArgument>
          </mxswa:ActivityReference.Arguments>
        </mxswa:ActivityReference>
        <mxswa:ActivityReference AssemblyQualifiedName="Microsoft.Crm.Workflow.Activities.SendEmail, Microsoft.Crm.Workflow, Version=9.0.0.0, Culture=neutral, PublicKeyToken=31bf3856ad364e35" DisplayName="${step}">
          <mxswa:ActivityReference.Arguments>
            <InArgument x:TypeArguments="x:Boolean" x:Key="UseTemplate">False</InArgument>
            <InArgument x:TypeArguments="mxs:Entity" x:Key="Entity">[CreateStep1_1]</InArgument>
          </mxswa:ActivityReference.Arguments>
        </mxswa:ActivityReference>
      </mxswa:ActivityReference.Activities>
    </mxswa:ActivityReference>
  </mxswa:Workflow>
</Activity>`;
// From = the row's owner: GetEntityProperty → an activity party → the party list
const FROM_OWNER = `        <mxswa:ActivityReference AssemblyQualifiedName="Microsoft.Crm.Workflow.Activities.GetEntityProperty, Microsoft.Crm.Workflow, Version=9.0.0.0, Culture=neutral, PublicKeyToken=31bf3856ad364e35" DisplayName="GetEntityProperty">
          <mxswa:ActivityReference.Arguments>
            <InArgument x:TypeArguments="x:String" x:Key="Attribute">ownerid</InArgument>
            <InArgument x:TypeArguments="mxs:Entity" x:Key="Entity">[primaryEntity]</InArgument>
            <InArgument x:TypeArguments="x:String" x:Key="EntityName">opportunity</InArgument>
            <OutArgument x:TypeArguments="x:Object" x:Key="Value">[CreateStep1_2]</OutArgument>
          </mxswa:ActivityReference.Arguments>
        </mxswa:ActivityReference>
        <mxswa:ActivityReference AssemblyQualifiedName="Microsoft.Crm.Workflow.Activities.CreateCrmType, Microsoft.Crm.Workflow, Version=9.0.0.0, Culture=neutral, PublicKeyToken=31bf3856ad364e35" DisplayName="CreateCrmType">
          <mxswa:ActivityReference.Arguments>
            <InArgument x:TypeArguments="x:String" x:Key="Type">Microsoft.Xrm.Sdk.Entity</InArgument>
            <InArgument x:TypeArguments="x:String" x:Key="LogicalName">activityparty</InArgument>
            <OutArgument x:TypeArguments="x:Object" x:Key="Result">[CreateStep1_4]</OutArgument>
          </mxswa:ActivityReference.Arguments>
        </mxswa:ActivityReference>
        <mxswa:ActivityReference AssemblyQualifiedName="Microsoft.Crm.Workflow.Activities.SetEntityProperty, Microsoft.Crm.Workflow, Version=9.0.0.0, Culture=neutral, PublicKeyToken=31bf3856ad364e35" DisplayName="SetEntityProperty">
          <mxswa:ActivityReference.Arguments>
            <InArgument x:TypeArguments="x:String" x:Key="Attribute">partyid</InArgument>
            <InArgument x:TypeArguments="mxs:Entity" x:Key="Entity">[CreateStep1_4]</InArgument>
            <InArgument x:TypeArguments="x:String" x:Key="EntityName">activityparty</InArgument>
            <InArgument x:TypeArguments="x:Object" x:Key="Value">[CreateStep1_2]</InArgument>
          </mxswa:ActivityReference.Arguments>
        </mxswa:ActivityReference>
        <mxswa:ActivityReference AssemblyQualifiedName="Microsoft.Crm.Workflow.Activities.CreateCrmType, Microsoft.Crm.Workflow, Version=9.0.0.0, Culture=neutral, PublicKeyToken=31bf3856ad364e35" DisplayName="CreateCrmType">
          <mxswa:ActivityReference.Arguments>
            <InArgument x:TypeArguments="x:String" x:Key="Type">Microsoft.Xrm.Sdk.EntityCollection</InArgument>
            <InArgument x:TypeArguments="x:Object" x:Key="Item1">[CreateStep1_4]</InArgument>
            <OutArgument x:TypeArguments="x:Object" x:Key="Result">[CreateStep1_3]</OutArgument>
          </mxswa:ActivityReference.Arguments>
        </mxswa:ActivityReference>`;
// From = a fixed user: an EntityReference → an activity party → the party list
const FROM_USER = `        <mxswa:ActivityReference AssemblyQualifiedName="Microsoft.Crm.Workflow.Activities.CreateCrmType, Microsoft.Crm.Workflow, Version=9.0.0.0, Culture=neutral, PublicKeyToken=31bf3856ad364e35" DisplayName="CreateCrmType">
          <mxswa:ActivityReference.Arguments>
            <InArgument x:TypeArguments="x:String" x:Key="Type">Microsoft.Xrm.Sdk.EntityReference</InArgument>
            <InArgument x:TypeArguments="x:String" x:Key="LogicalName">systemuser</InArgument>
            <InArgument x:TypeArguments="x:String" x:Key="Id">${I.svc}</InArgument>
            <InArgument x:TypeArguments="x:String" x:Key="Name">svc-integration</InArgument>
            <OutArgument x:TypeArguments="x:Object" x:Key="Result">[CreateStep1_2]</OutArgument>
          </mxswa:ActivityReference.Arguments>
        </mxswa:ActivityReference>
        <mxswa:ActivityReference AssemblyQualifiedName="Microsoft.Crm.Workflow.Activities.CreateCrmType, Microsoft.Crm.Workflow, Version=9.0.0.0, Culture=neutral, PublicKeyToken=31bf3856ad364e35" DisplayName="CreateCrmType">
          <mxswa:ActivityReference.Arguments>
            <InArgument x:TypeArguments="x:String" x:Key="Type">Microsoft.Xrm.Sdk.Entity</InArgument>
            <InArgument x:TypeArguments="x:String" x:Key="LogicalName">activityparty</InArgument>
            <OutArgument x:TypeArguments="x:Object" x:Key="Result">[CreateStep1_4]</OutArgument>
          </mxswa:ActivityReference.Arguments>
        </mxswa:ActivityReference>
        <mxswa:ActivityReference AssemblyQualifiedName="Microsoft.Crm.Workflow.Activities.SetEntityProperty, Microsoft.Crm.Workflow, Version=9.0.0.0, Culture=neutral, PublicKeyToken=31bf3856ad364e35" DisplayName="SetEntityProperty">
          <mxswa:ActivityReference.Arguments>
            <InArgument x:TypeArguments="x:String" x:Key="Attribute">partyid</InArgument>
            <InArgument x:TypeArguments="mxs:Entity" x:Key="Entity">[CreateStep1_4]</InArgument>
            <InArgument x:TypeArguments="x:String" x:Key="EntityName">activityparty</InArgument>
            <InArgument x:TypeArguments="x:Object" x:Key="Value">[CreateStep1_2]</InArgument>
          </mxswa:ActivityReference.Arguments>
        </mxswa:ActivityReference>
        <mxswa:ActivityReference AssemblyQualifiedName="Microsoft.Crm.Workflow.Activities.CreateCrmType, Microsoft.Crm.Workflow, Version=9.0.0.0, Culture=neutral, PublicKeyToken=31bf3856ad364e35" DisplayName="CreateCrmType">
          <mxswa:ActivityReference.Arguments>
            <InArgument x:TypeArguments="x:String" x:Key="Type">Microsoft.Xrm.Sdk.EntityCollection</InArgument>
            <InArgument x:TypeArguments="x:Object" x:Key="Item1">[CreateStep1_4]</InArgument>
            <OutArgument x:TypeArguments="x:Object" x:Key="Result">[CreateStep1_3]</OutArgument>
          </mxswa:ActivityReference.Arguments>
        </mxswa:ActivityReference>`;
export const DEMO_XAML_DEFS = [
  { id: "w1", xaml: xamlStep("Send email: Big opportunity", FROM_OWNER) },
  { id: "w5", xaml: xamlStep("Send email: Welcome", FROM_USER) },
];
