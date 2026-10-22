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
const cd = (refs) => JSON.stringify({ properties: { connectionReferences: Object.fromEntries(refs.map(([key, ref, src]) => [key, { runtimeSource: src || "embedded", connection: { connectionReferenceLogicalName: ref }, api: { name: key } }])) }, schemaVersion: "1.0.0.0" });
export const DEMO_FLOW_DEFS = [
  { id: I.flowSap, clientdata: cd([["shared_commondataserviceforapps", "contoso_dataverse"], ["shared_sap", "contoso_sapconnection"]]) },
  { id: I.flowDigest, clientdata: cd([["shared_commondataserviceforapps", "contoso_dataverse"], ["shared_office365", "contoso_outlook"]]) },
  { id: I.flowNotify, clientdata: cd([["shared_office365", "contoso_outlook", "invoker"]]) },
];
