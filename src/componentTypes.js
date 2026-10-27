// Dataverse solution-component types (solutioncomponent.componenttype) — ONE table for what the
// panel knows about each: the short label + icon SolutionExplorer groups by (`l`, `i`), the plain
// label the dependency check prints (`label`), and, where known, the entity set and the id / name
// fields that resolve an objectid to a name (`set`, `id`, `name`). Codes are Microsoft's official
// enumeration (an earlier map had several shifted: 60 is System Form, 61 Web Resource, 63
// Connection Role, 90 Plugin Type). content.js carries two REC maps of the same set/id/name
// triples (getComponentDependencies and getSolutionComponents) that should read this file once
// the content script can import modules; until then keep the three in step by hand.
// Two labels per type on purpose: the dependency check speaks the maker portal's words ("Table",
// "Column", "Plug-in step"), the explorer keeps the SDK's ("Entity", "Attribute", "SDK Message
// Step") — tests pin both.
export const COMPONENT_TYPES = {
  1: { l: "Entity", i: "📋", label: "Table" },
  2: { l: "Attribute", i: "🔤", label: "Column" },
  3: { l: "Relationship", i: "🔗", label: "Relationship" },
  4: { label: "Choice value" },
  9: { l: "OptionSet", i: "📊", label: "Choice (global)" },
  10: { l: "Relationship", i: "🔗", label: "Relationship" },
  14: { l: "Entity Key", i: "🔑", label: "Alternate key" },
  16: { label: "Privilege" },
  20: { l: "Security Role", i: "🛡", label: "Security role", set: "roles", id: "roleid", name: "name" },
  21: { label: "Role privilege" },
  22: { l: "Display String", i: "🔠" },
  24: { l: "Form", i: "📝", label: "Form", set: "systemforms", id: "formid", name: "name" },
  25: { l: "Organization", i: "🏛", label: "Organization" },
  26: { l: "View", i: "👁", label: "View", set: "savedqueries", id: "savedqueryid", name: "name" },
  29: { l: "Workflow / Process", i: "⚙", label: "Process", set: "workflows", id: "workflowid", name: "name" },
  31: { l: "Report", i: "📄", label: "Report", set: "reports", id: "reportid", name: "name" },
  35: { l: "Attachment", i: "📎" },
  36: { l: "Email Template", i: "✉", label: "Email template", set: "templates", id: "templateid", name: "title" },
  37: { l: "Contract Template", i: "📑", label: "Contract template", set: "contracttemplates", id: "contracttemplateid", name: "name" },
  39: { l: "Mail Merge Template", i: "📨", label: "Mail merge template", set: "mailmergetemplates", id: "mailmergetemplateid", name: "name" },
  44: { l: "Duplicate Rule", i: "🔁", label: "Duplicate detection rule", set: "duplicaterules", id: "duplicateruleid", name: "name" },
  45: { label: "Duplicate detection condition", set: "duplicateruleconditions", id: "duplicateruleconditionid", name: "baseattributename" },
  46: { label: "Relationship mapping", set: "entitymaps", id: "entitymapid", name: "sourceentityname" },
  47: { label: "Column mapping", set: "attributemaps", id: "attributemapid", name: "sourceattributename" },
  48: { l: "Ribbon Command", i: "🎀", label: "Ribbon command" },
  50: { l: "Ribbon Customization", i: "🎀", label: "Ribbon customization" },
  52: { label: "Ribbon rule" },
  55: { label: "Ribbon diff" },
  59: { l: "Chart", i: "📈", label: "Chart", set: "savedqueryvisualizations", id: "savedqueryvisualizationid", name: "name" },
  60: { l: "System Form", i: "📝", label: "Form", set: "systemforms", id: "formid", name: "name" },
  61: { l: "Web Resource", i: "🌐", label: "Web resource", set: "webresourceset", id: "webresourceid", name: "name" },
  62: { l: "Sitemap", i: "🗺", label: "Site map", set: "sitemaps", id: "sitemapid", name: "sitemapname" },
  63: { l: "Connection Role", i: "🔌", label: "Connection role", set: "connectionroles", id: "connectionroleid", name: "name" },
  64: { label: "Complex control" },
  65: { l: "Hierarchy Rule", i: "🌳", label: "Hierarchy rule", set: "hierarchyrules", id: "hierarchyruleid", name: "name" },
  66: { l: "Custom Control", i: "🎛", label: "Custom control (PCF)", set: "customcontrols", id: "customcontrolid", name: "name" },
  68: { label: "Custom control default config" },
  70: { l: "Field Security Profile", i: "🔒", label: "Field security profile", set: "fieldsecurityprofiles", id: "fieldsecurityprofileid", name: "name" },
  71: { l: "Field Permission", i: "🔐", label: "Field permission", set: "fieldpermissions", id: "fieldpermissionid", name: "attributelogicalname" },
  80: { l: "Model-driven App", i: "📱", label: "Model-driven app", set: "appmodules", id: "appmoduleid", name: "name" },
  90: { l: "Plugin Type", i: "⚙", label: "Plug-in type", set: "plugintypes", id: "plugintypeid", name: "name" },
  91: { l: "Plugin Assembly", i: "🔧", label: "Plug-in assembly", set: "pluginassemblies", id: "pluginassemblyid", name: "name" },
  92: { l: "SDK Message Step", i: "📍", label: "Plug-in step", set: "sdkmessageprocessingsteps", id: "sdkmessageprocessingstepid", name: "name" },
  93: { l: "SDK Step Image", i: "🖼", label: "Plug-in step image", set: "sdkmessageprocessingstepimages", id: "sdkmessageprocessingstepimageid", name: "name" },
  95: { l: "Service Endpoint", i: "📡", label: "Service endpoint", set: "serviceendpoints", id: "serviceendpointid", name: "name" },
  150: { l: "Routing Rule", i: "🧭", label: "Routing rule" },
  151: { l: "Routing Rule Item", i: "🧭", label: "Routing rule item" },
  152: { l: "SLA", i: "⏱", label: "SLA", set: "slas", id: "slaid", name: "name" },
  153: { l: "SLA Item", i: "⏱", label: "SLA item", set: "slaitems", id: "slaitemid", name: "name" },
  154: { l: "Convert Rule", i: "🔄", label: "Record creation rule" },
  155: { label: "Record creation rule item" },
  161: { l: "Mobile Offline Profile", i: "📶", label: "Mobile offline profile", set: "mobileofflineprofiles", id: "mobileofflineprofileid", name: "name" },
  162: { label: "Mobile offline profile item", set: "mobileofflineprofileitems", id: "mobileofflineprofileitemid", name: "name" },
  165: { label: "Similarity rule" },
  166: { label: "Data source mapping" },
  208: { label: "Import map" },
  300: { l: "Canvas App", i: "🎨", label: "Canvas app", set: "canvasapps", id: "canvasappid", name: "displayname" },
  371: { l: "Connector", i: "🔌", label: "Connector", set: "connectors", id: "connectorid", name: "name" },
  372: { l: "Connector", i: "🔌", label: "Connector" },
  380: { l: "Environment Variable", i: "🌱", label: "Environment variable", set: "environmentvariabledefinitions", id: "environmentvariabledefinitionid", name: "displayname" },
  381: { l: "Env Variable Value", i: "🌱", label: "Environment variable value" },
  400: { label: "AI project type" },
  401: { label: "AI project" },
  402: { label: "AI configuration" },
  430: { label: "Table analytics configuration" },
  431: { label: "Column image configuration" },
  432: { label: "Table image configuration" },
};

const pick = (keys) => Object.fromEntries(Object.entries(COMPONENT_TYPES).filter(([, v]) => keys.every(k => v[k] != null)).map(([t, v]) => [t, Object.fromEntries(keys.map(k => [k, v[k]]))]));
// SolutionExplorer's grouping table: { type: { l, i } } — only the types it has a short label for.
export const COMP_TYPES = pick(["l", "i"]);
// The dependency check's wording: { type: label } — only the types it has a plain label for.
export const COMPONENT_LABEL = Object.fromEntries(Object.entries(COMPONENT_TYPES).filter(([, v]) => v.label).map(([t, v]) => [t, v.label]));
// Where a component of a type lives, for name resolution: { type: { set, id, name } }.
export const COMPONENT_RECORDS = pick(["set", "id", "name"]);
