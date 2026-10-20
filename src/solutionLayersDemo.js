// Demo answers for Metadata › 📑 Layers, in the msdyn_componentlayers row shape.
const row = (order, solution, publisher, at, attrs) => ({
  msdyn_order: order, msdyn_solutionname: solution, msdyn_publishername: publisher, msdyn_overwritetime: at,
  msdyn_changes: attrs ? JSON.stringify({ Attributes: Object.entries(attrs).map(([Key, Value]) => ({ Key, Value })) }) : "",
});

export function demoComponentLayers({ componentName, logicalName }) {
  if (componentName === "Entity") return [
    row(4, "Active", "Default Publisher for org", "2026-10-02T09:14:00Z", { description: "Companies we sell to (edited in prod)" }),
    row(3, "ContosoSales", "Contoso", "2026-09-18T16:40:00Z", { description: "Customer companies", iconvectorname: "contoso_account.svg" }),
    row(2, "msdynce_SalesPatch", "Dynamics 365", "2026-06-01T03:00:00Z", { displayname: "Account" }),
    row(1, "System", "Microsoft", "2024-01-01T00:00:00Z", { displayname: "Account", description: "Business that represents a customer or potential customer." }),
  ];
  if (logicalName === "new_sapid") return [
    row(3, "Active", "Default Publisher for org", "2026-10-11T11:02:00Z", { displayname: "SAP ID (old)", requiredlevel: "ApplicationRequired" }),
    row(2, "ContosoSAP", "Contoso", "2026-09-30T08:00:00Z", { displayname: "SAP ID", maxlength: 20, requiredlevel: "None" }),
    row(1, "System", "Microsoft", "2026-03-04T10:00:00Z", null),
  ];
  if (logicalName === "new_siretcode") return [
    row(2, "Active", "Default Publisher for org", "2026-08-20T14:30:00Z", { displayname: "SIRET", maxlength: 14 }),
    row(1, "System", "Microsoft", "2026-08-20T14:30:00Z", null),
  ];
  return [row(1, "System", "Microsoft", "2024-01-01T00:00:00Z", null)];
}
