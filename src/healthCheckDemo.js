// Demo org answering the 🩺 Health check's reads (same shapes as live). isProd: the demo org is a
// sandbox unless the opt-in demo production flag is set (demoProduction.js) — then the production-
// only checks run too: two unmanaged solutions (the Solutions demo's own) are flagged.
const FV = "@OData.Community.Display.V1.FormattedValue";

export function demoHealthApi({ isProd = false } = {}) {
  return {
    isProd: !!isProd,
    org: { plugintracelogsetting: 2, isauditenabled: true, auditretentionperiodv2: -1 },
    async fetchAggregate(xml) {
      if (/statuscode" operator="eq" value="31"/.test(xml)) return [{ name: "SurveySync: Update of account", n: 126 }, { name: "Recalculate territory", n: 9 }];
      if (/statecode" operator="eq" value="1"/.test(xml)) return [{ name: "Send welcome email", n: 42 }];
      return [];
    },
    async fetchAll(xml) {
      if (/<entity name="workflow">/.test(xml) && /value="5"/.test(xml)) return [{ name: "Push new accounts to SAP", "o.fullname": "Paul Durand" }, { name: "Weekly account digest", "o.fullname": "Paul Durand" }];
      if (/sdkmessageprocessingstep/.test(xml)) return [{ name: "Contoso.Plugins.AccountAudit: Update of account", "f.primaryobjecttypecode": "account", [`f.primaryobjecttypecode${FV}`]: "Account", stage: 40, [`stage${FV}`]: "Post-operation" }];
      return [];
    },
    async odataAll(path) {
      if (path.startsWith("connectionreferences")) return [{ connectionreferencedisplayname: "SAP connector (Contoso)", connectionreferencelogicalname: "contoso_sapconnection", connectorid: "/providers/Microsoft.PowerApps/apis/shared_sap" }];
      if (path.startsWith("environmentvariabledefinitions")) return [
        { environmentvariabledefinitionid: "e1", schemaname: "contoso_SapBaseUrl", displayname: "SAP base URL" },
        { environmentvariabledefinitionid: "e2", schemaname: "contoso_SurveyApiKey", displayname: "Survey API key" },
      ];
      if (path.startsWith("environmentvariablevalues")) return [{ _environmentvariabledefinitionid_value: "e1" }];
      if (path.startsWith("systemusers")) return [{ fullname: "Nora Petit", internalemailaddress: "nora.petit@contoso.example" }, { fullname: "Training User 3", internalemailaddress: "training3@contoso.example" }];
      if (path.startsWith("solutions")) return [{ friendlyname: "Colvio Demo Solution", uniquename: "ColvioDemo", version: "1.0.0.0" }, { friendlyname: "Contoso Sales", uniquename: "ContosoSales", version: "1.2.0.0" }];
      return [];
    },
    async counts(names) {
      const demo = { asyncoperation: 1240300, workflowlog: 96400, plugintracelog: 18200, bulkdeletefailure: 12, importlog: 3100, duplicaterecord: 900 };
      return { counts: Object.fromEntries(names.map(k => [k, demo[k] ?? 0])) };
    },
  };
}
