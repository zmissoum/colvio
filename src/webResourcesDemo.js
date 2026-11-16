// Demo org for the Web Resources module: a handful of resources with real-looking contents,
// edits kept in memory for the session.
//
// One deterministic version conflict, to show what a live save does when someone else saved the
// resource meanwhile: Alex Baker is editing new_/scripts/opportunity.js too. His save lands ONCE
// per page load, right before the first save of that resource reaches the demo org — so a save
// conditional on the version you opened (If-Match, the ETag) is refused with CHANGED_ON_SERVER,
// as Dataverse refuses it (412). ↻ Reload then opens his version; ⚠ Overwrite (no If-Match)
// replaces it with yours. Reads never trigger it (Search in contents reads every script), and
// every other resource saves normally.
import { encodeContent } from "./webResources.js";

const g = (n) => `00000000-0000-4000-b000-${String(n).padStart(12, "0")}`;
const ago = (d) => new Date(Date.now() - d * 86400000).toISOString();
const ACCOUNT_JS = `// Contoso — Account form scripts
var Contoso = Contoso || {};
Contoso.Account = (function () {
  function onLoad(executionContext) {
    var formContext = executionContext.getFormContext();
    var sapId = formContext.getAttribute("new_sapid");
    if (sapId && sapId.getValue()) {
      formContext.getControl("new_sapid").setDisabled(true);
    }
    formContext.getAttribute("industrycode").addOnChange(onIndustryChange);
  }
  function onIndustryChange(executionContext) {
    var formContext = executionContext.getFormContext();
    var industry = formContext.getAttribute("industrycode").getValue();
    formContext.ui.tabs.get("tab_sap").setVisible(industry === 6);
  }
  return { onLoad: onLoad };
})();
`;
const CONTACT_JS = `// Contoso — Contact form scripts
function contactOnLoad(executionContext) {
  var formContext = executionContext.getFormContext();
  var parent = formContext.getAttribute("parentcustomerid").getValue();
  if (parent && parent[0].entityType === "account") {
    Xrm.WebApi.retrieveRecord("account", parent[0].id, "?$select=new_sapid,new_siretcode").then(function (a) {
      formContext.getAttribute("new_siretcode").setValue(a.new_siretcode);
    });
  }
}
`;
const OPPORTUNITY_JS = `// Contoso — Opportunity form scripts
var Contoso = Contoso || {};
Contoso.Opportunity = (function () {
  function onLoad(executionContext) {
    var formContext = executionContext.getFormContext();
    formContext.getAttribute("estimatedclosedate").setRequiredLevel("required");
  }
  return { onLoad: onLoad };
})();
`;
// Alex Baker's version of it (the conflict above): an OnSave approval rule.
const OPPORTUNITY_JS_ALEX = `// Contoso — Opportunity form scripts
var Contoso = Contoso || {};
Contoso.Opportunity = (function () {
  function onLoad(executionContext) {
    var formContext = executionContext.getFormContext();
    formContext.getAttribute("estimatedclosedate").setRequiredLevel("required");
  }
  // Deals above 1M need a manager's approval (Alex)
  function onSave(executionContext) {
    var formContext = executionContext.getFormContext();
    var value = formContext.getAttribute("estimatedvalue").getValue();
    formContext.getAttribute("new_approvalrequired").setValue(value > 1000000);
  }
  return { onLoad: onLoad, onSave: onSave };
})();
`;
const THEME_CSS = `.contoso-banner { background: #0f3d6e; color: #fff; padding: 8px 12px; }
.contoso-banner a { color: #9cd3ff; }
`;
const HELP_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><link rel="stylesheet" href="../css/theme.css"></head>
<body><div class="contoso-banner">Contoso sales help</div>
<p>Fill the SAP ID (new_sapid) once the account is created in SAP.</p>
<script src="../scripts/account.js"></script></body></html>
`;
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="#0f3d6e"/><text x="16" y="21" font-size="14" text-anchor="middle" fill="#fff">C</text></svg>`;

