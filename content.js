/**
 * content.js — Content Script injected on *.dynamics.com
 *
 * No panel/iframe. Panel lives in a separate tab.
 * This script acts solely as an API proxy:
 *   1. Extract D365 context (org URL, user)
 *   2. Execute fetch() to /api/data/v9.2/ (same origin = auto cookies)
 *   3. Respond to requests relayed by background.js
 */

(function () {
  "use strict";
  // Use non-enumerable property to avoid page-level fingerprinting
  if (window.__colvioLoaded) return;
  Object.defineProperty(window, "__colvioLoaded", { value: true, enumerable: false, configurable: false });

  // ── Security: input validation ──────────────────────────
  const SAFE_NAME = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
  const SAFE_GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function validateName(v, label) {
    if (!v || !SAFE_NAME.test(v)) throw new Error(`Invalid ${label}: "${v}". Only alphanumeric and underscores allowed.`);
    return v;
  }
  function validateEntitySet(v) {
    if (!v) throw new Error("Missing entitySet");
    // Full URL (nextLink) — already validated by D365
    if (v.startsWith("http")) return v;
    // Extract the entity set name (before any parenthesis, query, or path)
    const baseName = v.split(/[(?/$]/)[0];
    if (!baseName || !SAFE_NAME.test(baseName)) throw new Error(`Invalid entitySet: "${v}"`);
    return v;
  }
  function validateGuid(v) {
    if (v && !SAFE_GUID.test(v)) throw new Error(`Invalid GUID format: "${v}"`);
    return v;
  }
  function sanitizeSearchTerm(v) {
    if (typeof v !== "string") return "";
    return v.replace(/[\x00-\x1f]/g, "").substring(0, 100).replace(/'/g, "''");
  }

  let d365Context = null;

  // ── Context D365 ─────────────────────────────────────────
  function extractContext() {
    try {
      const ctx = window.Xrm?.Utility?.getGlobalContext?.();
      if (ctx) {
        const orgSettings = ctx.organizationSettings || {};
        return {
          clientUrl: ctx.getClientUrl(),
          orgName: orgSettings.uniqueName || new URL(ctx.getClientUrl()).hostname.split(".")[0],
          userId: ctx.userSettings?.userId,
          userName: ctx.userSettings?.userName,
          apiVersion: "v9.2",
          source: "xrm_sdk",
          isProduction: !ctx.getClientUrl().includes("sandbox") && !ctx.getClientUrl().includes("dev"),
        };
      }
    } catch {}
    try {
      const url = window.location.origin;
      if (url.includes(".dynamics.com")) {
        return {
          clientUrl: url,
          orgName: url.split("//")[1]?.split(".")[0] || "unknown",
          apiVersion: "v9.2",
          source: "url_detection",
          isProduction: !url.includes("sandbox") && !url.includes("dev"),
        };
      }
    } catch {}
    return null;
  }

  // ── Fetch Dataverse ───────────────────────────────────────
  async function dvRequest(method, path, body = null) {
    const ctx = d365Context || extractContext();
    if (!ctx) throw new Error("D365 context not detected");
    const url = path.startsWith("http") ? path : `${ctx.clientUrl}/api/data/${ctx.apiVersion}/${path}`;
    const headers = {
      "Accept": "application/json",
      "OData-MaxVersion": "4.0",
      "OData-Version": "4.0",
    };
    if (body) headers["Content-Type"] = "application/json";

    const isWrite = method === "POST" || method === "PATCH" || method === "DELETE";

    // For reads: request formatted values. For writes: nothing special.
    if (!isWrite && !path.includes("EntityDefinitions")) {
      headers["Prefer"] = 'odata.include-annotations="*"';
    }

    // Timeout: 25s for writes, 20s for reads
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), isWrite ? 25000 : 20000);

    try {
      const resp = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined, credentials: "same-origin", signal: controller.signal });
      clearTimeout(timeout);

      if (!resp.ok) {
        if (resp.status === 401 || resp.status === 403) {
          throw new Error("SESSION_EXPIRED: Session expired — refresh D5 (F5)");
        }
        // Parse D365 error — extract user-facing message, avoid leaking server internals
        let errMsg = `HTTP ${resp.status}`;
        try {
          const errText = await resp.text();
          const errJson = JSON.parse(errText);
          errMsg = `HTTP ${resp.status}: ${errJson?.error?.message || errJson?.Message || errText.substring(0, 300)}`;
        } catch { errMsg += " (no details)"; }
        throw new Error(errMsg);
      }

      // 204 No Content (normal for POST/PATCH success)
      if (resp.status === 204) return { status: 204, ok: true };

      const ct = resp.headers.get("content-type") || "";
      if (ct.includes("application/json")) {
        return await resp.json();
      }
      return { status: resp.status, ok: true };
    } catch (e) {
      clearTimeout(timeout);
      if (e.name === "AbortError") throw new Error("Timeout: D365 did not respond within 25s");
      throw e;
    }
  }

  // ── Record URL detection ──────────────────────────────────
  function getCurrentRecord() {
    try {
      const p = new URLSearchParams(window.location.search);
      if (p.get("etn") && p.get("id")) return { entityType: p.get("etn"), recordId: p.get("id").replace(/[{}]/g, "") };
      const m = window.location.hash.match(/\/(\w+)\/([0-9a-f-]{36})/i);
      if (m) return { entityType: m[1], recordId: m[2] };
    } catch {}
    return null;
  }

  // ── Handler: requests relayed by background.js ─────────
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message.__d365InspectorFromBg) return false;

    const { action, params } = message;

    (async () => {
      try {
        let result;
        switch (action) {
          case "getContext":
            d365Context = extractContext();
            result = d365Context;
            break;

          case "getEntities":
            result = await dvRequest("GET", "EntityDefinitions?$filter=IsIntersect eq false");
            result = (result.value || []).map(e => ({
              logical: e.LogicalName,
              display: e.DisplayName?.UserLocalizedLabel?.Label || e.LogicalName,
              entitySet: e.EntitySetName || (e.LogicalName + "s"),
              isCustom: e.IsCustomEntity || false,
              metadataId: e.MetadataId || null,
            }));
            break;

          case "getFields": {
            validateName(params.logicalName, 'logicalName');
            const raw = await dvRequest("GET",
              `EntityDefinitions(LogicalName='${params.logicalName}')/Attributes`
            );

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

                // Skip types that are never useful in data queries
                const aType = a.AttributeType || "";
                if (aType === "Virtual" || aType === "CalendarRules") return false;

                return true;
              })
              .map(a => {
                const aType = a.AttributeType || "String";
                const logicalName = a.LogicalName;
                const odataName = (aType === "Lookup" || aType === "Customer")
                  ? `_${logicalName}_value`
                  : logicalName;
                return {
                  logical: logicalName,
                  odataName: odataName,
                  display: a.DisplayName?.UserLocalizedLabel?.Label || logicalName,
                  type: aType,
                  isCustom: a.IsCustomAttribute || false,
                  required: a.RequiredLevel?.Value === "ApplicationRequired" || a.RequiredLevel?.Value === "SystemRequired",
                };
              });
            break;
          }

          case "fetchXml": {
            // Execute FetchXML query via D365 Web API
            const xml = params.fetchXml;
            if (!xml) throw new Error("Missing fetchXml parameter");
            // Extract entity name from FetchXML to build URL
            const entityMatch = xml.match(/<entity\s+name=["']([^"']+)["']/);
            if (!entityMatch) throw new Error("Cannot find <entity name='...'> in FetchXML");
            const entityName = entityMatch[1];
            validateName(entityName, "fetchXml entity");
            // Get entity set name
            const esDef = await dvRequest("GET", `EntityDefinitions(LogicalName='${entityName}')?$select=EntitySetName`);
            const esName = esDef?.EntitySetName || (entityName + "s");
            // Execute: GET /entitySet?fetchXml=<url-encoded>
            const encoded = encodeURIComponent(xml);
            const data = await dvRequest("GET", `${esName}?fetchXml=${encoded}`);
            // Check for paging cookie (FetchXML pagination)
            const pagingCookie = data["@Microsoft.Dynamics.CRM.fetchxmlpagingcookie"] || null;
            result = {
              records: data.value || [],
              count: data.value?.length || 0,
              pagingCookie,
              entitySetName: esName,
              moreRecords: !!pagingCookie,
            };
            break;
          }

          case "query": {
            let path = validateEntitySet(params.entitySet);
            const isDirectFetch = path.includes("("); // e.g. accounts(GUID)
            const ps = [];
            if (params.options?.select) ps.push(`$select=${params.options.select}`);
            if (!isDirectFetch) {
              if (params.options?.filter) ps.push(`$filter=${params.options.filter}`);
              if (params.options?.top) ps.push(`$top=${params.options.top}`);
              if (params.options?.orderby) ps.push(`$orderby=${params.options.orderby}`);
              if (params.options?.expand) ps.push(`$expand=${params.options.expand}`);
            }
            if (ps.length) path += "?" + ps.join("&");

            let data;
            try {
              data = await dvRequest("GET", path);
            } catch (queryErr) {
              // Safety net: if 400 with "Could not find a property", retry without $select
              if (queryErr.message?.includes("400") && queryErr.message?.includes("property") && params.options?.select) {
                let fallbackPath = params.entitySet;
                const fps = [];
                if (!isDirectFetch) {
                  if (params.options?.filter) fps.push(`$filter=${params.options.filter}`);
                  if (params.options?.top) fps.push(`$top=${params.options.top}`);
                }
                if (fps.length) fallbackPath += "?" + fps.join("&");
                data = await dvRequest("GET", fallbackPath);
              } else {
                throw queryErr;
              }
            }

            if (isDirectFetch) {
              result = { records: [data], count: 1 };
            } else {
              result = { records: data.value || [], count: data.value?.length || 0, nextLink: data["@odata.nextLink"] };
            }
            break;
          }


          case "getEntityCount": {
            try {
              validateEntitySet(params.entitySet);
              const countResp = await dvRequest("GET", `${params.entitySet}/$count`);
              // $count returns plain text integer, not JSON
              result = typeof countResp === "number" ? countResp : parseInt(String(countResp), 10) || 0;
            } catch {
              result = -1; // Not available
            }
            break;
          }

          case "batchDelete": {
            const ids = (params.ids || []).filter(id => SAFE_GUID.test(id));
            const entitySet = validateEntitySet(params.entitySet);
            const results = { deleted: 0, errors: [] };
            for (let i = 0; i < ids.length; i++) {
              try {
                await dvRequest("DELETE", `${entitySet}(${ids[i]})`);
                results.deleted++;
              } catch (e) {
                results.errors.push({ row: i + 1, id: ids[i], msg: e.message?.substring(0, 300) || "Unknown" });
              }
            }
            result = results;
            break;
          }

          case "getEntitySet": {
            validateName(params.logicalName, 'logicalName');
            const entDef = await dvRequest("GET",
              `EntityDefinitions(LogicalName='${params.logicalName}')?$select=EntitySetName`
            );
            result = entDef?.EntitySetName || (params.logicalName + "s");
            break;
          }
          case "create":
            validateEntitySet(params.entitySet);
            result = await dvRequest("POST", params.entitySet, params.data);
            break;

          case "batchCreate": {
            const records = params.records || [];
            const entitySet = params.entitySet;
            const results = { created: 0, errors: [] };
            const STRIP = new Set(["createdon","modifiedon","createdby","modifiedby","ownerid","owningbusinessunit","owningteam","owninguser","versionnumber","importsequencenumber","overriddencreatedon","timezoneruleversionnumber","utcconversiontimezonecode"]);
            validateEntitySet(entitySet);
            const BATCH_SIZE = 100;
            const ctx = d365Context || extractContext();
            if (!ctx) throw new Error("D365 context not found");
            const baseUrl = `${ctx.clientUrl}/api/data/${ctx.apiVersion}`;

            for (let batch = 0; batch < records.length; batch += BATCH_SIZE) {
              const chunk = records.slice(batch, batch + BATCH_SIZE);
              const boundary = "batch_d365_" + Date.now() + "_" + batch;
              const changeset = "cs_" + Date.now() + "_" + batch;

              let body = "--" + boundary + "\r\n";
              body += "Content-Type: multipart/mixed; boundary=" + changeset + "\r\n\r\n";
              for (let i = 0; i < chunk.length; i++) {
                const clean = {};
                for (const [k, v] of Object.entries(chunk[i])) { if (!STRIP.has(k)) clean[k] = v; }
                body += "--" + changeset + "\r\n";
                body += "Content-Type: application/http\r\nContent-Transfer-Encoding: binary\r\n";
                body += "Content-ID: " + (batch + i + 1) + "\r\n\r\n";
                body += "POST " + baseUrl + "/" + entitySet + " HTTP/1.1\r\n";
                body += "Content-Type: application/json\r\n\r\n";
                body += JSON.stringify(clean) + "\r\n";
              }
              body += "--" + changeset + "--\r\n";
              body += "--" + boundary + "--\r\n";

              try {
                const resp = await fetch(baseUrl + "/$batch", {
                  method: "POST",
                  headers: { "Content-Type": "multipart/mixed; boundary=" + boundary, "OData-MaxVersion": "4.0", "OData-Version": "4.0", "Accept": "application/json" },
                  body,
                  credentials: "same-origin",
                });
                if (resp.ok) {
                  const respText = await resp.text();
                  const ok = (respText.match(/HTTP\/1\.1 (204|201)/g) || []).length;
                  results.created += ok;
                  const fails = (respText.match(/HTTP\/1\.1 [45]\d{2}/g) || []).length;
                  if (fails > 0) {
                    const parts = respText.split(/--cs_/);
                    parts.forEach((part, idx) => {
                      if (part.match(/HTTP\/1\.1 [45]\d{2}/)) {
                        const m = part.match(/"message":"([^"]{0,300})"/);
                        results.errors.push({ row: batch + idx, msg: m ? m[1] : "Batch error", payload: "" });
                      }
                    });
                  }
                } else {
                  for (let i = 0; i < chunk.length; i++) {
                    try {
                      const clean = {}; for (const [k, v] of Object.entries(chunk[i])) { if (!STRIP.has(k)) clean[k] = v; }
                      await dvRequest("POST", entitySet, clean); results.created++;
                    } catch (e) { results.errors.push({ row: batch+i+1, msg: e.message?.substring(0,500)||"Error", payload: JSON.stringify(chunk[i]).substring(0,200) }); }
                  }
                }
              } catch (batchErr) {
                for (let i = 0; i < chunk.length; i++) {
                  try {
                    const clean = {}; for (const [k, v] of Object.entries(chunk[i])) { if (!STRIP.has(k)) clean[k] = v; }
                    await dvRequest("POST", entitySet, clean); results.created++;
                  } catch (e) { results.errors.push({ row: batch+i+1, msg: e.message?.substring(0,500)||"Error", payload: JSON.stringify(chunk[i]).substring(0,200) }); }
                }
              }
            }
            result = results;
            break;
          }

          case "batchUpsert": {
            const items = params.items || [];
            const entitySet = params.entitySet;
            const keyField = params.keyField;
            const isPrimaryKey = params.isPrimaryKey || false;
            const results = { updated: 0, errors: [] };
            const STRIP = new Set(["createdon","modifiedon","createdby","modifiedby","ownerid","owningbusinessunit","owningteam","owninguser","versionnumber","importsequencenumber","overriddencreatedon","timezoneruleversionnumber","utcconversiontimezonecode"]);
            validateEntitySet(entitySet);
            validateName(keyField, 'keyField');
            for (let i = 0; i < items.length; i++) {
              try {
                const clean = {};
                for (const [k, v] of Object.entries(items[i].record)) {
                  if (STRIP.has(k) && k !== keyField) continue;
                  // Strip primary key from payload (D365 rejects it in body)
                  if (isPrimaryKey && k === keyField) continue;
                  clean[k] = v;
                }
                // Primary key: PATCH /accounts(GUID)
                // Alternate key: PATCH /accounts(keyField='keyValue')
                const path = isPrimaryKey
                  ? `${entitySet}(${items[i].keyValue})`
                  : `${entitySet}(${keyField}='${items[i].keyValue.replace(/'/g, "''")}')`;
                await dvRequest("PATCH", path, clean);
                results.updated++;
              } catch (e) {
                results.errors.push({ row: i + 1, msg: e.message?.substring(0, 500) || "Unknown error", payload: JSON.stringify(items[i].record).substring(0, 200) });
              }
            }
            result = results;
            break;
          }
          case "update":
            validateEntitySet(params.entitySet);
            if (params.id) validateGuid(params.id);
            result = await dvRequest("PATCH", `${params.entitySet}(${params.id})`, params.data);
            break;

          case "getOptionSet": {
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
                  color: o.Color || null,
                  description: o.Description?.UserLocalizedLabel?.Label || "",
                }));
              } catch { result = []; }
            }
            break;
          }

          case "getLookups": {
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
            break;
          }

          case "getChildRelationships": {
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
            break;
          }

          case "searchUsers": {
            // Search systemusers by name or email
            const term = sanitizeSearchTerm(params.search);
            const filter = `contains(fullname,'${term}') or contains(internalemailaddress,'${term}')`;
            const data = await dvRequest("GET",
              `systemusers?$select=systemuserid,fullname,internalemailaddress,isdisabled,title&$filter=${filter}&$top=20&$orderby=fullname asc`
            );
            result = (data.value || []).map(u => ({
              id: u.systemuserid,
              fullname: u.fullname,
              email: u.internalemailaddress,
              disabled: u.isdisabled,
              title: u.title,
            }));
            break;
          }

          case "getLoginHistory": {
            const userId = params.userId;
            validateGuid(userId);
            const top = Math.min(parseInt(params.top, 10) || 100, 5000);

            // Strategy 1: User Access Audit (action 64=Login, 65=Logout)
            let path = `audits?$select=createdon,action,_userid_value,_objectid_value,useradditionalinfo,operation,changedata&$filter=_objectid_value eq ${userId} and (action eq 64 or action eq 65)&$top=${top}&$orderby=createdon desc`;
            let data = await dvRequest("GET", path);
            let records = (data.value || []).map(a => ({
              date: a.createdon,
              action: a.action === 64 ? "Login" : a.action === 65 ? "Logout" : `Action ${a.action}`,
              actionCode: a.action,
              accessType: a["action@OData.Community.Display.V1.FormattedValue"] || (a.action === 64 ? "Login" : "Logout"),
              userId: a["_objectid_value"],
              userName: a["_objectid_value@OData.Community.Display.V1.FormattedValue"] || "",
              info: a.useradditionalinfo || "",
              changedata: a.changedata || "",
              operation: a["operation@OData.Community.Display.V1.FormattedValue"] || "",
            }));

            // Strategy 2: If no login events, try ALL audit records for this user
            if (records.length === 0) {
              try {
                const broader = await dvRequest("GET",
                  `audits?$select=createdon,action,_objectid_value&$filter=_objectid_value eq ${userId}&$top=5&$orderby=createdon desc`
                );
                if (broader.value && broader.value.length > 0) {
                  records = [{ date: null, action: "__AUDIT_EXISTS_BUT_NO_LOGINS", userId, info: `${broader.value.length} other audit records found` }];
                }
              } catch {}
            }

            result = records;
            break;
          }
          case "upsert":
            validateEntitySet(params.entitySet);
            validateName(params.keyField, 'keyField');
            result = await dvRequest("PATCH", `${params.entitySet}(${params.keyField}='${params.keyValue.replace(/'/g, "''")}')`, params.data);
            break;
          case "getCurrentRecord":
            result = getCurrentRecord();
            break;
          case "getApiLimits":
            try {
              const ctx = d365Context || extractContext();
              const r = await fetch(`${ctx.clientUrl}/api/data/${ctx.apiVersion}/WhoAmI`, {
                headers: { Accept: "application/json", "OData-MaxVersion": "4.0" }, credentials: "same-origin",
              });
              result = { remaining: parseInt(r.headers.get("x-ms-ratelimit-burst-remaining-xrm-requests") || "0"), limit: 60000 };
            } catch { result = null; }
            break;

          // ── Solutions ──
          case "getSolutions": {
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
            break;
          }
          case "getSolutionComponents": {
            validateGuid(params.solutionId);
            const data = await dvRequest("GET",
              `solutioncomponents?$select=solutioncomponentid,componenttype,objectid,rootcomponentbehavior&$filter=_solutionid_value eq ${params.solutionId}&$top=5000`
            );
            const comps = (data.value || []).map(c => ({
              id: c.solutioncomponentid,
              type: c.componenttype,
              objectId: c.objectid,
              behavior: c.rootcomponentbehavior,
              name: null,
            }));

            // Batch-resolve display names per component type
            const resolvers = {
              1:  ids => dvRequest("GET", `EntityDefinitions?$select=MetadataId,DisplayName,LogicalName&$filter=${ids.map(id=>`MetadataId eq ${id}`).join(" or ")}`).then(d => {
                const m = {}; (d.value||[]).forEach(e => { m[e.MetadataId.toLowerCase()] = e.DisplayName?.UserLocalizedLabel?.Label || e.LogicalName; }); return m;
              }),
              9:  ids => dvRequest("GET", `GlobalOptionSetDefinitions?$select=MetadataId,Name`).then(d => {
                const m = {}; (d.value||[]).forEach(e => { if(ids.includes(e.MetadataId.toLowerCase())) m[e.MetadataId.toLowerCase()] = e.Name; }); return m;
              }),
              26: ids => dvRequest("GET", `savedqueries?$select=savedqueryid,name&$filter=${ids.map(id=>`savedqueryid eq ${id}`).join(" or ")}`).then(d => {
                const m = {}; (d.value||[]).forEach(e => { m[e.savedqueryid.toLowerCase()] = e.name; }); return m;
              }),
              60: ids => dvRequest("GET", `webresourceset?$select=webresourceid,name&$filter=${ids.map(id=>`webresourceid eq ${id}`).join(" or ")}`).then(d => {
                const m = {}; (d.value||[]).forEach(e => { m[e.webresourceid.toLowerCase()] = e.name; }); return m;
              }),
              91: ids => dvRequest("GET", `plugintypes?$select=plugintypeid,name&$filter=${ids.map(id=>`plugintypeid eq ${id}`).join(" or ")}`).then(d => {
                const m = {}; (d.value||[]).forEach(e => { m[e.plugintypeid.toLowerCase()] = e.name; }); return m;
              }),
              92: ids => dvRequest("GET", `pluginassemblies?$select=pluginassemblyid,name&$filter=${ids.map(id=>`pluginassemblyid eq ${id}`).join(" or ")}`).then(d => {
                const m = {}; (d.value||[]).forEach(e => { m[e.pluginassemblyid.toLowerCase()] = e.name; }); return m;
              }),
              95: ids => dvRequest("GET", `sdkmessageprocessingsteps?$select=sdkmessageprocessingstepid,name&$filter=${ids.map(id=>`sdkmessageprocessingstepid eq ${id}`).join(" or ")}`).then(d => {
                const m = {}; (d.value||[]).forEach(e => { m[e.sdkmessageprocessingstepid.toLowerCase()] = e.name; }); return m;
              }),
              63: ids => dvRequest("GET", `roles?$select=roleid,name&$filter=${ids.map(id=>`roleid eq ${id}`).join(" or ")}`).then(d => {
                const m = {}; (d.value||[]).forEach(e => { m[e.roleid.toLowerCase()] = e.name; }); return m;
              }),
              59: ids => dvRequest("GET", `savedqueryvisualizations?$select=savedqueryvisualizationid,name&$filter=${ids.map(id=>`savedqueryvisualizationid eq ${id}`).join(" or ")}`).then(d => {
                const m = {}; (d.value||[]).forEach(e => { m[e.savedqueryvisualizationid.toLowerCase()] = e.name; }); return m;
              }),
              62: ids => dvRequest("GET", `connectionroles?$select=connectionroleid,name&$filter=${ids.map(id=>`connectionroleid eq ${id}`).join(" or ")}`).then(d => {
                const m = {}; (d.value||[]).forEach(e => { m[e.connectionroleid.toLowerCase()] = e.name; }); return m;
              }),
              300: ids => dvRequest("GET", `canvasapps?$select=canvasappid,name&$filter=${ids.map(id=>`canvasappid eq ${id}`).join(" or ")}`).then(d => {
                const m = {}; (d.value||[]).forEach(e => { m[e.canvasappid.toLowerCase()] = e.name; }); return m;
              }),
              10: ids => dvRequest("GET", `RelationshipDefinitions?$select=MetadataId,SchemaName`).then(d => {
                const m = {}; (d.value||[]).forEach(e => { if(ids.includes(e.MetadataId.toLowerCase())) m[e.MetadataId.toLowerCase()] = e.SchemaName; }); return m;
              }),
            };

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
                // Type 10 (Relationship) fetches all and filters client-side, no batching needed
                if (String(type) === "10") {
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
                await Promise.all(entityIds.map(async entId => {
                  try {
                    const d = await dvRequest("GET", `EntityDefinitions(${entId})/Attributes?$select=MetadataId,LogicalName,DisplayName`);
                    (d.value || []).forEach(a => {
                      const mid = a.MetadataId?.toLowerCase();
                      if (mid && attrIds.has(mid)) {
                        nameMap[mid] = a.DisplayName?.UserLocalizedLabel?.Label || a.LogicalName;
                      }
                    });
                  } catch {}
                }));
              } catch {}
            }

            // Apply resolved names
            comps.forEach(c => {
              const key = c.objectId?.toLowerCase();
              if (key && nameMap[key]) c.name = nameMap[key];
            });

            result = comps;
            break;
          }

          // ── Translations ──
          case "getOrgLanguages": {
            const data = await dvRequest("GET", "RetrieveAvailableLanguages");
            const LANG_NAMES = {1033:"English",1036:"French",1031:"German",1034:"Spanish",1040:"Italian",1046:"Portuguese",1043:"Dutch",1041:"Japanese",1028:"Chinese (Traditional)",2052:"Chinese (Simplified)",1042:"Korean",1049:"Russian",1055:"Turkish",1045:"Polish",1029:"Czech",1030:"Danish",1035:"Finnish",1044:"Norwegian",1053:"Swedish",1025:"Arabic"};
            const codes = data?.LocaleIds || [];
            result = codes.map(c => ({ code: c, name: LANG_NAMES[c] || `LCID ${c}` }));
            break;
          }
          case "getAttributeLabels": {
            validateName(params.logicalName, 'logicalName');
            const data = await dvRequest("GET",
              `EntityDefinitions(LogicalName='${params.logicalName}')/Attributes?$select=LogicalName,AttributeType,DisplayName,Description`
            );
            result = (data.value || []).map(a => ({
              logical: a.LogicalName,
              type: a.AttributeType,
              labels: (a.DisplayName?.LocalizedLabels || []).map(l => ({ label: l.Label, languageCode: l.LanguageCode })),
              descriptions: (a.Description?.LocalizedLabels || []).map(l => ({ label: l.Label, languageCode: l.LanguageCode })),
            }));
            break;
          }
          case "updateAttributeLabel": {
            validateName(params.entityName, 'entityName');
            validateName(params.attributeName, 'attributeName');
            result = await dvRequest("PUT",
              `EntityDefinitions(LogicalName='${params.entityName}')/Attributes(LogicalName='${params.attributeName}')/DisplayName`,
              { LocalizedLabels: params.localizedLabels }
            );
            break;
          }
          case "publishEntity": {
            validateName(params.logicalName, 'logicalName');
            result = await dvRequest("POST", "PublishXml", {
              ParameterXml: `<importexportxml><entities><entity>${params.logicalName}</entity></entities></importexportxml>`
            });
            break;
          }

          case "getManyToManyRelationships": {
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
            break;
          }

          case "getEntityMetadata": {
            validateName(params.logicalName, 'logicalName');
            const meta = await dvRequest("GET",
              `EntityDefinitions(LogicalName='${params.logicalName}')?$select=CanBeDeleted,DisplayName`
            );
            result = {
              canBeDeleted: meta?.CanBeDeleted?.Value ?? true,
              displayName: meta?.DisplayName?.UserLocalizedLabel?.Label || params.logicalName,
            };
            break;
          }

          // ── User & License Monitor ──
          case "getAllUsers": {
            const ACCESS_MODES = { 0: "Read-Write", 1: "Admin", 2: "Read", 3: "Support", 4: "Non-Interactive", 5: "Delegated Admin" };
            const CAL_TYPES = { 0: "Full", 1: "Admin", 2: "Basic", 3: "Device Full", 4: "Device Basic", 5: "Essential", 6: "Device Essential", 7: "Enterprise", 8: "Device Enterprise", 9: "Sales", 10: "Service", 11: "Field Service", 12: "Project Service" };
            const data = await dvRequest("GET",
              "systemusers?$select=systemuserid,fullname,internalemailaddress,isdisabled,accessmode,caltype,title,createdon,_businessunitid_value&$orderby=fullname asc&$top=5000"
            );
            result = (data.value || []).map(u => ({
              id: u.systemuserid,
              fullname: u.fullname || "",
              email: u.internalemailaddress || "",
              disabled: u.isdisabled,
              accessMode: u.accessmode,
              accessModeLabel: ACCESS_MODES[u.accessmode] || `Mode ${u.accessmode}`,
              calType: u.caltype,
              calTypeLabel: CAL_TYPES[u.caltype] || `Type ${u.caltype}`,
              buName: u["_businessunitid_value@OData.Community.Display.V1.FormattedValue"] || "",
              buId: u._businessunitid_value || "",
              title: u.title || "",
              createdOn: u.createdon,
            }));
            break;
          }

          case "getUserRoles": {
            validateGuid(params.userId);
            const data = await dvRequest("GET",
              `systemusers(${params.userId})/systemuserroles_association?$select=roleid,name`
            );
            result = (data.value || []).map(r => ({
              id: r.roleid,
              name: r.name,
            }));
            break;
          }

          case "getUserLastLogin": {
            validateGuid(params.userId);
            const data = await dvRequest("GET",
              `audits?$select=createdon&$filter=_objectid_value eq ${params.userId} and action eq 64&$top=1&$orderby=createdon desc`
            );
            const rec = (data.value || [])[0];
            result = rec ? { date: rec.createdon } : null;
            break;
          }

          default:
            throw new Error(`Unknown action: ${action}`);
        }
        sendResponse({ result });
      } catch (e) {
        sendResponse({ error: e.message });
      }
    })();

    return true; // async
  });

  // Signal to background that D365 tab is ready
  chrome.runtime.sendMessage({ action: "d365_tab_ready" });

})();
