// Content script › metadata. Metadata — tables, columns, choices, relationships, keys, dependencies, layers, publishing, columns from a sheet, labels and translations.
// One async function per action; `params` is what the panel sent. Every request goes through
// core.js (dvRequest: host lock, pacing, timeouts, 429 back-off).
import { NO_ANN, dvRequest, validateEntitySet, validateGuid, validateName } from "../core.js";

const ACTIONS = {
  async getEntities(params) {
    let result;
    // TableType tells apart Virtual tables (external data via a data provider — writes and
    // filter operators depend on the provider, no audit/recycle bin) and Elastic tables
    // (Cosmos-backed — 500-row max pages, the audit-table gotcha). Selectable on current
    // orgs; fall back without it so the entity list can never break on an older schema.
    let rawE;
    // Intersect (N:N) tables — teammembership, systemuserroles, the custom many-to-many
    // ones — are listed too, flagged isIntersect: they are queryable like any table (the
    // Explorer reads them), only not created through a POST (the Loader leaves them out).
    const selE = "LogicalName,DisplayName,EntitySetName,PrimaryIdAttribute,IsCustomEntity,IsManaged,MetadataId,IsIntersect";
    try { rawE = await dvRequest("GET", `EntityDefinitions?$select=${selE},TableType`); }
    catch { rawE = await dvRequest("GET", `EntityDefinitions?$select=${selE}`); }
    result = (rawE.value || []).map(e => ({
      logical: e.LogicalName,
      display: e.DisplayName?.UserLocalizedLabel?.Label || e.LogicalName,
      entitySet: e.EntitySetName || (e.LogicalName + "s"),
      primaryId: e.PrimaryIdAttribute || null,
      isCustom: e.IsCustomEntity || false,
      isManaged: e.IsManaged || false,
      isIntersect: e.IsIntersect === true,
      metadataId: e.MetadataId || null,
      tableType: e.TableType || "Standard",
    }));
    return result;
  },
  async getFields(params) {
    let result;
    validateName(params.logicalName, 'logicalName');
    const VIRTUAL_TYPES = { MultiSelectPicklistType: "MultiSelectPicklist", FileType: "File", ImageType: "Image" };
    // Base attribute metadata + the typed String/Memo casts — MaxLength/Format live only on
    // those typed metadata, not on the base AttributeMetadata. The casts are best-effort: if
    // an org/version rejects them, fields still return (without lengths).
    const [raw, strMeta, memoMeta] = await Promise.all([
      dvRequest("GET", `EntityDefinitions(LogicalName='${params.logicalName}')/Attributes`),
      dvRequest("GET", `EntityDefinitions(LogicalName='${params.logicalName}')/Attributes/Microsoft.Dynamics.CRM.StringAttributeMetadata?$select=LogicalName,MaxLength,Format`).catch(() => ({ value: [] })),
      dvRequest("GET", `EntityDefinitions(LogicalName='${params.logicalName}')/Attributes/Microsoft.Dynamics.CRM.MemoAttributeMetadata?$select=LogicalName,MaxLength,Format`).catch(() => ({ value: [] })),
    ]);
    const lenMap = {};
    for (const a of [...(strMeta.value || []), ...(memoMeta.value || [])]) {
      lenMap[a.LogicalName] = { maxLength: typeof a.MaxLength === "number" ? a.MaxLength : null, format: a.Format || null };
    }

    result = (raw.value || [])
      .filter(a => {
        // ══════════════════════════════════════════════════
        // THE DEFINITIVE FILTER: IsValidForRead
        // This is D365's own flag that says "this field can
        // appear in $select". Covers ALL edge cases:
        // - *codename, *name computed labels
        // - isprivate, versionnumber
        // - Virtual, EntityName, CalendarRules
        // - yomi* fields
        // - Any future non-queryable field
        // ══════════════════════════════════════════════════
        if (a.IsValidForRead === false) return false;

        // Also skip fields that are computed from another field
        if (a.AttributeOf) return false;

        // Skip types that are never useful in data queries. "Virtual" is ALSO what
        // multi-select choice, File and Image columns report as AttributeType — those are
        // real, queryable columns (they vanished from Metadata, Schema and Show All Data).
        const aType = a.AttributeType || "";
        if (aType === "CalendarRules") return false;
        if (aType === "Virtual" && !VIRTUAL_TYPES[a.AttributeTypeName?.Value]) return false;

        return true;
      })
      .map(a => {
        const aType = (a.AttributeType === "Virtual" && VIRTUAL_TYPES[a.AttributeTypeName?.Value]) || a.AttributeType || "String";
        const logicalName = a.LogicalName;
        // Lookup / Customer / Owner are all single-valued lookups → the queryable column is
        // _<name>_value (Owner is the polymorphic principal type; missing it made ownerid
        // resolve to the raw nav property → "incompatible types principal/String" on filter).
        const odataName = (aType === "Lookup" || aType === "Customer" || aType === "Owner")
          ? `_${logicalName}_value`
          : logicalName;
        return {
          logical: logicalName,
          odataName: odataName,
          display: a.DisplayName?.UserLocalizedLabel?.Label || logicalName,
          type: aType,
          // The entity's PrimaryIdAttribute marker — the RELIABLE way to find the id column
          // (the <entity>id heuristic breaks on activities, where the PK is activityid).
          isPrimaryId: a.IsPrimaryId || false,
          // MetadataId — the key dependency-graph edges use to reference an attribute.
          metadataId: a.MetadataId || null,
          isCustom: a.IsCustomAttribute || false,
          required: a.RequiredLevel?.Value === "ApplicationRequired" || a.RequiredLevel?.Value === "SystemRequired",
          // Writability — used by the Loader to keep read-only / calculated / rollup
          // fields out of CREATE/UPDATE mapping (they 400 per row otherwise).
          validForCreate: a.IsValidForCreate !== false,
          validForUpdate: a.IsValidForUpdate !== false,
          // MaxLength/Format (String + Memo only) — fuels the Loader pre-flight length check.
          maxLength: lenMap[logicalName]?.maxLength ?? null,
          format: lenMap[logicalName]?.format ?? null,
        };
      });
    return result;
  },
  async getEntityCount(params) {
    let result;
    try {
      validateEntitySet(params.entitySet);
      const countResp = await dvRequest("GET", `${params.entitySet}/$count`, null, NO_ANN);
      // $count returns plain text integer, not JSON
      result = typeof countResp === "number" ? countResp : parseInt(String(countResp), 10) || 0;
    } catch {
      result = -1; // Not available
    }
    return result;
  },
  async getEntitySet(params) {
    let result;
    validateName(params.logicalName, 'logicalName');
    const entDef = await dvRequest("GET",
      `EntityDefinitions(LogicalName='${params.logicalName}')?$select=EntitySetName`
    );
    result = entDef?.EntitySetName || (params.logicalName + "s");
    return result;
  },
  async getIntersectRelationships(params) {
    let result;
    // Every many-to-many relationship of the org, by its intersect table: which two tables it
    // joins, through which navigation properties (the association endpoints). One read, the
    // bridge caches it; the Loader's association mode looks its table up in it.
    const dM = await dvRequest("GET", "RelationshipDefinitions/Microsoft.Dynamics.CRM.ManyToManyRelationshipMetadata?$select=SchemaName,IntersectEntityName,Entity1LogicalName,Entity2LogicalName,Entity1IntersectAttribute,Entity2IntersectAttribute,Entity1NavigationPropertyName,Entity2NavigationPropertyName");
    result = (dM.value || []).map(r => ({
      schemaName: r.SchemaName,
      intersect: String(r.IntersectEntityName || "").toLowerCase(),
      entity1: r.Entity1LogicalName, attr1: r.Entity1IntersectAttribute, nav1: r.Entity1NavigationPropertyName,
      entity2: r.Entity2LogicalName, attr2: r.Entity2IntersectAttribute, nav2: r.Entity2NavigationPropertyName,
    })).filter(r => r.intersect && r.entity1 && r.entity2 && r.nav1);
    return result;
  },
  async getAllOptionSets(params) {
    let result;
    // Every choice column of a table in FOUR reads (one per choice type) — the export used
    // to read them one column at a time.
    validateName(params.logicalName, "logicalName");
    const base = `EntityDefinitions(LogicalName='${params.logicalName}')/Attributes`;
    const rows = [];
    for (const [type, global] of [["PicklistAttributeMetadata", true], ["MultiSelectPicklistAttributeMetadata", true], ["StateAttributeMetadata", false], ["StatusAttributeMetadata", false]]) {
      try {
        const d = await dvRequest("GET", `${base}/Microsoft.Dynamics.CRM.${type}?$select=LogicalName&$expand=OptionSet($select=Options)${global ? ",GlobalOptionSet($select=Options)" : ""}`);
        rows.push(...(d.value || []));
      } catch (e) {
        // a cast the org doesn't expose answers 404 — anything else (429, timeout, 403) must
        // surface: a partial set exported as complete would hide columns
        if (/404|not found|could not find|does not exist/i.test(e.message || "")) continue;
        throw e;
      }
    }
    result = rows;
    return result;
  },
  async getDictionaryChunk(params) {
    let result;
    // The columns of a packet of tables in ONE metadata read (an "or" filter on the names);
    // an org that refuses the filter is read table by table for this packet only.
    const names = [...new Set((params.logicalNames || []).map(String))];
    names.forEach(n => validateName(n, "logicalName"));
    if (!names.length) { result = []; return result; }
    const sel = "$select=LogicalName,DisplayName,Description,IsCustomEntity&$expand=Attributes($select=LogicalName,SchemaName,DisplayName,Description,AttributeType,AttributeTypeName,RequiredLevel,IsCustomAttribute,IsPrimaryId,IsPrimaryName,IsValidForCreate,IsValidForUpdate,AttributeOf)";
    try {
      const d = await dvRequest("GET", `EntityDefinitions?${sel}&$filter=${names.map(n => `LogicalName eq '${n}'`).join(" or ")}`);
      result = d.value || [];
    } catch {
      const out = [];
      for (const n of names) {
        try { out.push(await dvRequest("GET", `EntityDefinitions(LogicalName='${n}')?${sel}`)); }
        catch (e2) { if (!/404|not found|could not find|does not exist/i.test(e2.message || "")) throw e2; /* a table that isn't there is skipped; a failure stops the dictionary */ }
      }
      result = out;
    }
    return result;
  },
  async getOptionSet(params) {
    let result;
    // Fetch OptionSet values for a Picklist/State/Status field
    validateName(params.entityName, 'entityName');
    validateName(params.fieldName, 'fieldName');
    const metaType = params.attrType === "State" ? "StateAttributeMetadata"
      : params.attrType === "Status" ? "StatusAttributeMetadata"
      : "PicklistAttributeMetadata";
    try {
      const osData = await dvRequest("GET",
        `EntityDefinitions(LogicalName='${params.entityName}')/Attributes(LogicalName='${params.fieldName}')/Microsoft.Dynamics.CRM.${metaType}?$select=LogicalName&$expand=OptionSet($select=Options)`
      );
      const options = osData?.OptionSet?.Options || [];
      result = options.map(o => ({
        value: o.Value,
        label: o.Label?.UserLocalizedLabel?.Label || `Value ${o.Value}`,
        // Every provisioned language's label — lets the Loader match a file whose labels
        // are in another org language than the connected user's (FR org + EN export…).
        labels: (o.Label?.LocalizedLabels || []).map(l => l && l.Label).filter(Boolean),
        color: o.Color || null,
        description: o.Description?.UserLocalizedLabel?.Label || "",
        isDefault: o.IsDefaultValue || false,
      }));
    } catch (e) {
      // Fallback: try GlobalOptionSet
      try {
        const osData2 = await dvRequest("GET",
          `EntityDefinitions(LogicalName='${params.entityName}')/Attributes(LogicalName='${params.fieldName}')/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$select=LogicalName&$expand=GlobalOptionSet($select=Options)`
        );
        const options2 = osData2?.GlobalOptionSet?.Options || [];
        result = options2.map(o => ({
          value: o.Value,
          label: o.Label?.UserLocalizedLabel?.Label || `Value ${o.Value}`,
          labels: (o.Label?.LocalizedLabels || []).map(l => l && l.Label).filter(Boolean),
          color: o.Color || null,
          description: o.Description?.UserLocalizedLabel?.Label || "",
        }));
      } catch { result = []; }
    }
    return result;
  },
  async getLookups(params) {
    let result;
    validateName(params.logicalName, 'logicalName');
    const rels = await dvRequest("GET",
      `EntityDefinitions(LogicalName='${params.logicalName}')/ManyToOneRelationships`
    );
    result = (rels.value || []).map(r => ({
      lookupField: r.ReferencingAttribute,
      navProperty: r.ReferencingEntityNavigationPropertyName,
      targetEntity: r.ReferencedEntity,
      targetEntitySet: r.ReferencedEntityNavigationPropertyName,
      schemaName: r.SchemaName,
      type: "single",
    }));
    return result;
  },
  async getEntityKeys(params) {
    let result;
    validateName(params.logicalName, 'logicalName');
    try {
      const data = await dvRequest("GET",
        `EntityDefinitions(LogicalName='${params.logicalName}')/Keys?$select=KeyAttributes,LogicalName`
      );
      result = (data.value || []).map(k => ({
        logicalName: k.LogicalName,
        keyAttributes: k.KeyAttributes || [],
      }));
    } catch {
      result = [];
    }
    return result;
  },
  async getChildRelationships(params) {
    let result;
    validateName(params.logicalName, 'logicalName');
    const childRels = await dvRequest("GET",
      `EntityDefinitions(LogicalName='${params.logicalName}')/OneToManyRelationships`
    );
    result = (childRels.value || []).map(r => ({
      lookupField: r.ReferencingAttribute,
      navProperty: r.ReferencedEntityNavigationPropertyName,
      targetEntity: r.ReferencingEntity,
      schemaName: r.SchemaName,
      type: "collection",
    }));
    return result;
  },
  async getComponentLayers(params) {
    let result;
    // The solution layers of ONE component (msdyn_componentlayers — the maker portal's "See
    // solution layers"), one read: order, solution, publisher, time and what each layer
    // changes. Each layer's full component JSON is left out.
    if (!/^[A-Za-z]+$/.test(String(params.componentName || ""))) throw new Error("Invalid component name.");
    if (!params.componentId) throw new Error("Missing component id.");
    validateGuid(params.componentId);
    const fL = `msdyn_componentid eq '${params.componentId}' and msdyn_solutioncomponentname eq '${params.componentName}'`;
    let dL;
    try { dL = await dvRequest("GET", `msdyn_componentlayers?$select=msdyn_name,msdyn_order,msdyn_solutionname,msdyn_publishername,msdyn_overwritetime,msdyn_changes&$filter=${fL}`); }
    catch { dL = await dvRequest("GET", `msdyn_componentlayers?$filter=${fL}`); }
    result = (dL.value || []).map(r => ({ msdyn_order: r.msdyn_order, msdyn_solutionname: r.msdyn_solutionname, msdyn_publishername: r.msdyn_publishername, msdyn_overwritetime: r.msdyn_overwritetime, msdyn_changes: r.msdyn_changes }));
    return result;
  },
  async getComponentDependencies(params) {
    let result;
    // Dataverse's own dependency check of one component — a column (2), a table (1), a
    // global choice (9) — one read: mode "delete" = what would BLOCK deleting it
    // (RetrieveDependenciesForDelete), "used" = everything that uses it (RetrieveDependentComponents).
    if (!params.objectId) throw new Error("Missing component id.");
    validateGuid(params.objectId);
    const ctD = Number(params.componentType);
    if (!Number.isInteger(ctD) || ctD < 1 || ctD > 10000) throw new Error("Invalid component type.");
    const fnD = params.mode === "used" ? "RetrieveDependentComponents" : "RetrieveDependenciesForDelete";
    const dDel = await dvRequest("GET", `${fnD}(ObjectId=@o,ComponentType=@t)?@o=${params.objectId}&@t=${ctD}`);
    result = dDel.value || [];
    return result;
  },
  async resolveComponents(params) {
    let result;
    // Names of solution components, grouped by type: record-backed types in "or" packets of
    // 25 ids, choices and relationships in one metadata read each, columns and keys per
    // packet of 10 parent tables. Never one request per component; a type that can't be
    // read stays unnamed (the UI shows its kind and id).
    const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const itemsR = (params.items || []).filter(x => x && GUID_RE.test(String(x.id || "")) && Number.isInteger(Number(x.type)));
    const names = {};
    const keyOf = (t, id) => `${t}|${String(id).toLowerCase()}`;
    const label = (l) => l?.UserLocalizedLabel?.Label || l?.LocalizedLabels?.[0]?.Label || "";
    const fv = (e, f) => e[`${f}@OData.Community.Display.V1.FormattedValue`] || "";
    const byTypeR = {};
    for (const x of itemsR) (byTypeR[Number(x.type)] ||= []).push(x);
    const packets = (list, n) => { const o = []; for (let i = 0; i < list.length; i += n) o.push(list.slice(i, i + n)); return o; };
    // componenttype → [entity set, id, name, extra $select, extra(e) → { table, detail, … }]
    const REC = {
      20: ["roles", "roleid", "name"],
      24: ["systemforms", "formid", "name", "objecttypecode,type", e => ({ table: e.objecttypecode || "", formType: e.type })],
      26: ["savedqueries", "savedqueryid", "name", "returnedtypecode", e => ({ table: e.returnedtypecode || "" })],
      29: ["workflows", "workflowid", "name", "category,primaryentity,statecode", e => ({ table: e.primaryentity && e.primaryentity !== "none" ? e.primaryentity : "", category: e.category, detail: e.statecode === 1 ? "active" : e.statecode === 0 ? "draft" : "" })],
      31: ["reports", "reportid", "name"],
      36: ["templates", "templateid", "title"],
      44: ["duplicaterules", "duplicateruleid", "name", "baseentityname", e => ({ table: e.baseentityname || "" })],
      45: ["duplicateruleconditions", "duplicateruleconditionid", "baseattributename", "_regardingobjectid_value", e => ({ detail: fv(e, "_regardingobjectid_value") ? `rule ${fv(e, "_regardingobjectid_value")}` : "" })],
      46: ["entitymaps", "entitymapid", "sourceentityname", "targetentityname", e => ({ name: `${e.sourceentityname || "?"} → ${e.targetentityname || "?"}` })],
      47: ["attributemaps", "attributemapid", "sourceattributename", "targetattributename", e => ({ name: `${e.sourceattributename || "?"} → ${e.targetattributename || "?"}` })],
      59: ["savedqueryvisualizations", "savedqueryvisualizationid", "name", "primaryentitytypecode", e => ({ table: e.primaryentitytypecode || "" })],
      61: ["webresourceset", "webresourceid", "name", "displayname", e => ({ detail: e.displayname || "" })],
      62: ["sitemaps", "sitemapid", "sitemapname"],
      63: ["connectionroles", "connectionroleid", "name"],
      65: ["hierarchyrules", "hierarchyruleid", "name"],
      66: ["customcontrols", "customcontrolid", "name"],
      70: ["fieldsecurityprofiles", "fieldsecurityprofileid", "name"],
      71: ["fieldpermissions", "fieldpermissionid", "attributelogicalname", "entityname,_fieldsecurityprofileid_value", e => ({ table: e.entityname || "", detail: fv(e, "_fieldsecurityprofileid_value") ? `profile ${fv(e, "_fieldsecurityprofileid_value")}` : "" })],
      80: ["appmodules", "appmoduleid", "name"],
      90: ["plugintypes", "plugintypeid", "name"],
      91: ["pluginassemblies", "pluginassemblyid", "name"],
      92: ["sdkmessageprocessingsteps", "sdkmessageprocessingstepid", "name", "statecode", e => ({ detail: e.statecode === 1 ? "disabled" : "" })],
      93: ["sdkmessageprocessingstepimages", "sdkmessageprocessingstepimageid", "name", "_sdkmessageprocessingstepid_value", e => ({ detail: fv(e, "_sdkmessageprocessingstepid_value") ? `step ${fv(e, "_sdkmessageprocessingstepid_value")}` : "" })],
      95: ["serviceendpoints", "serviceendpointid", "name"],
      152: ["slas", "slaid", "name"],
      153: ["slaitems", "slaitemid", "name", "_slaid_value", e => ({ detail: fv(e, "_slaid_value") ? `SLA ${fv(e, "_slaid_value")}` : "" })],
      161: ["mobileofflineprofiles", "mobileofflineprofileid", "name"],
      162: ["mobileofflineprofileitems", "mobileofflineprofileitemid", "name", "_regardingobjectid_value", e => ({ detail: fv(e, "_regardingobjectid_value") ? `profile ${fv(e, "_regardingobjectid_value")}` : "" })],
      300: ["canvasapps", "canvasappid", "displayname", "name", e => ({ detail: e.name || "" })],
      380: ["environmentvariabledefinitions", "environmentvariabledefinitionid", "displayname", "schemaname", e => ({ detail: e.schemaname || "" })],
    };
    REC[60] = REC[24];
    const tasks = [];
    for (const [tp, list] of Object.entries(byTypeR)) {
      const t = Number(tp), def = REC[t];
      if (!def) continue;
      const [es, idF, nameF, extraSel, extra] = def;
      for (const pk of packets(list, 25)) {
        tasks.push(async () => {
          const filter = pk.map(x => `${idF} eq ${x.id}`).join(" or ");
          let d;
          try { d = await dvRequest("GET", `${es}?$select=${idF},${nameF}${extraSel ? "," + extraSel : ""}&$filter=${filter}`); }
          catch { try { d = await dvRequest("GET", `${es}?$select=${idF},${nameF}&$filter=${filter}`); } catch { return; } }
          for (const e of d.value || []) {
            const more = extraSel && extra ? extra(e) : {};
            names[keyOf(t, e[idF])] = { name: e[nameF] || "", ...more };
          }
        });
      }
    }
    // tables
    if (byTypeR[1]) for (const pk of packets(byTypeR[1], 25)) tasks.push(async () => {
      try {
        const d = await dvRequest("GET", `EntityDefinitions?$select=MetadataId,LogicalName,DisplayName&$filter=${pk.map(x => `MetadataId eq ${x.id}`).join(" or ")}`);
        for (const e of d.value || []) names[keyOf(1, e.MetadataId)] = { name: label(e.DisplayName) || e.LogicalName, detail: e.LogicalName, table: e.LogicalName };
      } catch { /* unnamed */ }
    });
    // global choices and relationships: the metadata API can't "or" on MetadataId — one full read each
    if (byTypeR[9]) tasks.push(async () => {
      try {
        const want = new Set(byTypeR[9].map(x => x.id.toLowerCase()));
        const d = await dvRequest("GET", "GlobalOptionSetDefinitions?$select=MetadataId,Name");
        for (const e of d.value || []) if (want.has(String(e.MetadataId).toLowerCase())) names[keyOf(9, e.MetadataId)] = { name: e.Name || "" };
      } catch { /* unnamed */ }
    });
    const relItems = [...(byTypeR[10] || []), ...(byTypeR[3] || [])];
    if (relItems.length) tasks.push(async () => {
      try {
        const want = new Map(relItems.map(x => [x.id.toLowerCase(), Number(x.type)]));
        const d = await dvRequest("GET", "RelationshipDefinitions?$select=MetadataId,SchemaName");
        for (const e of d.value || []) { const id = String(e.MetadataId).toLowerCase(); if (want.has(id)) names[keyOf(want.get(id), id)] = { name: e.SchemaName || "" }; }
      } catch { /* unnamed */ }
    });
    // columns (2) and alternate keys (14): read through their parent tables, 10 tables per read
    for (const [t, nav] of [[2, "Attributes"], [14, "Keys"]]) {
      const list = byTypeR[t];
      if (!list) continue;
      const want = new Set(list.map(x => x.id.toLowerCase()));
      const parents = [...new Set(list.map(x => String(x.parentId || "").toLowerCase()).filter(p => GUID_RE.test(p)))];
      const take = (e) => {
        for (const a of e[nav] || []) {
          const id = String(a.MetadataId).toLowerCase();
          if (want.has(id)) names[keyOf(t, id)] = { name: label(a.DisplayName) || a.LogicalName, detail: a.LogicalName, table: e.LogicalName };
        }
      };
      const sel = `$select=MetadataId,LogicalName&$expand=${nav}($select=MetadataId,LogicalName,DisplayName)`;
      for (const pk of packets(parents, 10)) tasks.push(async () => {
        try {
          const d = await dvRequest("GET", `EntityDefinitions?${sel}&$filter=${pk.map(p => `MetadataId eq ${p}`).join(" or ")}`);
          (d.value || []).forEach(take);
        } catch {
          for (const p of pk) { try { take(await dvRequest("GET", `EntityDefinitions(${p})?${sel}`)); } catch { /* unnamed */ } }
        }
      });
    }
    // four reads at a time — a big dependency list must not burst the org's request quota
    let ti = 0;
    await Promise.all(Array.from({ length: Math.min(4, tasks.length) }, async () => { while (ti < tasks.length) await tasks[ti++](); }));
    result = names;
    return result;
  },
  async exportTranslations(params) {
    let result;
    // Official whole-solution translation export (the CrmTranslations.xml zip) — covers
    // form tabs/sections/labels, views, charts, dashboards, sitemap, option sets and
    // custom ribbon LocLabels. ExportTranslation is BOUND to the solutions COLLECTION.
    const sName = String(params.solutionName || "");
    if (!/^[A-Za-z0-9_]+$/.test(sName)) throw new Error("Invalid solution unique name");
    const dT = await dvRequest("POST", "solutions/Microsoft.Dynamics.CRM.ExportTranslation", { SolutionName: sName });
    result = { fileB64: dT?.ExportTranslationFile || "" };
    return result;
  },
  async importTranslations(params) {
    let result;
    // Unbound ImportTranslation: TranslationFile = base64 zip, ImportJobId = caller-supplied
    // GUID that materializes in the importjob table (progress trackable there).
    const b64T = String(params.fileB64 || "");
    if (!b64T || !/^[A-Za-z0-9+/=]+$/.test(b64T)) throw new Error("Invalid translation file (expected base64 zip)");
    validateGuid(params.importJobId);
    await dvRequest("POST", "ImportTranslation", { TranslationFile: b64T, ImportJobId: params.importJobId });
    result = { ok: true, importJobId: params.importJobId };
    return result;
  },
  async publishAll(params) {
    let result;
    // PublishAllXml — required after a translation import for the labels to show up.
    await dvRequest("POST", "PublishAllXml", {});
    result = { ok: true };
    return result;
  },
  async getOrgLanguages(params) {
    let result;
    const data = await dvRequest("GET", "RetrieveAvailableLanguages");
    // Full set of Dataverse-provisionable MUI languages (LCID → name). Anything outside
    // this list still falls back to "LCID <code>" rather than crashing. Note the easy
    // confusions: 1046 Portuguese (Brazil) vs 2070 Portuguese (Portugal); 3082 Spanish
    // (modern) vs 1034 Spanish (legacy sort); 2052 Chinese (Simplified) vs 1028 (Traditional).
    const LANG_NAMES = {1025:"Arabic",1026:"Bulgarian",1027:"Catalan",1028:"Chinese (Traditional)",1029:"Czech",1030:"Danish",1031:"German",1032:"Greek",1033:"English",1034:"Spanish (legacy)",1035:"Finnish",1036:"French",1037:"Hebrew",1038:"Hungarian",1040:"Italian",1041:"Japanese",1042:"Korean",1043:"Dutch",1044:"Norwegian",1045:"Polish",1046:"Portuguese (Brazil)",1048:"Romanian",1049:"Russian",1050:"Croatian",1051:"Slovak",1053:"Swedish",1054:"Thai",1055:"Turkish",1057:"Indonesian",1058:"Ukrainian",1060:"Slovenian",1061:"Estonian",1062:"Latvian",1063:"Lithuanian",1066:"Vietnamese",1069:"Basque",1081:"Hindi",1086:"Malay",1087:"Kazakh",1110:"Galician",2052:"Chinese (Simplified)",2070:"Portuguese (Portugal)",3076:"Chinese (Hong Kong)",3082:"Spanish"};
    const codes = data?.LocaleIds || [];
    result = codes.map(c => ({ code: c, name: LANG_NAMES[c] || `LCID ${c}` }));
    return result;
  },
  async getAttributeLabels(params) {
    let result;
    validateName(params.logicalName, 'logicalName');
    const data = await dvRequest("GET",
      `EntityDefinitions(LogicalName='${params.logicalName}')/Attributes?$select=LogicalName,AttributeType,DisplayName,Description,IsRenameable,IsCustomizable`
    );
    result = (data.value || []).map(a => ({
      logical: a.LogicalName,
      type: a.AttributeType,
      labels: (a.DisplayName?.LocalizedLabels || []).map(l => ({ label: l.Label, languageCode: l.LanguageCode })),
      descriptions: (a.Description?.LocalizedLabels || []).map(l => ({ label: l.Label, languageCode: l.LanguageCode })),
      canRename: a.IsRenameable?.Value !== false,
      canCustomize: a.IsCustomizable?.Value !== false,
    }));
    return result;
  },
  async updateAttributeLabel(params) {
    let result;
    validateName(params.entityName, 'entityName');
    validateName(params.attributeName, 'attributeName');
    // Step 1: Get attribute type to determine the OData cast
    const attrTypeMeta = await dvRequest("GET",
      `EntityDefinitions(LogicalName='${params.entityName}')/Attributes(LogicalName='${params.attributeName}')?$select=AttributeType`
    );
    const aType = attrTypeMeta?.AttributeType || "String";
    const CAST_MAP = {
      "String":"StringAttributeMetadata","Memo":"MemoAttributeMetadata",
      "Integer":"IntegerAttributeMetadata","BigInt":"BigIntAttributeMetadata",
      "Double":"DoubleAttributeMetadata","Decimal":"DecimalAttributeMetadata",
      "Money":"MoneyAttributeMetadata","Boolean":"BooleanAttributeMetadata",
      "DateTime":"DateTimeAttributeMetadata","Lookup":"LookupAttributeMetadata",
      "Customer":"LookupAttributeMetadata","Owner":"LookupAttributeMetadata",
      "Picklist":"PicklistAttributeMetadata","State":"StateAttributeMetadata",
      "Status":"StatusAttributeMetadata","Uniqueidentifier":"UniqueIdentifierAttributeMetadata",
      "EntityName":"EntityNameAttributeMetadata",
      "MultiSelectPicklist":"MultiSelectPicklistAttributeMetadata",
      "Image":"ImageAttributeMetadata","File":"FileAttributeMetadata",
    };
    const cast = CAST_MAP[aType] || null;
    // Step 2: GET the full attribute metadata with typed cast
    const castSegment = cast ? `/Microsoft.Dynamics.CRM.${cast}` : "";
    const fullAttr = await dvRequest("GET",
      `EntityDefinitions(LogicalName='${params.entityName}')/Attributes(LogicalName='${params.attributeName}')${castSegment}`
    );
    if (!fullAttr) throw new Error("Could not retrieve attribute metadata");
    // Step 3: Update DisplayName.LocalizedLabels in the full object
    if (!fullAttr.DisplayName) fullAttr.DisplayName = { LocalizedLabels: [] };
    const existingLabels = fullAttr.DisplayName.LocalizedLabels || [];
    params.localizedLabels.forEach(newL => {
      const idx = existingLabels.findIndex(l => l.LanguageCode === newL.LanguageCode);
      if (idx >= 0) existingLabels[idx].Label = newL.Label;
      else existingLabels.push({ Label: newL.Label, LanguageCode: newL.LanguageCode });
    });
    fullAttr.DisplayName.LocalizedLabels = existingLabels;
    // Step 4: PUT the entire attribute back with MSCRM.MergeLabels header
    // through dvRequest like every other write (pacing, 429 retry, timeout, API meter) — a raw
    // fetch here surfaced throttles as failed rows and could hang (audit finding)
    await dvRequest("PUT", `EntityDefinitions(LogicalName='${params.entityName}')/Attributes(LogicalName='${params.attributeName}')${castSegment}`, fullAttr, { "MSCRM.MergeLabels": "true", "X-Colvio-Long": "1" });
    result = { ok: true };
    return result;
  },
  async getPublishingTargets(params) {
    let result;
    // The unmanaged solutions a new column can go in, each with its publisher's prefixes,
    // and the org's base language (labels are written in it).
    const dPt = await dvRequest("GET", "solutions?$select=uniquename,friendlyname&$filter=ismanaged eq false and isvisible eq true&$expand=publisherid($select=customizationprefix,customizationoptionvalueprefix,friendlyname)&$orderby=friendlyname asc", null, NO_ANN);
    let langPt = 1033;
    try { const o = await dvRequest("GET", "organizations?$select=languagecode&$top=1", null, NO_ANN); langPt = o.value?.[0]?.languagecode || 1033; } catch { /* default English */ }
    result = {
      languageCode: langPt,
      solutions: (dPt.value || []).map(s => ({ uniqueName: s.uniquename, name: s.friendlyname || s.uniquename, prefix: s.publisherid?.customizationprefix || "", valuePrefix: s.publisherid?.customizationoptionvalueprefix ?? 10000, publisher: s.publisherid?.friendlyname || "" })).filter(s => s.prefix),
    };
    return result;
  },
  async createColumn(params) {
    let result;
    // ONE new column (or the one-to-many relationship that carries a lookup) from a body the
    // panel's pure columnSpec.js built — only Dataverse's own metadata types pass, the schema
    // name is checked, and the column lands in the chosen unmanaged solution.
    validateName(params.entity, "entity");
    const bodyC = params.body || {};
    const OK_TYPES = new Set(["String", "Memo", "Integer", "BigInt", "Decimal", "Double", "Money", "Boolean", "DateTime", "Picklist", "MultiSelectPicklist"].map(t => `Microsoft.Dynamics.CRM.${t}AttributeMetadata`));
    let pathC;
    if (params.kind === "attribute") {
      if (!OK_TYPES.has(bodyC["@odata.type"])) throw new Error("Unexpected column type.");
      if (!/^[a-z][a-z0-9]*_[A-Za-z0-9_]{1,48}$/.test(String(bodyC.SchemaName || ""))) throw new Error("Invalid schema name.");
      pathC = `EntityDefinitions(LogicalName='${params.entity}')/Attributes`;
    } else if (params.kind === "relationship") {
      if (bodyC["@odata.type"] !== "Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata") throw new Error("Unexpected relationship type.");
      validateName(bodyC.ReferencedEntity, "ReferencedEntity");
      if (bodyC.ReferencingEntity !== params.entity) throw new Error("The relationship doesn't point at this table.");
      if (!/^[a-z][a-z0-9]*_[A-Za-z0-9_]{1,48}$/.test(String(bodyC.Lookup?.SchemaName || ""))) throw new Error("Invalid lookup schema name.");
      pathC = "RelationshipDefinitions";
    } else throw new Error("Unknown kind.");
    const hC = {};
    if (params.solution && params.solution !== "Default") { validateName(params.solution, "solution"); hC["MSCRM.SolutionUniqueName"] = params.solution; }
    await dvRequest("POST", pathC, bodyC, hC);
    result = { ok: true };
    return result;
  },
  async getOptionSetInfo(params) {
    let result;
    // A choice column's option set, for editing: local or global (and its name), managed /
    // customizable, its options, and the org's base language (new labels are written in it).
    validateName(params.entityName, "entityName");
    validateName(params.fieldName, "fieldName");
    const dO = await dvRequest("GET", `EntityDefinitions(LogicalName='${params.entityName}')/Attributes(LogicalName='${params.fieldName}')/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$select=LogicalName&$expand=OptionSet($select=Name,IsGlobal,IsManaged,IsCustomizable,Options),GlobalOptionSet($select=Name,IsGlobal,IsManaged,IsCustomizable,Options)`);
    // OptionSet carries the options (local or global); GlobalOptionSet when only it does
    const srcO = (dO.OptionSet && (dO.OptionSet.Options || []).length) ? dO.OptionSet : (dO.GlobalOptionSet || dO.OptionSet || {});
    let langO = 1033;
    try { const o = await dvRequest("GET", "organizations?$select=languagecode&$top=1", null, NO_ANN); langO = o.value?.[0]?.languagecode || 1033; } catch { /* default English */ }
    result = {
      isGlobal: !!srcO.IsGlobal, name: srcO.Name || "", managed: !!srcO.IsManaged,
      customizable: srcO.IsCustomizable?.Value !== false, languageCode: langO,
      options: (srcO.Options || []).map(o => ({ value: o.Value, label: o.Label?.UserLocalizedLabel?.Label || o.Label?.LocalizedLabels?.[0]?.Label || `Value ${o.Value}`, color: o.Color || null })),
    };
    return result;
  },
  async optionSetChange(params) {
    let result;
    // ONE change to a choice's options through Dataverse's own actions — the body is built
    // by the panel's pure optionSetEdit.js and only its known parameters pass.
    const fnO = { insert: "InsertOptionValue", update: "UpdateOptionValue", delete: "DeleteOptionValue", order: "OrderOption" }[params.op];
    if (!fnO) throw new Error("Unknown option change.");
    const bO = params.body || {};
    const okKeys = new Set(["OptionSetName", "EntityLogicalName", "AttributeLogicalName", "Value", "Label", "MergeLabels", "Values", "SolutionUniqueName"]);
    for (const k of Object.keys(bO)) if (!okKeys.has(k)) throw new Error(`Unexpected parameter ${k}.`);
    for (const k of ["OptionSetName", "EntityLogicalName", "AttributeLogicalName"]) if (bO[k] != null) validateName(bO[k], k);
    if (!bO.OptionSetName && !(bO.EntityLogicalName && bO.AttributeLogicalName)) throw new Error("No choice targeted.");
    const rO = (await dvRequest("POST", fnO, bO)) || {};
    result = { ...rO, ok: true, NewOptionValue: rO.NewOptionValue ?? rO.NewOption ?? null }; // InsertOptionValueResponse names it NewOption
    return result;
  },
  async publishOptionSet(params) {
    let result;
    validateName(params.name, "name");
    result = await dvRequest("POST", "PublishXml", {
      ParameterXml: `<importexportxml><optionsets><optionset>${params.name}</optionset></optionsets></importexportxml>`
    });
    return result;
  },
  async publishEntity(params) {
    let result;
    validateName(params.logicalName, 'logicalName');
    result = await dvRequest("POST", "PublishXml", {
      ParameterXml: `<importexportxml><entities><entity>${params.logicalName}</entity></entities></importexportxml>`
    });
    return result;
  },
  async getManyToManyRelationships(params) {
    let result;
    validateName(params.logicalName, 'logicalName');
    const data = await dvRequest("GET",
      `EntityDefinitions(LogicalName='${params.logicalName}')/ManyToManyRelationships`
    );
    result = (data.value || []).map(r => ({
      schemaName: r.SchemaName,
      entity1: r.Entity1LogicalName,
      entity2: r.Entity2LogicalName,
      intersectEntity: r.IntersectEntityName,
    }));
    return result;
  },
  async getEntityMetadata(params) {
    let result;
    validateName(params.logicalName, 'logicalName');
    // Only simple, universally-selectable EntityMetadata properties here. The managed
    // property CanBeDeleted is NOT $select-able on every org/API version ("Could not find
    // a property named 'CanBeDeleted'"), so it must never be in the core query.
    const meta = await dvRequest("GET",
      `EntityDefinitions(LogicalName='${params.logicalName}')?$select=DisplayName,PrimaryNameAttribute,PrimaryIdAttribute,EntitySetName,ObjectTypeCode`
    );
    let canBeDeleted = true;
    if (params.withCanDelete) {
      // Best-effort, opt-in (bulk delete pre-check). A failure must not break the call —
      // default to allowed; the server enforces the real CanBeDeleted on the delete itself.
      try {
        const m2 = await dvRequest("GET", `EntityDefinitions(LogicalName='${params.logicalName}')?$select=CanBeDeleted`);
        canBeDeleted = m2?.CanBeDeleted?.Value ?? true;
      } catch { /* property unavailable — leave canBeDeleted=true */ }
    }
    result = {
      canBeDeleted,
      displayName: meta?.DisplayName?.UserLocalizedLabel?.Label || params.logicalName,
      primaryName: meta?.PrimaryNameAttribute || "name",
      primaryId: meta?.PrimaryIdAttribute || params.logicalName + "id",
      entitySet: meta?.EntitySetName || params.logicalName + "s",
      objectTypeCode: meta?.ObjectTypeCode ?? null,
    };
    return result;
  },
};
export default ACTIONS;