const store = new Map([
  [g(1), { name: "new_/scripts/account.js", displayName: "Account form scripts", type: 3, managed: false, content: encodeContent(ACCOUNT_JS), modifiedOn: ago(3), modifiedBy: "Zakaria Missoum" }],
  [g(2), { name: "new_/scripts/contact.js", displayName: "Contact form scripts", type: 3, managed: false, content: encodeContent(CONTACT_JS), modifiedOn: ago(12), modifiedBy: "Zakaria Missoum" }],
  [g(3), { name: "new_/css/theme.css", displayName: "Contoso theme", type: 2, managed: false, content: encodeContent(THEME_CSS), modifiedOn: ago(40), modifiedBy: "Alex Baker" }],
  [g(4), { name: "new_/html/help.html", displayName: "Sales help page", type: 1, managed: false, content: encodeContent(HELP_HTML), modifiedOn: ago(40), modifiedBy: "Alex Baker" }],
  [g(5), { name: "new_/img/contoso.svg", displayName: "Contoso icon", type: 11, managed: false, content: encodeContent(SVG), modifiedOn: ago(100), modifiedBy: "Alex Baker" }],
  [g(6), { name: "contoso_/sap/connector.js", displayName: "SAP connector (managed)", type: 3, managed: true, content: encodeContent("// managed — ContosoSAP 2.1.0\nvar ContosoSap = { endpoint: 'https://sap.contoso.example/api' };\n"), modifiedOn: ago(60), modifiedBy: "SYSTEM" }],
  [g(7), { name: "msdyn_/Sales/Account/Account_main_library.js", displayName: "", type: 3, managed: true, content: encodeContent("// Microsoft"), modifiedOn: ago(200), modifiedBy: "SYSTEM" }],
  [g(8), { name: "new_/scripts/opportunity.js", displayName: "Opportunity form scripts", type: 3, managed: false, content: encodeContent(OPPORTUNITY_JS), modifiedOn: ago(5), modifiedBy: "Zakaria Missoum" }],
]);

// The conflict described at the top: Alex Baker's save, applied once, just before the first save
// of his resource.
export const DEMO_CONFLICT = { name: "new_/scripts/opportunity.js", by: "Alex Baker" };
const colleague = { id: g(8), content: encodeContent(OPPORTUNITY_JS_ALEX), pending: true };
function colleagueSaves(id) {
  if (!colleague.pending || id !== colleague.id) return;
  colleague.pending = false;
  const r = store.get(id);
  r.content = colleague.content; r.modifiedOn = new Date().toISOString(); r.modifiedBy = DEMO_CONFLICT.by; r.v = (r.v || 1) + 1;
}

export const demoWebResources = () => [...store.entries()].map(([id, r]) => ({ id, name: r.name, displayName: r.displayName, type: r.type, managed: r.managed, hidden: false, customizable: !r.managed, modifiedOn: r.modifiedOn, modifiedBy: r.modifiedBy }));
// The demo's ETags: a version counter per resource, like Dataverse's W/"<n>".
const etagOf = (r) => `W/"${r.v || 1}"`;
// modifiedBy rides along in demo (the live read doesn't carry it): a refused save names who saved.
export const demoWebResourceContents = (ids) => (ids || []).filter(id => store.has(id)).map(id => { const r = store.get(id); return { id, name: r.name, type: r.type, content: r.content, description: "", modifiedOn: r.modifiedOn, modifiedBy: r.modifiedBy, managed: r.managed, etag: etagOf(r) }; });
// A save conditional on the ETag opened (null = overwrite): a stale one is refused like Dataverse's 412.
export function demoUpdateWebResource(id, content, etag = null) {
  const r = store.get(id);
  if (!r) throw new Error("No such web resource.");
  colleagueSaves(id);
  if (etag && etag !== etagOf(r)) throw new Error("CHANGED_ON_SERVER: the web resource changed on the server since you opened it");
  r.content = content; r.modifiedOn = new Date().toISOString(); r.modifiedBy = "You"; r.v = (r.v || 1) + 1;
  return { ok: true, etag: etagOf(r), modifiedOn: r.modifiedOn, modifiedBy: r.modifiedBy };
}
