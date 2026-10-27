// Content script › apps. Apps and solutions — model-driven apps, forms, views, environment variables, solutions and their components, web resources.
// One async function per action; `params` is what the panel sent. Every request goes through
// core.js (dvRequest: host lock, pacing, timeouts, 429 back-off).
import { NO_ANN, dvRequest, validateGuid } from "../core.js";

const ACTIONS = {
  async getAppModules(params) {
    let result;
    // Model-driven apps. Components reference apps via appmoduleidUNIQUE — appactions via
    // appmoduleid — so both ids travel (the classic join trap).
    const rowsA = [];
    let urlA = `appmodules?$select=appmoduleid,appmoduleidunique,name,uniquename,description`;
    while (urlA) {
      const dA = await dvRequest("GET", urlA, null, { Prefer: "odata.maxpagesize=5000" });
      (dA.value || []).forEach(a => rowsA.push({ id: a.appmoduleid, uid: a.appmoduleidunique, name: a.name || "", uniqueName: a.uniquename || "", description: a.description || "" }));
      const nl = dA["@odata.nextLink"]; urlA = nl ? nl.replace(/^.*\/api\/data\/v[\d.]+\//, "") : null;
    }
    result = rowsA;
    return result;
  },
  async getAppComponents(params) {
    let result;
    // App Module Components, Tables/Views/Forms only. CRITICAL QUIRK (why the inventory
    // logic exists at all): "include all forms/views" does NOT materialize components —
    // include-all is INFERRED from the absence of explicit form/view components for a
    // registered table. No flag exposes it.
    const rowsC = [];
    let urlC = `appmodulecomponents?$filter=componenttype eq 1 or componenttype eq 26 or componenttype eq 60&$select=objectid,componenttype,_appmoduleidunique_value`;
    while (urlC) {
      const dC = await dvRequest("GET", urlC, null, { Prefer: "odata.maxpagesize=5000" });
      (dC.value || []).forEach(c => rowsC.push({ objectId: c.objectid, componentType: c.componenttype, appUid: c._appmoduleidunique_value }));
      const nl = dC["@odata.nextLink"]; urlC = nl ? nl.replace(/^.*\/api\/data\/v[\d.]+\//, "") : null;
    }
    result = rowsC;
    return result;
  },
  async getAllForms(params) {
    let result;
    const rowsF = [];
    // active forms of the types an app can include (main, quick view, quick create, card,
    // main interactive) — inactive and dashboard/mobile-express forms were listed as
    // "exposed by the app" (audit finding)
    let urlF = `systemforms?$select=formid,name,objecttypecode,type,formactivationstate&$filter=formactivationstate eq 1 and (type eq 2 or type eq 6 or type eq 7 or type eq 11 or type eq 12)`;
    while (urlF) {
      const dF = await dvRequest("GET", urlF, null, { Prefer: "odata.maxpagesize=5000" });
      (dF.value || []).forEach(f => rowsF.push({ id: f.formid, name: f.name || "", entity: f.objecttypecode || "", type: f.type, typeLabel: f["type@OData.Community.Display.V1.FormattedValue"] || "" }));
      const nl = dF["@odata.nextLink"]; urlF = nl ? nl.replace(/^.*\/api\/data\/v[\d.]+\//, "") : null;
    }
    result = rowsF;
    return result;
  },
  async getAllViews(params) {
    let result;
    const rowsV = [];
    // public, active views only (querytype 0): lookup, quick-find, associated and
    // inactive views were counted as components the app exposes (audit finding)
    let urlV = `savedqueries?$select=savedqueryid,name,returnedtypecode,querytype,statecode&$filter=querytype eq 0 and statecode eq 0`;
    while (urlV) {
      const dV = await dvRequest("GET", urlV, null, { Prefer: "odata.maxpagesize=5000" });
      (dV.value || []).forEach(v => rowsV.push({ id: v.savedqueryid, name: v.name || "", entity: v.returnedtypecode || "" }));
      const nl = dV["@odata.nextLink"]; urlV = nl ? nl.replace(/^.*\/api\/data\/v[\d.]+\//, "") : null;
    }
    result = rowsV;
    return result;
  },
  async getAppActions(params) {
    let result;
    // Modern command-bar buttons. Three scopes: app-specific (_appmoduleid_value set),
    // entity-global (context entity set, no app), table-generic templates (neither — New/
    // Save/Export surface everywhere). Classic RibbonDiffXml buttons are NOT appactions.
    // Older orgs may not expose the table at all → empty list, module degrades gracefully.
    const rowsAc = [];
    try {
      let urlAc = `appactions?$filter=statecode eq 0&$select=appactionid,name,buttonlabeltext,contextvalue,_appmoduleid_value`;
      while (urlAc) {
        const dAc = await dvRequest("GET", urlAc, null, { Prefer: "odata.maxpagesize=5000" });
        (dAc.value || []).forEach(a => rowsAc.push({ id: a.appactionid, name: a.name || "", label: a.buttonlabeltext || a.name || "", contextValue: a.contextvalue || "", appId: a._appmoduleid_value || "" }));
        const nl = dAc["@odata.nextLink"]; urlAc = nl ? nl.replace(/^.*\/api\/data\/v[\d.]+\//, "") : null;
      }
    } catch (eAc) {
      // Only "table doesn't exist" (older org) means an honest empty list — a throttle or
      // network failure mid-pagination must SURFACE, not render as "this app has no
      // modern commands" (audit finding).
      const mAc = eAc?.message || "";
      if (!/not exist|not found|404|Could not find/i.test(mAc)) throw eAc;
    }
    result = rowsAc;
    return result;
  },
  async getFormViewDependencies(params) {
    let result;
    // The dependency graph edges whose DEPENDENT is a Form (60) or View (26) and whose
    // REQUIRED side is an attribute (2) / option set (9) / relationship (10) — how those
    // reach an app: never as App Module Components, only because a form/view references
    // them. Only the edges the app inventory uses are read (the server filters), all of
    // them, page by page — no cap (a truncated graph would show wrong counts).
    const rowsD = [];
    let urlD = `dependencies?$filter=(dependentcomponenttype eq 60 or dependentcomponenttype eq 26) and (requiredcomponenttype eq 2 or requiredcomponenttype eq 9 or requiredcomponenttype eq 10)&$select=requiredcomponentobjectid,requiredcomponenttype,dependentcomponentobjectid,dependentcomponenttype`;
    while (urlD) {
      const dD = await dvRequest("GET", urlD, null, { Prefer: "odata.maxpagesize=5000", ...NO_ANN });
      (dD.value || []).forEach(e => rowsD.push({ requiredId: e.requiredcomponentobjectid, requiredType: e.requiredcomponenttype, dependentId: e.dependentcomponentobjectid, dependentType: e.dependentcomponenttype }));
      const nl = dD["@odata.nextLink"]; urlD = nl ? nl.replace(/^.*\/api\/data\/v[\d.]+\//, "") : null;
    }
    result = { edges: rowsD, truncated: false };
    return result;
  },
  async getViewDetail(params) {
    let result;
    // A system view's full definition: fetchxml = the FILTERS (why a row is excluded),
    // layoutxml = the COLUMNS shown. Personal views live in userquery, not savedquery —
    // a subgrid pointing at one 404s here and the UI says so honestly.
    validateGuid(params.viewId);
    const dVd = await dvRequest("GET", `savedqueries(${params.viewId})?$select=savedqueryid,name,returnedtypecode,fetchxml,layoutxml`);
    result = { id: dVd.savedqueryid, name: dVd.name || "", entity: dVd.returnedtypecode || "", fetchxml: dVd.fetchxml || "", layoutxml: dVd.layoutxml || "" };
    return result;
  },
  async getFormXml(params) {
    let result;
    // Raw form definition — parsed client-side to list the SUBGRID controls (which child
    // view each one renders, through which relationship, view picker on or off).
    validateGuid(params.formId);
    const dFx = await dvRequest("GET", `systemforms(${params.formId})?$select=formid,name,formxml`);
    result = { id: dFx.formid, name: dFx.name || "", formxml: dFx.formxml || "" };
    return result;
  },
  async getEnvVars(params) {
    let result;
    // Environment variables = definition (with the DEFAULT value) + optional value row
    // (the per-environment OVERRIDE). The classic post-deployment trap is a definition
    // with NEITHER — surfaced prominently by the UI. Secret (100000005) values are Key
    // Vault REFERENCES, never the secret itself.
    const defs = [];
    let urlEv = `environmentvariabledefinitions?$select=environmentvariabledefinitionid,schemaname,displayname,defaultvalue,type,ismanaged,description&$orderby=displayname asc`;
    while (urlEv) {
      const d = await dvRequest("GET", urlEv, null, { Prefer: "odata.maxpagesize=5000" });
      (d.value || []).forEach(v => defs.push({
        id: v.environmentvariabledefinitionid,
        schemaName: v.schemaname || "",
        displayName: v.displayname || v.schemaname || "",
        type: v.type ?? 100000000,
        typeLabel: v["type@OData.Community.Display.V1.FormattedValue"] || "",
        defaultValue: v.defaultvalue ?? null,
        isManaged: !!v.ismanaged,
        description: v.description || "",
        valueId: null, value: null,
      }));
      const nl = d["@odata.nextLink"]; urlEv = nl ? nl.replace(/^.*\/api\/data\/v[\d.]+\//, "") : null;
    }
    const byDef = new Map(defs.map(x => [x.id, x]));
    let urlVv = `environmentvariablevalues?$select=environmentvariablevalueid,value,_environmentvariabledefinitionid_value`;
    while (urlVv) {
      const d = await dvRequest("GET", urlVv, null, { Prefer: "odata.maxpagesize=5000" });
      (d.value || []).forEach(v => {
        const def = byDef.get(v._environmentvariabledefinitionid_value);
        if (def) { def.valueId = v.environmentvariablevalueid; def.value = v.value ?? null; }
      });
      const nl = d["@odata.nextLink"]; urlVv = nl ? nl.replace(/^.*\/api\/data\/v[\d.]+\//, "") : null;
    }
    result = defs;
    return result;
  },
  async setEnvVarValue(params) {
    let result;
    // Update the per-environment override — PATCH the existing value row, or POST a new
    // one bound to the definition. Server enforces customizer rights; unmanaged-layer
    // consequences are the caller's concern (warned in UI on managed definitions).
    validateGuid(params.definitionId);
    if (params.valueId) {
      validateGuid(params.valueId);
      await dvRequest("PATCH", `environmentvariablevalues(${params.valueId})`, { value: String(params.value ?? "") });
      result = { valueId: params.valueId };
    } else {
      const created = await dvRequest("POST", "environmentvariablevalues", {
        value: String(params.value ?? ""),
        "environmentvariabledefinitionid@odata.bind": `/environmentvariabledefinitions(${params.definitionId})`,
      }, { Prefer: "return=representation" });
      result = { valueId: created?.environmentvariablevalueid || null };
    }
    return result;
  },
  async deleteEnvVarValue(params) {
    let result;
    // Remove the override → the variable falls back to its definition default.
    validateGuid(params.valueId);
    await dvRequest("DELETE", `environmentvariablevalues(${params.valueId})`);
    result = { ok: true };
    return result;
  },
  async getSolutions(params) {
    let result;
    const data = await dvRequest("GET",
      "solutions?$select=solutionid,uniquename,friendlyname,version,ismanaged,installedon,description&$filter=isvisible eq true&$orderby=friendlyname asc"
    );
    result = (data.value || []).map(s => ({
      id: s.solutionid,
      uniqueName: s.uniquename,
      displayName: s.friendlyname || s.uniquename,
      version: s.version,
      isManaged: s.ismanaged,
      installedOn: s.installedon,
      description: s.description || "",
    }));
    return result;
  },
  async getSolutionComponentCount(params) {
    let result;
    // The badge of the solution list — ONE request per solution ($count annotation, honest
    // below 5,000; `capped` says the real number is at least that) instead of paging every
    // component and resolving its name just to paint a number (audit finding).
    validateGuid(params.solutionId);
    const dCnt = await dvRequest("GET", `solutioncomponents?$select=solutioncomponentid&$top=1&$count=true&$filter=_solutionid_value eq ${params.solutionId}`, null, NO_ANN);
    const cnt = dCnt["@odata.count"] != null ? dCnt["@odata.count"] : (dCnt.value || []).length;
    result = { count: cnt, capped: cnt >= 5000 };
    return result;
  },
  async getSolutionComponents(params) {
    let result;
    validateGuid(params.solutionId);
    const data = await dvRequest("GET",
      `solutioncomponents?$select=solutioncomponentid,componenttype,objectid,rootcomponentbehavior&$filter=_solutionid_value eq ${params.solutionId}`,
      null, { Prefer: "odata.maxpagesize=5000" }
    );
    // every component, page by page — `$top=5000` used to cut a big solution silently
    const rawComps = [...(data.value || [])];
    let urlSc = data["@odata.nextLink"] ? data["@odata.nextLink"].replace(/^.*\/api\/data\/v[\d.]+\//, "") : null;
    while (urlSc) {
      const dSc = await dvRequest("GET", urlSc, null, { Prefer: "odata.maxpagesize=5000" });
      rawComps.push(...(dSc.value || []));
      urlSc = dSc["@odata.nextLink"] ? dSc["@odata.nextLink"].replace(/^.*\/api\/data\/v[\d.]+\//, "") : null;
    }
    const comps = rawComps.map(c => ({
      id: c.solutioncomponentid,
      type: c.componenttype,
      objectId: c.objectid,
      behavior: c.rootcomponentbehavior,
      name: null,
    }));

    // Batch-resolve display names per component type. Metadata-backed types (Entity,
    // OptionSet, Relationship) use the metadata API; everything else is a plain record
    // resolved by id against its owning table. componenttype codes follow Microsoft's
    // solutioncomponent enumeration — getting them wrong points at the wrong table and the
    // name silently falls back to the GUID, which is exactly what used to happen for Web
    // Resources (61), Roles (20), App modules (80), etc.
    const recResolver = (es, idF, nameF) => ids =>
      dvRequest("GET", `${es}?$select=${idF},${nameF}&$filter=${ids.map(id=>`${idF} eq ${id}`).join(" or ")}`).then(d => {
        const m = {}; (d.value||[]).forEach(e => { const k = String(e[idF]||"").toLowerCase(); if (k) m[k] = e[nameF] || ""; }); return m;
      });
    // componenttype → [entitySet, idField, nameField]
    const REC = {
      20:["roles","roleid","name"], 24:["systemforms","formid","name"],
      26:["savedqueries","savedqueryid","name"], 29:["workflows","workflowid","name"],
      31:["reports","reportid","name"], 36:["templates","templateid","title"],
      37:["contracttemplates","contracttemplateid","name"], 39:["mailmergetemplates","mailmergetemplateid","name"],
      44:["duplicaterules","duplicateruleid","name"], 59:["savedqueryvisualizations","savedqueryvisualizationid","name"],
      60:["systemforms","formid","name"], 61:["webresourceset","webresourceid","name"],
      62:["sitemaps","sitemapid","sitemapname"], 63:["connectionroles","connectionroleid","name"],
      65:["hierarchyrules","hierarchyruleid","name"], 70:["fieldsecurityprofiles","fieldsecurityprofileid","name"],
      80:["appmodules","appmoduleid","name"], 90:["plugintypes","plugintypeid","name"],
      91:["pluginassemblies","pluginassemblyid","name"], 92:["sdkmessageprocessingsteps","sdkmessageprocessingstepid","name"],
      95:["serviceendpoints","serviceendpointid","name"], 152:["slas","slaid","name"],
      161:["mobileofflineprofiles","mobileofflineprofileid","name"], 300:["canvasapps","canvasappid","name"],
      371:["connectors","connectorid","name"], 380:["environmentvariabledefinitions","environmentvariabledefinitionid","displayname"],
    };
    const resolvers = {
      1:  ids => dvRequest("GET", `EntityDefinitions?$select=MetadataId,DisplayName,LogicalName&$filter=${ids.map(id=>`MetadataId eq ${id}`).join(" or ")}`).then(d => {
        const m = {}; (d.value||[]).forEach(e => { m[e.MetadataId.toLowerCase()] = e.DisplayName?.UserLocalizedLabel?.Label || e.LogicalName; }); return m;
      }),
      9:  ids => dvRequest("GET", `GlobalOptionSetDefinitions?$select=MetadataId,Name`).then(d => {
        const m = {}; (d.value||[]).forEach(e => { if(ids.includes(e.MetadataId.toLowerCase())) m[e.MetadataId.toLowerCase()] = e.Name; }); return m;
      }),
      10: ids => dvRequest("GET", `RelationshipDefinitions?$select=MetadataId,SchemaName`).then(d => {
        const m = {}; (d.value||[]).forEach(e => { if(ids.includes(e.MetadataId.toLowerCase())) m[e.MetadataId.toLowerCase()] = e.SchemaName; }); return m;
      }),
    };
    for (const [tp, def] of Object.entries(REC)) resolvers[tp] = recResolver(def[0], def[1], def[2]);

    // Group objectIds by type and resolve in parallel
    const byType = {};
    comps.forEach(c => {
      if (!resolvers[c.type] || !c.objectId) return;
      if (!byType[c.type]) byType[c.type] = [];
      byType[c.type].push(c.objectId.toLowerCase());
    });

    const nameMap = {};
    await Promise.all(Object.entries(byType).map(async ([type, ids]) => {
      try {
        // Split into batches of 15 to avoid URL too long
        // Types 9 (OptionSet) & 10 (Relationship) hit the metadata API, which can't filter
        // by `or` on MetadataId — they fetch the full set once and filter client-side.
        if (String(type) === "9" || String(type) === "10") {
          const map = await resolvers[type](ids);
          Object.assign(nameMap, map);
          return;
        }
        for (let i = 0; i < ids.length; i += 15) {
          const batch = ids.slice(i, i + 15);
          const map = await resolvers[type](batch);
          Object.assign(nameMap, map);
        }
      } catch {}
    }));

    // Resolve Attribute names (type 2) — needs entity context
    const entityIds = comps.filter(c => c.type === 1 && c.objectId).map(c => c.objectId);
    const attrIds = new Set(comps.filter(c => c.type === 2 && c.objectId).map(c => c.objectId.toLowerCase()));
    if (attrIds.size > 0 && entityIds.length > 0) {
      try {
        // 4 at a time — one request per table of the solution, all at once, burst past the
        // service-protection quota on Microsoft managed solutions (300+ tables; audit finding)
        let nextEnt = 0;
        const entWorker = async () => { while (nextEnt < entityIds.length) {
          const entId = entityIds[nextEnt++];
          try {
            const d = await dvRequest("GET", `EntityDefinitions(${entId})/Attributes?$select=MetadataId,LogicalName,DisplayName`);
            (d.value || []).forEach(a => {
              const mid = a.MetadataId?.toLowerCase();
              if (mid && attrIds.has(mid)) {
                nameMap[mid] = a.DisplayName?.UserLocalizedLabel?.Label || a.LogicalName;
              }
            });
          } catch {}
        } };
        await Promise.all(Array.from({ length: Math.min(4, entityIds.length) }, () => entWorker()));
      } catch {}
    }

    // Apply resolved names
    comps.forEach(c => {
      const key = c.objectId?.toLowerCase();
      if (key && nameMap[key]) c.name = nameMap[key];
    });

    result = comps;
    return result;
  },
  async getWebResources(params) {
    let result;
    // Every web resource of the org (name, kind, managed, hidden, when) — paged, no content.
    const rowsW = [];
    const selW = "webresourceid,name,displayname,webresourcetype,ismanaged,modifiedon,_modifiedby_value";
    let urlW = `webresourceset?$select=${selW},ishidden,iscustomizable&$orderby=name asc`;
    let withMp = true;
    while (urlW) {
      let dW;
      try { dW = await dvRequest("GET", urlW, null, { Prefer: "odata.maxpagesize=5000" }); }
      catch (e) { if (withMp && !rowsW.length && /ishidden|iscustomizable/i.test(e.message || "")) { withMp = false; urlW = `webresourceset?$select=${selW}&$orderby=name asc`; continue; } throw e; }
      for (const r of dW.value || []) rowsW.push({
        id: r.webresourceid, name: r.name || "", displayName: r.displayname || "", type: r.webresourcetype, managed: !!r.ismanaged,
        hidden: r.ishidden?.Value ?? r.ishidden ?? false, customizable: r.iscustomizable?.Value ?? r.iscustomizable ?? true,
        modifiedOn: r.modifiedon || "", modifiedBy: r["_modifiedby_value@OData.Community.Display.V1.FormattedValue"] || "",
      });
      const nlW = dW["@odata.nextLink"]; urlW = nlW ? nlW.replace(/^.*\/api\/data\/v[\d.]+\//, "") : null;
    }
    result = rowsW;
    return result;
  },
  async getWebResourceContents(params) {
    let result;
    // The content (base64) of a packet of web resources, in one read — the editor opens one,
    // the content search reads text resources 25 at a time with progress.
    const idsW = [...new Set((params.ids || []).map(String))];
    idsW.forEach(validateGuid);
    if (!idsW.length) { result = []; return result; }
    const dC = await dvRequest("GET", `webresourceset?$select=webresourceid,name,webresourcetype,content,description,modifiedon,ismanaged&$filter=${idsW.map(id => `webresourceid eq ${id}`).join(" or ")}`, null, NO_ANN);
    // etag: the version opened — a save is conditional on it (updateWebResource)
    result = (dC.value || []).map(r => ({ id: r.webresourceid, name: r.name || "", type: r.webresourcetype, content: r.content || "", description: r.description || "", modifiedOn: r.modifiedon || "", managed: !!r.ismanaged, etag: r["@odata.etag"] || "" }));
    return result;
  },
  async updateWebResource(params) {
    let result;
    // New content (base64) for one web resource, nothing else changes. With the ETag of the
    // version the editor opened (params.etag) the PATCH is CONDITIONAL — If-Match — and
    // Dataverse itself refuses it (412) when the resource changed on the server since: atomic,
    // no read-then-write window. No ETag = overwrite (If-Match: *). The server's new stamp
    // comes back (return=representation) so the next save is conditional on it.
    validateGuid(params.id);
    const cW = String(params.content ?? "");
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cW)) throw new Error("Invalid content encoding.");
    const etagW = params.etag == null ? "" : String(params.etag);
    if (etagW && !/^W\/"[^"]*"$/.test(etagW)) throw new Error("Invalid ETag.");
    let rW;
    try {
      rW = await dvRequest("PATCH", `webresourceset(${params.id})?$select=modifiedon,_modifiedby_value`, { content: cW },
        { "If-Match": etagW || "*", "Prefer": 'return=representation,odata.include-annotations="OData.Community.Display.V1.FormattedValue"' });
    } catch (e) {
      if (/^HTTP 412\b/.test(String(e?.message || ""))) throw new Error("CHANGED_ON_SERVER: the web resource changed on the server since you opened it");
      throw e;
    }
    result = { ok: true, etag: rW?.["@odata.etag"] || "", modifiedOn: rW?.modifiedon || "", modifiedBy: rW?.["_modifiedby_value@OData.Community.Display.V1.FormattedValue"] || "" };
    return result;
  },
  async publishWebResources(params) {
    let result;
    const idsP = [...new Set((params.ids || []).map(String))];
    idsP.forEach(validateGuid);
    if (!idsP.length) throw new Error("Nothing to publish.");
    result = await dvRequest("POST", "PublishXml", { ParameterXml: `<importexportxml><webresources>${idsP.map(id => `<webresource>{${id}}</webresource>`).join("")}</webresources></importexportxml>` });
    return result;
  },
};
export default ACTIONS;
