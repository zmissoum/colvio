// Demo org for Metadata › 🔎 Search result columns: the raw answer getSearchConfig gives —
// tables with their search switch, their Quick Find views (fetchxml + layoutxml), and the search
// service's status as the v2 endpoint returns it.
const qf = (entity, find, view) => ({
  id: `d0000000-0000-4000-8000-0000000${String(entity.length).padStart(3, "0")}${entity.slice(0, 2)}`.slice(0, 36).padEnd(36, "0").replace(/[^0-9a-f-]/g, "0"),
  name: "Quick Find Active " + entity.charAt(0).toUpperCase() + entity.slice(1) + "s",
  entity, isDefault: true, managed: true,
  fetchxml: `<fetch version="1.0" output-format="xml-platform" mapping="logical"><entity name="${entity}">${view.map(c => `<attribute name="${c}" />`).join("")}<attribute name="${entity}id" /><order attribute="${view[0]}" descending="false" /><filter type="and"><condition attribute="statecode" operator="eq" value="0" /></filter><filter type="or" isquickfindfields="1">${find.map(c => `<condition attribute="${c}" operator="like" value="{0}" />`).join("")}</filter></entity></fetch>`,
  layoutxml: `<grid name="resultset" object="1" jump="${view[0]}" select="1" icon="1" preview="1"><row name="result" id="${entity}id">${view.map(c => `<cell name="${c}" width="150" />`).join("")}<cell name="${entity}id" ishidden="1" /></row></grid>`,
});
const ago = (h) => new Date(Date.now() - h * 36e5).toISOString();

export function demoSearchConfig() {
  const entities = [
    { logical: "account", display: "Account", set: "accounts", isCustom: false, enabled: true, canEnable: true },
    { logical: "contact", display: "Contact", set: "contacts", isCustom: false, enabled: true, canEnable: true },
    { logical: "opportunity", display: "Opportunity", set: "opportunities", isCustom: false, enabled: true, canEnable: true },
    { logical: "lead", display: "Lead", set: "leads", isCustom: false, enabled: true, canEnable: true },
    { logical: "incident", display: "Case", set: "incidents", isCustom: false, enabled: false, canEnable: true },
    { logical: "new_project", display: "Project", set: "new_projects", isCustom: true, enabled: true, canEnable: true },
    { logical: "new_salescode", display: "Sales Code", set: "new_salescodes", isCustom: true, enabled: false, canEnable: true },
    { logical: "systemuser", display: "User", set: "systemusers", isCustom: false, enabled: true, canEnable: true },
    { logical: "activitypointer", display: "Activity", set: "activitypointers", isCustom: false, enabled: false, canEnable: false },
  ];
  const views = [
    qf("account", ["name", "accountnumber", "emailaddress1", "telephone1"], ["name", "accountnumber", "address1_city", "primarycontactid", "telephone1"]),
    qf("contact", ["fullname", "emailaddress1", "firstname", "lastname"], ["fullname", "emailaddress1", "parentcustomerid", "telephone1"]),
    qf("opportunity", ["name"], ["name", "customerid", "estimatedvalue", "estimatedclosedate", "statuscode"]),
    qf("lead", ["fullname", "companyname", "emailaddress1"], ["fullname", "companyname", "statuscode"]),
    qf("systemuser", [], ["fullname", "internalemailaddress", "businessunitid"]), // enabled, nothing searched
    qf("incident", ["title", "ticketnumber"], ["title", "ticketnumber", "customerid"]),
    // new_project is enabled for search but has no Quick Find view at all
  ];
  const status = {
    value: {
      status: "Provisioned",
      entitystatusresults: [
        { entityname: "account", objecttypecode: 1, lastsynctimeutc: ago(2), recordcount: 12450, status: "EntitySyncCompleted", searchableattributes: ["name", "accountnumber", "emailaddress1", "telephone1"] },
        { entityname: "contact", objecttypecode: 2, lastsynctimeutc: ago(2), recordcount: 34200, status: "EntitySyncCompleted", searchableattributes: ["fullname", "emailaddress1", "firstname", "lastname"] },
        { entityname: "opportunity", objecttypecode: 3, lastsynctimeutc: ago(26), recordcount: 8900, status: "EntitySyncCompleted", searchableattributes: ["name"] },
        { entityname: "lead", objecttypecode: 4, lastsynctimeutc: ago(0.5), recordcount: 2100, status: "EntitySyncInProgress", searchableattributes: ["fullname", "companyname"] },
        { entityname: "systemuser", objecttypecode: 8, lastsynctimeutc: ago(2), recordcount: 142, status: "EntitySyncCompleted", searchableattributes: [] },
        { entityname: "new_project", objecttypecode: 10042, lastsynctimeutc: null, recordcount: 0, status: "EntitySyncNotStarted", searchableattributes: [] },
      ],
    },
  };
  return { entities, views, status, statusError: "" };
}
