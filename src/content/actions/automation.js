// Content script › automation. Automation — plug-in steps, processes, flows and their identities, process instances and stages, org features.
// One async function per action; `params` is what the panel sent. Every request goes through
// core.js (dvRequest: host lock, pacing, timeouts, 429 back-off).
import { NO_ANN, SAFE_GUID, dvRequest, validateGuid, validateName } from "../core.js";

const ACTIONS = {
  async getPluginSteps(params) {
    let result;
    // Static inventory of plug-in step REGISTRATIONS (what runs on which message/entity,
    // at which stage, sync or async) — the design-time view, not the runtime jobs that
    // System Ops shows. Paged; a heavy org has a few thousand steps at most.
    const rowsP = [];
    let urlP = `sdkmessageprocessingsteps?$select=sdkmessageprocessingstepid,name,stage,mode,rank,statecode,ismanaged,filteringattributes,modifiedon,_impersonatinguserid_value&$expand=plugintypeid($select=typename,assemblyname),sdkmessageid($select=name),sdkmessagefilterid($select=primaryobjecttypecode)&$orderby=name`;
    while (urlP) {
      const dP = await dvRequest("GET", urlP, null, { Prefer: "odata.maxpagesize=5000" });
      (dP.value || []).forEach(s => rowsP.push({
        id: s.sdkmessageprocessingstepid,
        name: s.name || "",
        stage: s.stage,            // 10 Pre-validation / 20 Pre-operation / 40 Post-operation
        mode: s.mode,              // 0 Synchronous / 1 Asynchronous
        rank: s.rank,
        state: s.statecode,        // 0 Enabled / 1 Disabled
        managed: !!s.ismanaged,
        filteringAttributes: s.filteringattributes || "",
        // the user the step runs as (null = the calling user) — Automation › Who runs it
        runAsId: s._impersonatinguserid_value || null,
        runAs: s["_impersonatinguserid_value@OData.Community.Display.V1.FormattedValue"] || "",
        message: s.sdkmessageid?.name || "",
        entity: s.sdkmessagefilterid?.primaryobjecttypecode || "",
        pluginType: s.plugintypeid?.typename || "",
        assembly: s.plugintypeid?.assemblyname || "",
        modifiedon: s.modifiedon || "",
      }));
      const nlP = dP["@odata.nextLink"];
      urlP = nlP ? nlP.replace(/^.*\/api\/data\/v[\d.]+\//, "") : null;
    }
    result = rowsP;
    return result;
  },
  async getProcesses(params) {
    let result;
    // Every PROCESS DEFINITION from the workflow table — category tells them apart:
    // 0 classic workflow / 1 dialog / 2 business rule / 3 action / 4 BPF / 5 modern
    // (Power Automate) cloud flow / 6 desktop flow. type eq 1 keeps definitions only
    // (2 = per-record activations, 3 = templates).
    const rowsW = [];
    let urlW = `workflows?$select=workflowid,name,category,statecode,mode,runas,ondemand,subprocess,primaryentity,ismanaged,triggeroncreate,triggerondelete,triggeronupdateattributelist,_ownerid_value,_createdby_value,modifiedon&$filter=type eq 1&$orderby=name`;
    while (urlW) {
      const dW = await dvRequest("GET", urlW, null, { Prefer: "odata.maxpagesize=5000" });
      (dW.value || []).forEach(w => rowsW.push({
        id: w.workflowid,
        name: w.name || "",
        category: w.category,      // see mapping above
        state: w.statecode,        // 0 Draft / 1 Activated
        mode: w.mode,              // classic workflows: 0 Background / 1 Real-time
        entity: w.primaryentity && w.primaryentity !== "none" ? w.primaryentity : "",
        managed: !!w.ismanaged,
        triggerCreate: !!w.triggeroncreate,
        triggerDelete: !!w.triggerondelete,
        triggerUpdate: w.triggeronupdateattributelist || "",
        owner: w["_ownerid_value@OData.Community.Display.V1.FormattedValue"] || "",
        ownerId: w._ownerid_value || null,
        ownerType: w["_ownerid_value@Microsoft.Dynamics.CRM.lookuplogicalname"] || "systemuser",
        createdById: w._createdby_value || null,
        createdBy: w["_createdby_value@OData.Community.Display.V1.FormattedValue"] || "",
        runAs: w.runas ?? null, // real-time workflows: 0 owner / 1 calling user
        onDemand: !!w.ondemand, // a user can start it from Run Workflow (then it runs with THAT user's rights)
        child: !!w.subprocess,
        modifiedon: w.modifiedon || "",
      }));
      const nlW = dW["@odata.nextLink"];
      urlW = nlW ? nlW.replace(/^.*\/api\/data\/v[\d.]+\//, "") : null;
    }
    result = rowsW;
    return result;
  },
  async getWhoRunsData(params) {
    let result;
    // Automation › Who runs it: every connection reference, and every connection instance
    // (the Dataverse copy of a connection, with the ACCOUNT it is signed in as) — paged, all
    // of them. An org without the connectioninstance table says so instead of failing.
    const pageAllW = async (url) => {
      const out = [];
      while (url) {
        const d = await dvRequest("GET", url, null, { Prefer: "odata.maxpagesize=5000" });
        out.push(...(d.value || []));
        const nl = d["@odata.nextLink"]; url = nl ? nl.replace(/^.*\/api\/data\/v[\d.]+\//, "") : null;
      }
      return out;
    };
    const fvW = (e, f) => e[`${f}@OData.Community.Display.V1.FormattedValue`] || "";
    const refsW = (await pageAllW("connectionreferences?$select=connectionreferenceid,connectionreferencedisplayname,connectionreferencelogicalname,connectorid,connectionid,statecode,_ownerid_value,_createdby_value"))
      .map(r => ({ id: r.connectionreferenceid, name: r.connectionreferencedisplayname || "", logicalName: r.connectionreferencelogicalname || "", connectorId: r.connectorid || "", connectionId: r.connectionid || "", state: r.statecode, ownerId: r._ownerid_value || null, ownerType: r["_ownerid_value@Microsoft.Dynamics.CRM.lookuplogicalname"] || "systemuser", owner: fvW(r, "_ownerid_value"), createdBy: fvW(r, "_createdby_value") }));
    let instancesW = [], instancesMissing = false;
    try {
      instancesW = (await pageAllW("connectioninstances?$select=connectioninstanceid,connectioninstancedisplayname,accountname,connectioninternalid,connectorinternalid,connectionstatus,statecode,_connectionreferenceid_value,_ownerid_value"))
        .map(i => ({ id: i.connectioninstanceid, name: i.connectioninstancedisplayname || "", accountName: i.accountname || "", internalId: i.connectioninternalid || "", connectorInternalId: i.connectorinternalid || "", status: i.connectionstatus || "", state: i.statecode, refId: i._connectionreferenceid_value || null, ownerId: i._ownerid_value || null, owner: fvW(i, "_ownerid_value") }));
    } catch (e) {
      if (!/404|not found|could not find|does not exist/i.test(e.message || "")) throw e;
      instancesMissing = true;
    }
    result = { refs: refsW, instances: instancesW, instancesMissing };
    return result;
  },
  async getIdentityUsers(params) {
    let result;
    // The users behind the identities: by id (owners, run-as) and by account name (signed-in
    // connections), 40 per filtered read — plus every application user and non-interactive
    // user, the integration identities that may run things from outside.
    const SEL = "systemuserid,fullname,internalemailaddress,domainname,applicationid,accessmode,isdisabled,_businessunitid_value";
    const usersU = new Map();
    const readU = async (filter) => {
      let url = `systemusers?$select=${SEL}&$filter=${filter}`;
      while (url) {
        const d = await dvRequest("GET", url, null, { Prefer: "odata.maxpagesize=5000" });
        for (const u of d.value || []) usersU.set(String(u.systemuserid).toLowerCase(), u);
        const nl = d["@odata.nextLink"]; url = nl ? nl.replace(/^.*\/api\/data\/v[\d.]+\//, "") : null;
      }
    };
    const idsU = [...new Set((params.ids || []).map(x => String(x || "").toLowerCase()).filter(x => SAFE_GUID.test(x)))];
    for (let i = 0; i < idsU.length; i += 40) await readU(idsU.slice(i, i + 40).map(id => `systemuserid eq ${id}`).join(" or "));
    const accU = [...new Set((params.accounts || []).map(a => String(a || "").trim().toLowerCase()).filter(a => a && a.length <= 320 && !/[\x00-\x1f]/.test(a)))];
    const q = (s) => `'${s.replace(/'/g, "''")}'`;
    for (let i = 0; i < accU.length; i += 20) await readU(accU.slice(i, i + 20).map(a => `domainname eq ${encodeURIComponent(q(a))} or internalemailaddress eq ${encodeURIComponent(q(a))}`).join(" or "));
    await readU("applicationid ne null or accessmode eq 4");
    result = [...usersU.values()];
    return result;
  },
  async getFlowDefinitionsPage(params) {
    let result;
    // One page of cloud-flow definitions (clientdata) — 25 at a time, since a definition can be
    // big; the panel reads them all, page by page, to see which connections each flow uses.
    let urlF = "workflows?$select=workflowid,clientdata&$filter=category eq 5 and type eq 1";
    if (params.next) {
      const rel = String(params.next).replace(/^.*\/api\/data\/v[\d.]+\//, "");
      if (!/^workflows\?/.test(rel)) throw new Error("Invalid page link.");
      urlF = rel;
    }
    const dF = await dvRequest("GET", urlF, null, { Prefer: "odata.maxpagesize=25", ...NO_ANN });
    result = { rows: (dF.value || []).map(w => ({ id: w.workflowid, clientdata: w.clientdata || "" })), next: dF["@odata.nextLink"] || null };
    return result;
  },
  async orgFeatures(params) {
    let result;
    // ONE consolidated probe for org-level feature switches that gate Colvio modules:
    //  - isauditenabled        → Login History + record Change History
    //  - plugintracelogsetting → Plugin Traces (0 Off / 1 Exception / 2 All)
    //  - recyclebinconfig row  → Recycle Bin (+ retention days)
    // Two GETs total; the bridge caches the result so the panel pays this at most
    // once per session — module tabs/banners read it, they never re-probe.
    const out = { auditEnabled: null, pluginTraceSetting: null, recycleBin: { enabled: false, retentionDays: null } };
    try {
      // auditretentionperiodv2 (days; -1 = forever) may be absent on older schemas — the
      // whole $select would 400, so fall back without it rather than losing auditEnabled.
      let org;
      try { org = await dvRequest("GET", "organizations?$select=isauditenabled,plugintracelogsetting,useraccessauditinginterval,auditretentionperiodv2,donotremoverolesonchangebusinessunit&$top=1"); }
      catch { org = await dvRequest("GET", "organizations?$select=isauditenabled,plugintracelogsetting,useraccessauditinginterval&$top=1"); }
      const row = org?.value?.[0];
      if (row) {
        out.auditEnabled = row.isauditenabled !== false;
        out.pluginTraceSetting = typeof row.plugintracelogsetting === "number" ? row.plugintracelogsetting : null;
        // Adoption's honesty hint: Dataverse logs user access AT MOST once per this many
        // hours per user — "access events", not literal logins. Default 4.
        out.accessInterval = typeof row.useraccessauditinginterval === "number" ? row.useraccessauditinginterval : null;
        out.auditRetentionDays = typeof row.auditretentionperiodv2 === "number" ? row.auditretentionperiodv2 : null;
        // BU-move gotcha flag: true = roles KEPT on business-unit change; false = legacy
        // behavior, roles REMOVED; null/undefined column = unknown (older schema).
        out.retainRolesOnBuChange = typeof row.donotremoverolesonchangebusinessunit === "boolean" ? row.donotremoverolesonchangebusinessunit : null;
      }
    } catch { /* unknown — fail-open (null = don't gate) */ }
    try {
      const r = await dvRequest("GET", "recyclebinconfigs?$select=cleanupintervalindays,statecode&$filter=name eq 'organization'");
      const row = r?.value?.[0];
      out.recycleBin = { enabled: !!row && row.statecode === 0, retentionDays: row?.cleanupintervalindays ?? null };
    } catch { out.recycleBin = { enabled: false, unknown: true }; }
    result = out;
    return result;
  },
  async getProcessInstances(params) {
    let result;
    // All Business Process Flow instances running on ONE record, across every BPF definition.
    // RetrieveProcessInstances is an UNBOUND function taking EntityId + EntityLogicalName — a
    // bound call (entityset(id)/...RetrieveProcessInstances()) 404s "Resource not found for the
    // segment". The returned rows are typed as the abstract base `businessprocessflowinstance`,
    // which is NOT writable ("RetrieveMultiple ... does not support entities of type
    // 'businessprocessflowinstance'") — and BOTH @odata.type and @odata.id report that base set.
    // Per the docs, the CONCRETE BPF entity (the one to PATCH) is the `uniquename` of the
    // instance's PROCESS (workflow). So we look up workflows(<processid>).uniquename and resolve
    // its EntitySetName from metadata, cached per process.
    validateName(params.entity, "entity");
    validateGuid(params.id);
    const ri = await dvRequest("GET", `RetrieveProcessInstances(EntityId=${params.id},EntityLogicalName='${params.entity}')`);
    const setByProcess = {};
    const resolveSet = async (processId) => {
      if (!processId) return null;
      if (setByProcess[processId] !== undefined) return setByProcess[processId];
      let set = null;
      try {
        const w = await dvRequest("GET", `workflows(${processId})?$select=uniquename`);
        const logical = w?.uniquename || null; // == the concrete BPF entity logical name
        if (logical) {
          try { const d = await dvRequest("GET", `EntityDefinitions(LogicalName='${logical}')?$select=EntitySetName`); set = d?.EntitySetName || (logical + "s"); }
          catch { set = logical + "s"; }
        }
      } catch { set = null; }
      setByProcess[processId] = set;
      return set;
    };
    const instances = [];
    for (const inst of (ri?.value || [])) {
      const processId = inst._processid_value || null;
      const bpfEntitySet = await resolveSet(processId);
      instances.push({
        id: inst.businessprocessflowinstanceid || null,
        bpfEntitySet,
        name: inst.bpf_name || inst.name || "",
        processId,
        processName: inst["_processid_value@OData.Community.Display.V1.FormattedValue"] || "",
        activeStageId: inst._activestageid_value || null,
        activeStageName: inst["_activestageid_value@OData.Community.Display.V1.FormattedValue"] || "",
        stateCode: inst.statecode,
        stateLabel: inst["statecode@OData.Community.Display.V1.FormattedValue"] || "",
        statusCode: inst.statuscode,
        statusLabel: inst["statuscode@OData.Community.Display.V1.FormattedValue"] || "",
        traversedPath: inst.traversedpath || "",
        createdOn: inst.createdon || null,
        completedOn: inst.completedon || null,
      });
    }
    result = instances;
    return result;
  },
  async getProcessStages(params) {
    let result;
    // Every stage of a BPF definition (the values an admin can move a record to). Ordered by
    // stage category as a rough sequence proxy. The platform validates the target on PATCH.
    validateGuid(params.processId);
    const rs = await dvRequest("GET", `processstages?$select=processstageid,stagename,stagecategory,_processid_value&$filter=_processid_value eq ${params.processId}&$orderby=stagecategory asc`);
    result = (rs?.value || []).map(s => ({
      id: s.processstageid,
      name: s.stagename || "(unnamed stage)",
      category: s["stagecategory@OData.Community.Display.V1.FormattedValue"] || (s.stagecategory != null ? String(s.stagecategory) : ""),
    }));
    return result;
  },
};
export default ACTIONS;
