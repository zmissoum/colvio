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
  // Set by the panel (via "abortBatch") when the user cancels a bulk run; cleared by
  // "resetBatchAbort" at the start of each run. Checked by the batch builders and the 429
  // back-off loops so a cancel stops retries and chunk processing inside the content script too.
  let batchAborted = false;

  async function dvRequest(method, path, body = null, extraHeaders = null) {
    const ctx = d365Context || extractContext();
    if (!ctx) throw new Error("D365 context not detected");
    const url = path.startsWith("http") ? path : `${ctx.clientUrl}/api/data/${ctx.apiVersion}/${path}`;
    // Defense-in-depth chokepoint: any absolute URL (e.g. an @odata.nextLink) MUST target the
    // user's own org host. Panel messages already can't be forged (background.js checks sender.id,
    // no externally_connectable), but this guarantees no caller — now or later — can make the
    // privileged content script fetch an off-org host with the user's session.
    if (path.startsWith("http")) {
      let host, base;
      try { host = new URL(url).hostname; base = new URL(ctx.clientUrl).hostname; }
      catch { throw new Error("Invalid request URL"); }
      if (host !== base) throw new Error(`Refusing request to ${host}: not your D365 org host (${base})`);
    }
    const headers = {
      "Accept": "application/json",
      "OData-MaxVersion": "4.0",
      "OData-Version": "4.0",
    };
    if (body) headers["Content-Type"] = "application/json";
    if (extraHeaders) Object.assign(headers, extraHeaders);

    const isWrite = method === "POST" || method === "PATCH" || method === "DELETE" || method === "PUT";

    // For reads: request formatted values. For writes: nothing special. Append to (not clobber)
    // any caller-supplied Prefer — e.g. odata.maxpagesize for server-driven paging — so both
    // travel together.
    if (!isWrite && !path.includes("EntityDefinitions")) {
      headers["Prefer"] = headers["Prefer"]
        ? `${headers["Prefer"]},odata.include-annotations="*"`
        : 'odata.include-annotations="*"';
    }

    // Timeout: 25s for writes, 60s for reads (roles/privileges can be large)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), isWrite ? 25000 : 60000);

    try {
      let resp = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined, credentials: "same-origin", signal: controller.signal });
      clearTimeout(timeout);

      // 429 Service Protection: the request was rejected BEFORE execution, so retrying is safe
      // for reads and writes alike. Honors Retry-After (capped 30s, 3 attempts). This is the
      // funnel for every non-$batch call — lookup resolution, existence checks, single PATCHes —
      // which are exactly the paths throttled alongside big loads.
      let attempt429 = 0;
      while (resp.status === 429 && attempt429 < 3 && !batchAborted) {
        const ra = parseInt(resp.headers.get("Retry-After") || "", 10);
        await new Promise(r => setTimeout(r, Math.min(isNaN(ra) ? 2 * (attempt429 + 1) : ra, 30) * 1000));
        if (batchAborted) break;
        attempt429++;
        resp = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined, credentials: "same-origin" });
      }

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

  // Fetch a $batch with automatic 429 (Service Protection) backoff. Dataverse counts every
  // operation inside a $batch against the request budget, so big loads can hit 429 — this honors
  // Retry-After (capped) and retries the same batch instead of surfacing a throttle as a row error.
  async function fetchBatchWithRetry(url, options, maxRetries = 4) {
    let attempt = 0;
    while (true) {
      const resp = await fetch(url, options);
      if (resp.status !== 429 || attempt >= maxRetries || batchAborted) return resp;
      const ra = parseInt(resp.headers.get("Retry-After") || "", 10);
      const waitMs = Math.min(isNaN(ra) ? 2 * (attempt + 1) : ra, 30) * 1000; // cap 30s
      await new Promise(r => setTimeout(r, waitMs));
      if (batchAborted) return resp; // user cancelled during the back-off — never re-send writes
      attempt++;
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
          case "getContext": {
            d365Context = extractContext();
            // Enrich with authoritative OrganizationType from the Web API.
            // The bound function returns enum values like "Production", "Sandbox",
            // "CustomerTest" (= UAT), "Trial", "Preview", "Support", "Developer".
            // Falls back gracefully if the function isn't available or the call fails.
            try {
              const detail = await dvRequest(
                "GET",
                "RetrieveCurrentOrganization(AccessType=Microsoft.Dynamics.CRM.EndpointAccessType'Default')"
              );
              if (detail?.Detail) {
                d365Context = {
                  ...d365Context,
                  organizationType: detail.Detail.OrganizationType || null,
                  organizationId: detail.Detail.OrganizationId || null,
                  environmentId: detail.Detail.EnvironmentId || null,
                  tenantId: detail.Detail.TenantId || null,
                  geo: detail.Detail.Geo || null,
                  organizationFriendlyName: detail.Detail.FriendlyName || null,
                  organizationVersion: detail.Detail.OrganizationVersion || null,
                  organizationState: detail.Detail.State || null,
                };
              }
            } catch {
              // Older D365 versions or restricted permissions — heuristic fallback in panel
            }
            result = d365Context;
            break;
          }

          case "getEntities":
            result = await dvRequest("GET", "EntityDefinitions?$filter=IsIntersect eq false&$select=LogicalName,DisplayName,EntitySetName,IsCustomEntity,IsManaged,MetadataId");
            result = (result.value || []).map(e => ({
              logical: e.LogicalName,
              display: e.DisplayName?.UserLocalizedLabel?.Label || e.LogicalName,
              entitySet: e.EntitySetName || (e.LogicalName + "s"),
              isCustom: e.IsCustomEntity || false,
              isManaged: e.IsManaged || false,
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
                  // Writability — used by the Loader to keep read-only / calculated / rollup
                  // fields out of CREATE/UPDATE mapping (they 400 per row otherwise).
                  validForCreate: a.IsValidForCreate !== false,
                  validForUpdate: a.IsValidForUpdate !== false,
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
            const isDirectFetch = /^[^?]*\(/.test(path); // e.g. accounts(GUID) — must be before ? to avoid matching parens in $filter
            const ps = [];
            if (params.options?.select) ps.push(`$select=${params.options.select}`);
            if (!isDirectFetch) {
              if (params.options?.filter) ps.push(`$filter=${params.options.filter}`);
              if (params.options?.top) ps.push(`$top=${params.options.top}`);
              if (params.options?.orderby) ps.push(`$orderby=${params.options.orderby}`);
              if (params.options?.expand) ps.push(`$expand=${params.options.expand}`);
            }
            if (ps.length) path += "?" + ps.join("&");

            // Server-driven paging: a maxpagesize Prefer caps the page and makes Dataverse return
            // an @odata.nextLink for the next page (used by System Ops "Load more").
            const pageHeader = params.options?.maxpagesize
              ? { Prefer: `odata.maxpagesize=${Math.min(Math.max(parseInt(params.options.maxpagesize, 10) || 100, 1), 5000)}` }
              : null;

            let data;
            try {
              data = await dvRequest("GET", path, null, pageHeader);
            } catch (queryErr) {
              // Safety net: if 400 with "Could not find a property", retry without $select
              if (queryErr.message?.includes("400") && queryErr.message?.includes("property") && params.options?.select) {
                let fallbackPath = params.entitySet;
                const fps = [];
                if (!isDirectFetch) {
                  if (params.options?.filter) fps.push(`$filter=${params.options.filter}`);
                  if (params.options?.top) fps.push(`$top=${params.options.top}`);
                  if (params.options?.orderby) fps.push(`$orderby=${params.options.orderby}`);
                  if (params.options?.expand) fps.push(`$expand=${params.options.expand}`);
                }
                if (fps.length) fallbackPath += "?" + fps.join("&");
                data = await dvRequest("GET", fallbackPath, null, pageHeader);
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


          case "queryRaw": {
            // Send the OData path exactly as-is — no parsing/reconstruction
            let rawPath = params.path;
            if (!rawPath) throw new Error("Missing path");
            // Validate the entity set name (part before ? or ()
            const baseName = rawPath.split(/[(?/$]/)[0];
            if (!baseName || !SAFE_NAME.test(baseName)) throw new Error(`Invalid path: "${rawPath}"`);
            const data = await dvRequest("GET", rawPath);
            // Detect single-record fetch (path contains GUID in parentheses before query string)
            const isDirectFetch = /^[^?]*\(/.test(rawPath);
            if (isDirectFetch) {
              result = { records: [data], count: 1 };
            } else {
              result = { records: data.value || [], count: data.value?.length || 0, nextLink: data["@odata.nextLink"] };
            }
            break;
          }

          case "customRequest": {
            // Ad-hoc request runner for the API Tester module. Returns the raw
            // response (status, headers, body, elapsed) without throwing —
            // user wants to inspect 4xx/5xx responses, not have them swallowed.
            const method = (params.method || "GET").toUpperCase();
            const ALLOWED = new Set(["GET","POST","PATCH","PUT","DELETE","HEAD","OPTIONS"]);
            if (!ALLOWED.has(method)) throw new Error(`Method not allowed: ${method}`);
            const path = params.path || "";
            if (!path) throw new Error("Missing path");
            // Only allow same-org URLs. Block anything pointing outside the user's Dataverse instance.
            const ctxApi = d365Context || extractContext();
            if (!ctxApi) throw new Error("D365 context not found");
            const baseHost = new URL(ctxApi.clientUrl).hostname;
            let url;
            if (path.startsWith("http://") || path.startsWith("https://")) {
              const u = new URL(path);
              if (u.hostname !== baseHost) throw new Error(`URL not allowed: ${u.hostname} is not your D365 org host (${baseHost})`);
              url = path;
            } else {
              const trimmed = path.startsWith("/") ? path : `/${path}`;
              url = `${ctxApi.clientUrl}${trimmed}`;
            }
            // Defense-in-depth: re-parse the FINAL url and re-assert the host, so protocol-relative
            // (//evil.com) or backslash-normalized paths can never drift off the org host.
            try {
              const finalHost = new URL(url, ctxApi.clientUrl).hostname;
              if (finalHost !== baseHost) throw new Error(`URL not allowed: resolved host ${finalHost} is not your D365 org host (${baseHost})`);
            } catch (e) { throw new Error(e.message || "Invalid URL"); }
            const customHeaders = params.headers && typeof params.headers === "object" ? params.headers : {};
            const finalHeaders = {
              "Accept": "application/json",
              "OData-MaxVersion": "4.0",
              "OData-Version": "4.0",
              ...customHeaders,
            };
            const hasBody = (method !== "GET" && method !== "HEAD" && params.body != null && params.body !== "");
            if (hasBody && !finalHeaders["Content-Type"] && !finalHeaders["content-type"]) {
              finalHeaders["Content-Type"] = "application/json";
            }
            const t0 = Date.now();
            const ctrl = new AbortController();
            const tmo = setTimeout(() => ctrl.abort(), 60000);
            try {
              const resp = await fetch(url, {
                method,
                headers: finalHeaders,
                body: hasBody ? (typeof params.body === "string" ? params.body : JSON.stringify(params.body)) : undefined,
                credentials: "same-origin",
                signal: ctrl.signal,
              });
              clearTimeout(tmo);
              const elapsed = Date.now() - t0;
              const respHeaders = {};
              resp.headers.forEach((v, k) => { respHeaders[k] = v; });
              const ct = resp.headers.get("content-type") || "";
              let bodyText = "";
              try { bodyText = await resp.text(); } catch {}
              let bodyParsed = null;
              if (ct.includes("application/json") && bodyText) {
                try { bodyParsed = JSON.parse(bodyText); } catch {}
              }
              result = {
                ok: resp.ok,
                status: resp.status,
                statusText: resp.statusText,
                headers: respHeaders,
                body: bodyText,
                bodyParsed,
                elapsed,
                url,
              };
            } catch (e) {
              clearTimeout(tmo);
              result = {
                ok: false,
                status: 0,
                statusText: e.name === "AbortError" ? "Timeout (60s)" : "Network error",
                headers: {},
                body: e.message || String(e),
                bodyParsed: null,
                elapsed: Date.now() - t0,
                url,
                clientError: true,
              };
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
            const results = { created: 0, errors: [], log: [] };
            const STRIP = new Set(["createdon","modifiedon","createdby","modifiedby","ownerid","owningbusinessunit","owningteam","owninguser","versionnumber","importsequencenumber","overriddencreatedon","timezoneruleversionnumber","utcconversiontimezonecode"]);
            validateEntitySet(entitySet);
            // Process the whole received slice as ONE HTTP $batch (capped at 500). The panel-side
            // worker pool already chunks to the user's batch size, so this avoids re-chunking into
            // sequential 100-op sub-batches — fewer roundtrips (faster) and a snappier cancel
            // (a worker drains in one roundtrip, not several, before it sees the abort flag).
            const BATCH_SIZE = 500;
            const ctx = d365Context || extractContext();
            if (!ctx) throw new Error("D365 context not found");
            const baseUrl = `${ctx.clientUrl}/api/data/${ctx.apiVersion}`;

            // Microsoft-documented bypass headers — go on each individual request
            // inside the multipart body, NOT on the outer $batch envelope.
            // Requires prvBypassCustomPlugins privilege (typically System Administrator).
            const bypassHeaderLines = [
              params.bypassPlugins ? "MSCRM.BypassCustomPluginExecution: true" : null,
              params.suppressDuplicates ? "MSCRM.SuppressDuplicateDetection: true" : null,
              params.bypassSyncLogic ? "MSCRM.BypassSynchronousLogic: true" : null,
            ].filter(Boolean).map(l => l + "\r\n").join("");

            const buildClean = (rec) => {
              const c = {};
              for (const [k, v] of Object.entries(rec)) { if (!STRIP.has(k)) c[k] = v; }
              return c;
            };

            const parseBatchResponse = (text, batchOffset, chunkLen) => {
              const log = [];
              const blocks = text.split(/Content-Type:\s*application\/http/i);
              for (let i = 1; i < blocks.length && i <= chunkLen; i++) {
                const block = blocks[i];
                const statusMatch = block.match(/HTTP\/1\.1\s+(\d{3})/);
                if (!statusMatch) continue;
                const status = parseInt(statusMatch[1], 10);
                const rowIdx = batchOffset + i;
                if (status === 204 || status === 201) {
                  // Capture the created record's GUID (OData-EntityId header) — fuels the
                  // post-import Rollback feature and id display in the log.
                  const idMatch = block.match(/OData-EntityId:[^(]*\(([0-9a-f-]{36})\)/i);
                  log.push({ row: rowIdx, status: "CREATED", id: idMatch ? idMatch[1] : "" });
                } else {
                  const msgMatch = block.match(/"message":"([^"]{0,300})"/);
                  log.push({ row: rowIdx, status: "ERROR", msg: msgMatch ? msgMatch[1] : `HTTP ${status}` });
                }
              }
              return log;
            };

            for (let batch = 0; batch < records.length; batch += BATCH_SIZE) {
              if (batchAborted) break; // user cancelled — stop sending further chunks
              const chunk = records.slice(batch, batch + BATCH_SIZE);
              const boundary = "batch_d365_" + Date.now() + "_" + batch;

              // One changeset per record → per-record granularity
              let body = "";
              for (let i = 0; i < chunk.length; i++) {
                const csName = "cs_" + Date.now() + "_" + (batch + i);
                const clean = buildClean(chunk[i]);
                body += "--" + boundary + "\r\n";
                body += "Content-Type: multipart/mixed; boundary=" + csName + "\r\n\r\n";
                body += "--" + csName + "\r\n";
                body += "Content-Type: application/http\r\nContent-Transfer-Encoding: binary\r\n";
                body += "Content-ID: " + (batch + i + 1) + "\r\n\r\n";
                body += "POST " + baseUrl + "/" + entitySet + " HTTP/1.1\r\n";
                body += "Content-Type: application/json\r\n";
                body += bypassHeaderLines;
                body += "\r\n";
                body += JSON.stringify(clean) + "\r\n";
                body += "--" + csName + "--\r\n";
              }
              body += "--" + boundary + "--\r\n";

              try {
                const resp = await fetchBatchWithRetry(baseUrl + "/$batch", {
                  method: "POST",
                  headers: { "Content-Type": "multipart/mixed; boundary=" + boundary, "OData-MaxVersion": "4.0", "OData-Version": "4.0", "Accept": "application/json" },
                  body,
                  credentials: "same-origin",
                });
                if (resp.ok) {
                  const respText = await resp.text();
                  const chunkLog = parseBatchResponse(respText, batch, chunk.length);
                  for (const entry of chunkLog) {
                    if (entry.status === "ERROR") {
                      results.errors.push({ row: entry.row, msg: entry.msg || "Batch error", payload: "" });
                    } else {
                      results.created++;
                    }
                    results.log.push(entry);
                  }
                  if (chunkLog.length < chunk.length) {
                    for (let i = chunkLog.length; i < chunk.length; i++) {
                      results.log.push({ row: batch + i + 1, status: "ERROR", msg: "No response received from batch" });
                      results.errors.push({ row: batch + i + 1, msg: "No response received from batch", payload: "" });
                    }
                  }
                } else {
                  for (let i = 0; i < chunk.length; i++) {
                    const rowIdx = batch + i + 1;
                    try {
                      await dvRequest("POST", entitySet, buildClean(chunk[i]));
                      results.created++;
                      results.log.push({ row: rowIdx, status: "CREATED" });
                    } catch (e) {
                      const msg = e.message?.substring(0, 500) || "Error";
                      results.errors.push({ row: rowIdx, msg, payload: JSON.stringify(chunk[i]).substring(0, 200) });
                      results.log.push({ row: rowIdx, status: "ERROR", msg });
                    }
                  }
                }
              } catch (batchErr) {
                for (let i = 0; i < chunk.length; i++) {
                  const rowIdx = batch + i + 1;
                  try {
                    await dvRequest("POST", entitySet, buildClean(chunk[i]));
                    results.created++;
                    results.log.push({ row: rowIdx, status: "CREATED" });
                  } catch (e) {
                    const msg = e.message?.substring(0, 500) || "Error";
                    results.errors.push({ row: rowIdx, msg, payload: JSON.stringify(chunk[i]).substring(0, 200) });
                    results.log.push({ row: rowIdx, status: "ERROR", msg });
                  }
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
            const results = { updated: 0, errors: [], log: [] };
            const STRIP = new Set(["createdon","modifiedon","createdby","modifiedby","ownerid","owningbusinessunit","owningteam","owninguser","versionnumber","importsequencenumber","overriddencreatedon","timezoneruleversionnumber","utcconversiontimezonecode"]);
            validateEntitySet(entitySet);
            validateName(keyField, 'keyField');
            // One HTTP $batch per received slice (capped 500) — see batchCreate for rationale.
            const BATCH_SIZE = 500;
            const ctx = d365Context || extractContext();
            if (!ctx) throw new Error("D365 context not found");
            const baseUrl = `${ctx.clientUrl}/api/data/${ctx.apiVersion}`;

            // Per-record request headers. `If-Match: *` forces UPDATE-ONLY semantics:
            // Dataverse updates an existing record but returns 404 instead of creating one
            // when it's missing (vs. plain PATCH-by-key which upserts). Plus the MSCRM bypass headers.
            const bypassHeaderLines = [
              params.updateOnly ? "If-Match: *" : null,
              params.bypassPlugins ? "MSCRM.BypassCustomPluginExecution: true" : null,
              params.suppressDuplicates ? "MSCRM.SuppressDuplicateDetection: true" : null,
              params.bypassSyncLogic ? "MSCRM.BypassSynchronousLogic: true" : null,
            ].filter(Boolean).map(l => l + "\r\n").join("");

            // Sanitize the key value before it goes into the multipart request line — prevents
            // changeset break-out / HTTP-request injection when a CSV key column contains \r\n or
            // path metacharacters (malformed or hostile data). Done per-record, no chunk abort.
            const stripCtrl = (v) => String(v ?? "").replace(/[\x00-\x1f\x7f]/g, "");
            const buildPath = (item) => {
              if (isPrimaryKey) {
                // PK upsert: value is a bare GUID inside (…) with no quotes — strip anything that
                // isn't a GUID character so a malicious value can't inject path segments. A
                // non-GUID result just yields a clean per-record 400/404, not an injection.
                const guid = stripCtrl(item.keyValue).replace(/[^0-9a-fA-F-]/g, "");
                return `${entitySet}(${guid})`;
              }
              // Alt-key upsert: value sits inside '…' (OData string literal). Escaping quotes +
              // stripping control chars is sufficient; ) or / inside quotes can't break out.
              return `${entitySet}(${keyField}='${stripCtrl(item.keyValue).replace(/'/g, "''")}')`;
            };
            const buildClean = (item) => {
              const c = {};
              for (const [k, v] of Object.entries(item.record)) {
                if (STRIP.has(k)) continue;
                if (k === keyField) continue; // key addresses the record via the URL — never in the body
                c[k] = v;
              }
              return c;
            };

            // Parse a $batch response with one changeset per record (positional mapping).
            // Returns per-row log entries: {row, status, msg?}.
            const parseBatchResponse = (text, batchOffset, chunkLen) => {
              const log = [];
              // Each individual response within the batch starts with "Content-Type: application/http"
              const blocks = text.split(/Content-Type:\s*application\/http/i);
              // First block is the multipart preamble, skip it
              for (let i = 1; i < blocks.length && i <= chunkLen; i++) {
                const block = blocks[i];
                const statusMatch = block.match(/HTTP\/1\.1\s+(\d{3})/);
                if (!statusMatch) continue;
                const status = parseInt(statusMatch[1], 10);
                const rowIdx = batchOffset + i; // 1-based row index within the full items array
                if (status === 201) {
                  // Upsert that CREATED a record — capture its GUID (like batchCreate) so the
                  // post-run Rollback can delete it. Without this, upsert-created records are
                  // tagged CREATED but never enter the rollback list.
                  const idMatch = block.match(/OData-EntityId:[^(]*\(([0-9a-f-]{36})\)/i);
                  log.push({ row: rowIdx, status: "CREATED", id: idMatch ? idMatch[1] : "" });
                } else if (status === 204) {
                  log.push({ row: rowIdx, status: "UPSERTED" });
                } else {
                  const msgMatch = block.match(/"message":"([^"]{0,300})"/);
                  log.push({ row: rowIdx, status: "ERROR", msg: msgMatch ? msgMatch[1] : `HTTP ${status}` });
                }
              }
              return log;
            };

            for (let batch = 0; batch < items.length; batch += BATCH_SIZE) {
              if (batchAborted) break; // user cancelled — stop sending further chunks
              const chunk = items.slice(batch, batch + BATCH_SIZE);
              const boundary = "batch_d365_" + Date.now() + "_" + batch;

              // One changeset per record → per-record atomicity, errors don't cascade.
              // Still a single HTTP roundtrip for the whole chunk.
              let body = "";
              for (let i = 0; i < chunk.length; i++) {
                const csName = "cs_" + Date.now() + "_" + (batch + i);
                const clean = buildClean(chunk[i]);
                const path = buildPath(chunk[i]);
                body += "--" + boundary + "\r\n";
                body += "Content-Type: multipart/mixed; boundary=" + csName + "\r\n\r\n";
                body += "--" + csName + "\r\n";
                body += "Content-Type: application/http\r\nContent-Transfer-Encoding: binary\r\n";
                body += "Content-ID: " + (batch + i + 1) + "\r\n\r\n";
                body += "PATCH " + baseUrl + "/" + path + " HTTP/1.1\r\n";
                body += "Content-Type: application/json\r\n";
                body += bypassHeaderLines;
                body += "\r\n";
                body += JSON.stringify(clean) + "\r\n";
                body += "--" + csName + "--\r\n";
              }
              body += "--" + boundary + "--\r\n";

              try {
                const resp = await fetchBatchWithRetry(baseUrl + "/$batch", {
                  method: "POST",
                  headers: { "Content-Type": "multipart/mixed; boundary=" + boundary, "OData-MaxVersion": "4.0", "OData-Version": "4.0", "Accept": "application/json" },
                  body,
                  credentials: "same-origin",
                });
                if (resp.ok) {
                  const respText = await resp.text();
                  const chunkLog = parseBatchResponse(respText, batch, chunk.length);
                  for (const entry of chunkLog) {
                    if (entry.status === "ERROR") {
                      results.errors.push({ row: entry.row, msg: entry.msg || "Batch error", payload: "" });
                    } else {
                      results.updated++;
                    }
                    results.log.push(entry);
                  }
                  // Pad missing entries (parser couldn't extract — mark as unknown)
                  if (chunkLog.length < chunk.length) {
                    for (let i = chunkLog.length; i < chunk.length; i++) {
                      results.log.push({ row: batch + i + 1, status: "ERROR", msg: "No response received from batch" });
                      results.errors.push({ row: batch + i + 1, msg: "No response received from batch", payload: "" });
                    }
                  }
                } else {
                  // Batch endpoint failed entirely — fall back to serial PATCH for this chunk
                  for (let i = 0; i < chunk.length; i++) {
                    const rowIdx = batch + i + 1;
                    try {
                      await dvRequest("PATCH", buildPath(chunk[i]), buildClean(chunk[i]), params.updateOnly ? { "If-Match": "*" } : null);
                      results.updated++;
                      results.log.push({ row: rowIdx, status: "UPSERTED" });
                    } catch (e) {
                      const msg = e.message?.substring(0, 500) || "Error";
                      results.errors.push({ row: rowIdx, msg, payload: JSON.stringify(chunk[i].record).substring(0, 200) });
                      results.log.push({ row: rowIdx, status: "ERROR", msg });
                    }
                  }
                }
              } catch (batchErr) {
                // Network/transport failure — same fallback
                for (let i = 0; i < chunk.length; i++) {
                  const rowIdx = batch + i + 1;
                  try {
                    await dvRequest("PATCH", buildPath(chunk[i]), buildClean(chunk[i]), params.updateOnly ? { "If-Match": "*" } : null);
                    results.updated++;
                    results.log.push({ row: rowIdx, status: "UPSERTED" });
                  } catch (e) {
                    const msg = e.message?.substring(0, 500) || "Error";
                    results.errors.push({ row: rowIdx, msg, payload: JSON.stringify(chunk[i].record).substring(0, 200) });
                    results.log.push({ row: rowIdx, status: "ERROR", msg });
                  }
                }
              }
            }
            result = results;
            break;
          }

          case "batchDeleteKeyed": {
            // Bulk DELETE by primary key (GUID) or alternate key, via multipart $batch with
            // one changeset per record (per-record log, errors don't cascade). Mirrors batchUpsert.
            const items = params.items || []; // [{ keyValue }]
            const entitySet = params.entitySet;
            const keyField = params.keyField;
            const isPrimaryKey = params.isPrimaryKey || false;
            const results = { deleted: 0, errors: [], log: [] };
            validateEntitySet(entitySet);
            validateName(keyField, 'keyField');
            const BATCH_SIZE = 500;
            const ctx = d365Context || extractContext();
            if (!ctx) throw new Error("D365 context not found");
            const baseUrl = `${ctx.clientUrl}/api/data/${ctx.apiVersion}`;

            const stripCtrl = (v) => String(v ?? "").replace(/[\x00-\x1f\x7f]/g, "");
            const buildPath = (item) => {
              if (isPrimaryKey) {
                const guid = stripCtrl(item.keyValue).replace(/[^0-9a-fA-F-]/g, "");
                return `${entitySet}(${guid})`;
              }
              return `${entitySet}(${keyField}='${stripCtrl(item.keyValue).replace(/'/g, "''")}')`;
            };

            const parseBatchResponse = (text, batchOffset, chunkLen) => {
              const log = [];
              const blocks = text.split(/Content-Type:\s*application\/http/i);
              for (let i = 1; i < blocks.length && i <= chunkLen; i++) {
                const block = blocks[i];
                const statusMatch = block.match(/HTTP\/1\.1\s+(\d{3})/);
                if (!statusMatch) continue;
                const status = parseInt(statusMatch[1], 10);
                const rowIdx = batchOffset + i;
                if (status === 204 || status === 200) {
                  log.push({ row: rowIdx, status: "DELETED" });
                } else {
                  const msgMatch = block.match(/"message":"([^"]{0,300})"/);
                  log.push({ row: rowIdx, status: "ERROR", msg: msgMatch ? msgMatch[1] : `HTTP ${status}` });
                }
              }
              return log;
            };

            for (let batch = 0; batch < items.length; batch += BATCH_SIZE) {
              if (batchAborted) break; // user cancelled — stop sending further chunks
              const chunk = items.slice(batch, batch + BATCH_SIZE);
              const boundary = "batch_d365_" + Date.now() + "_" + batch;
              let body = "";
              for (let i = 0; i < chunk.length; i++) {
                const csName = "cs_" + Date.now() + "_" + (batch + i);
                const path = buildPath(chunk[i]);
                body += "--" + boundary + "\r\n";
                body += "Content-Type: multipart/mixed; boundary=" + csName + "\r\n\r\n";
                body += "--" + csName + "\r\n";
                body += "Content-Type: application/http\r\nContent-Transfer-Encoding: binary\r\n";
                body += "Content-ID: " + (batch + i + 1) + "\r\n\r\n";
                body += "DELETE " + baseUrl + "/" + path + " HTTP/1.1\r\n\r\n";
                body += "--" + csName + "--\r\n";
              }
              body += "--" + boundary + "--\r\n";

              try {
                const resp = await fetchBatchWithRetry(baseUrl + "/$batch", {
                  method: "POST",
                  headers: { "Content-Type": "multipart/mixed; boundary=" + boundary, "OData-MaxVersion": "4.0", "OData-Version": "4.0", "Accept": "application/json" },
                  body,
                  credentials: "same-origin",
                });
                if (resp.ok) {
                  const respText = await resp.text();
                  const chunkLog = parseBatchResponse(respText, batch, chunk.length);
                  for (const entry of chunkLog) {
                    if (entry.status === "ERROR") results.errors.push({ row: entry.row, msg: entry.msg || "Batch error", payload: "" });
                    else results.deleted++;
                    results.log.push(entry);
                  }
                  if (chunkLog.length < chunk.length) {
                    for (let i = chunkLog.length; i < chunk.length; i++) {
                      results.log.push({ row: batch + i + 1, status: "ERROR", msg: "No response received from batch" });
                      results.errors.push({ row: batch + i + 1, msg: "No response received from batch", payload: "" });
                    }
                  }
                } else {
                  for (let i = 0; i < chunk.length; i++) {
                    const rowIdx = batch + i + 1;
                    try { await dvRequest("DELETE", buildPath(chunk[i])); results.deleted++; results.log.push({ row: rowIdx, status: "DELETED" }); }
                    catch (e) { const msg = e.message?.substring(0, 500) || "Error"; results.errors.push({ row: rowIdx, msg, payload: "" }); results.log.push({ row: rowIdx, status: "ERROR", msg }); }
                  }
                }
              } catch (batchErr) {
                for (let i = 0; i < chunk.length; i++) {
                  const rowIdx = batch + i + 1;
                  try { await dvRequest("DELETE", buildPath(chunk[i])); results.deleted++; results.log.push({ row: rowIdx, status: "DELETED" }); }
                  catch (e) { const msg = e.message?.substring(0, 500) || "Error"; results.errors.push({ row: rowIdx, msg, payload: "" }); results.log.push({ row: rowIdx, status: "ERROR", msg }); }
                }
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

          case "getEntityKeys": {
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
          case "upsert": {
            validateEntitySet(params.entitySet);
            validateName(params.keyField, 'keyField');
            // Strip control chars (CR/LF) like the batch path, then quote-escape — no request-line drift.
            const keyVal = String(params.keyValue ?? "").replace(/[\x00-\x1f\x7f]/g, "").replace(/'/g, "''");
            result = await dvRequest("PATCH", `${params.entitySet}(${params.keyField}='${keyVal}')`, params.data);
            break;
          }
          case "getCurrentRecord":
            result = getCurrentRecord();
            break;
          // Bulk-run cancellation: the bridge resets the flag when a run starts and sets it when
          // the user cancels — so retries/chunks already inside the content script stop too.
          case "resetBatchAbort":
            batchAborted = false;
            result = { ok: true };
            break;
          case "abortBatch":
            batchAborted = true;
            result = { ok: true };
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
            // Full set of Dataverse-provisionable MUI languages (LCID → name). Anything outside
            // this list still falls back to "LCID <code>" rather than crashing. Note the easy
            // confusions: 1046 Portuguese (Brazil) vs 2070 Portuguese (Portugal); 3082 Spanish
            // (modern) vs 1034 Spanish (legacy sort); 2052 Chinese (Simplified) vs 1028 (Traditional).
            const LANG_NAMES = {1025:"Arabic",1026:"Bulgarian",1027:"Catalan",1028:"Chinese (Traditional)",1029:"Czech",1030:"Danish",1031:"German",1032:"Greek",1033:"English",1034:"Spanish (legacy)",1035:"Finnish",1036:"French",1037:"Hebrew",1038:"Hungarian",1040:"Italian",1041:"Japanese",1042:"Korean",1043:"Dutch",1044:"Norwegian",1045:"Polish",1046:"Portuguese (Brazil)",1048:"Romanian",1049:"Russian",1050:"Croatian",1051:"Slovak",1053:"Swedish",1054:"Thai",1055:"Turkish",1057:"Indonesian",1058:"Ukrainian",1060:"Slovenian",1061:"Estonian",1062:"Latvian",1063:"Lithuanian",1066:"Vietnamese",1069:"Basque",1081:"Hindi",1086:"Malay",1087:"Kazakh",1110:"Galician",2052:"Chinese (Simplified)",2070:"Portuguese (Portugal)",3076:"Chinese (Hong Kong)",3082:"Spanish"};
            const codes = data?.LocaleIds || [];
            result = codes.map(c => ({ code: c, name: LANG_NAMES[c] || `LCID ${c}` }));
            break;
          }
          case "getAttributeLabels": {
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
            break;
          }
          case "updateAttributeLabel": {
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
            const ctx2 = d365Context || extractContext();
            const putUrl = `${ctx2.clientUrl}/api/data/${ctx2.apiVersion}/EntityDefinitions(LogicalName='${params.entityName}')/Attributes(LogicalName='${params.attributeName}')${castSegment}`;
            const putResp = await fetch(putUrl, {
              method: "PUT",
              headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "OData-MaxVersion": "4.0",
                "OData-Version": "4.0",
                "MSCRM.MergeLabels": "true"
              },
              body: JSON.stringify(fullAttr),
              credentials: "same-origin"
            });
            if (!putResp.ok) {
              const errText = await putResp.text();
              let msg = `HTTP ${putResp.status}`;
              try { msg = `HTTP ${putResp.status}: ${JSON.parse(errText).error?.message || errText}`; } catch {}
              throw new Error(msg);
            }
            result = { ok: true };
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
            // Only simple, universally-selectable EntityMetadata properties here. The managed
            // property CanBeDeleted is NOT $select-able on every org/API version ("Could not find
            // a property named 'CanBeDeleted'"), so it must never be in the core query.
            const meta = await dvRequest("GET",
              `EntityDefinitions(LogicalName='${params.logicalName}')?$select=DisplayName,PrimaryNameAttribute,PrimaryIdAttribute,EntitySetName`
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
            };
            break;
          }

          // ── User & License Monitor ──
          case "getAllUsers": {
            const ACCESS_MODES = { 0: "Read-Write", 1: "Admin", 2: "Read", 3: "Support", 4: "Non-Interactive", 5: "Delegated Admin" };
            const CAL_TYPES = { 0: "Full", 1: "Admin", 2: "Basic", 3: "Device Full", 4: "Device Basic", 5: "Essential", 6: "Device Essential", 7: "Enterprise", 8: "Device Enterprise", 9: "Sales", 10: "Service", 11: "Field Service", 12: "Project Service" };
            const fields = "systemuserid,fullname,internalemailaddress,isdisabled,accessmode,caltype,title,createdon,_businessunitid_value";
            const mapUser = (u) => ({
              id: u.systemuserid,
              fullname: u.fullname || "",
              email: u.internalemailaddress || "",
              disabled: u.isdisabled,
              accessMode: u.accessmode ?? 0,
              accessModeLabel: ACCESS_MODES[u.accessmode] || `Mode ${u.accessmode}`,
              calType: u.caltype ?? 0,
              calTypeLabel: CAL_TYPES[u.caltype] || `Type ${u.caltype}`,
              buName: u["_businessunitid_value@OData.Community.Display.V1.FormattedValue"] || "",
              buId: u._businessunitid_value || "",
              title: u.title || "",
              createdOn: u.createdon,
            });
            // Cursor-based pagination: fetch in batches ordered by systemuserid,
            // each page filters systemuserid > lastId. This avoids paging cookie
            // and nextLink issues on the systemuser entity.
            let allUsers = [];
            let lastId = "00000000-0000-0000-0000-000000000000";
            let pageNum = 0;
            while (pageNum < 50) { // safety cap: 50 pages * 5000 = 250k users
              pageNum++;
              const filterPart = `systemuserid gt ${lastId}`;
              const data = await dvRequest("GET",
                `systemusers?$select=${fields}&$filter=${filterPart}&$orderby=systemuserid asc&$top=5000`
              );
              const records = data.value || [];
              if (records.length === 0) break;
              allUsers = allUsers.concat(records.map(mapUser));
              lastId = records[records.length - 1].systemuserid;
              if (records.length < 5000) break; // last page
            }
            allUsers.sort((a, b) => a.fullname.localeCompare(b.fullname));
            result = allUsers;
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

          // ── Security Audit ──
          case "getAllRoles": {
            // Get the root business unit first (roles with this BU are the "root" copies)
            let rootBuId = null;
            try {
              const buData = await dvRequest("GET", "businessunits?$select=businessunitid&$filter=parentbusinessunitid eq null&$top=1");
              rootBuId = (buData.value || [])[0]?.businessunitid;
            } catch {}

            // Fetch roles — if we have root BU, filter to only root copies (no duplicates)
            let allRaw = [];
            let rolesUrl = rootBuId
              ? `roles?$select=roleid,name,ismanaged,iscustomizable,_businessunitid_value,_parentrootroleid_value&$filter=_businessunitid_value eq ${rootBuId}&$orderby=name asc`
              : "roles?$select=roleid,name,ismanaged,iscustomizable,_businessunitid_value,_parentrootroleid_value&$orderby=name asc";
            while (rolesUrl) {
              const data = await dvRequest("GET", rolesUrl);
              allRaw = allRaw.concat(data.value || []);
              const rnl = data["@odata.nextLink"];
              if (rnl) {
                try { rolesUrl = rnl.replace(/^.*\/api\/data\/v[\d.]+\//, ""); } catch { rolesUrl = null; }
              } else { rolesUrl = null; }
            }

            // Deduplicate by root role ID (in case filter didn't work perfectly)
            const seen = new Set();
            const roles = [];
            for (const r of allRaw) {
              const rootId = r._parentrootroleid_value || r.roleid;
              if (seen.has(rootId)) continue;
              seen.add(rootId);
              roles.push({
                id: r.roleid,
                rootId,
                name: r.name,
                isManaged: r.ismanaged,
                isCustom: !r.ismanaged,
                buName: r["_businessunitid_value@OData.Community.Display.V1.FormattedValue"] || "",
              });
            }
            result = roles;
            break;
          }

          case "getRolePrivileges": {
            validateGuid(params.roleId);
            // Use RetrieveRolePrivilegesRole function to get privileges with depth
            const data = await dvRequest("GET",
              `RetrieveRolePrivilegesRole(RoleId=${params.roleId})`
            );
            const privs = data.RolePrivileges || [];
            if (privs.length === 0) { result = []; break; }

            // Load ALL privileges once and cache in-memory (shared across role clicks)
            // Uses FetchXML pagination (page numbers) which is more reliable than @odata.nextLink
            if (!window.__colvioPrivCache) {
              window.__colvioPrivCache = {};
              let allPrivList = [];
              let page = 1;
              let hasMore = true;
              while (hasMore) {
                const fetchXml = `<fetch page="${page}" count="5000"><entity name="privilege"><attribute name="privilegeid"/><attribute name="name"/><attribute name="accessright"/><order attribute="privilegeid"/></entity></fetch>`;
                const pData = await dvRequest("GET", `privileges?fetchXml=${encodeURIComponent(fetchXml)}`);
                const batch = pData.value || [];
                allPrivList = allPrivList.concat(batch);
                hasMore = batch.length === 5000;
                page++;
              }
              allPrivList.forEach(p => { window.__colvioPrivCache[p.privilegeid] = { name: p.name, accessRight: p.accessright }; });
            }
            const privMap = window.__colvioPrivCache;

            const DEPTH_LABELS = { 1: "User", 2: "Business Unit", 4: "Parent: Child BU", 8: "Organization" };
            const DEPTH_MAP = { "Basic": 1, "Local": 2, "Deep": 4, "Global": 8 };
            result = privs.map(p => {
              const info = privMap[p.PrivilegeId] || {};
              const depth = typeof p.Depth === "string" ? (DEPTH_MAP[p.Depth] || 0) : (p.Depth || 0);
              return {
                id: p.PrivilegeId,
                name: info.name || p.PrivilegeId,
                accessRight: info.accessRight,
                depth,
                depthLabel: DEPTH_LABELS[depth] || `Depth ${depth}`,
                isOrg: depth === 8,
              };
            }).sort((a, b) => {
              if (a.isOrg !== b.isOrg) return a.isOrg ? -1 : 1;
              return a.name.localeCompare(b.name);
            });
            break;
          }

          case "getRoleUserCount": {
            validateGuid(params.roleId);
            const data = await dvRequest("GET",
              `roles(${params.roleId})/systemuserroles_association?$select=systemuserid&$count=true`
            );
            result = { count: (data.value || []).length };
            break;
          }

          case "probe": {
            // Lightweight permission probe — returns true if endpoint is accessible
            await dvRequest("GET", params.url);
            result = true;
            break;
          }

          case "recordAuditTrail": {
            // Audit rows for one record (who / when / action). The Web API version of
            // RetrieveRecordChangeHistory does NOT include the AuditRecord (user/date) --
            // documented limitation -- so we list the audit table and fetch per-audit
            // details on demand (RetrieveAuditDetails). Requires auditing enabled
            // (org + table) and the prvReadAuditSummary privilege.
            validateGuid(params.id);
            const topA = Math.min(Math.max(parseInt(params.top, 10) || 50, 1), 200);
            const trail = await dvRequest("GET",
              `audits?$filter=_objectid_value eq ${params.id}&$orderby=createdon desc&$top=${topA}&$select=auditid,action,operation,createdon,_userid_value`);
            result = trail?.value || [];
            break;
          }

          case "auditDetails": {
            // Field-level old->new diff for one audit row (RetrieveAuditDetails function).
            validateGuid(params.auditId);
            result = await dvRequest("GET", `audits(${params.auditId})/Microsoft.Dynamics.CRM.RetrieveAuditDetails()`);
            break;
          }

          case "orgFeatures": {
            // ONE consolidated probe for org-level feature switches that gate Colvio modules:
            //  - isauditenabled        → Login History + record Change History
            //  - plugintracelogsetting → Plugin Traces (0 Off / 1 Exception / 2 All)
            //  - recyclebinconfig row  → Recycle Bin (+ retention days)
            // Two GETs total; the bridge caches the result so the panel pays this at most
            // once per session — module tabs/banners read it, they never re-probe.
            const out = { auditEnabled: null, pluginTraceSetting: null, recycleBin: { enabled: false, retentionDays: null } };
            try {
              const org = await dvRequest("GET", "organizations?$select=isauditenabled,plugintracelogsetting&$top=1");
              const row = org?.value?.[0];
              if (row) {
                out.auditEnabled = row.isauditenabled !== false;
                out.pluginTraceSetting = typeof row.plugintracelogsetting === "number" ? row.plugintracelogsetting : null;
              }
            } catch { /* unknown — fail-open (null = don't gate) */ }
            try {
              const r = await dvRequest("GET", "recyclebinconfigs?$select=cleanupintervalindays,statecode&$filter=name eq 'organization'");
              const row = r?.value?.[0];
              out.recycleBin = { enabled: !!row && row.statecode === 0, retentionDays: row?.cleanupintervalindays ?? null };
            } catch { out.recycleBin = { enabled: false, unknown: true }; }
            result = out;
            break;
          }

          case "recycleBinStatus": {
            // Is Dataverse "Keep deleted records" (recycle bin) enabled for this org?
            // Enabled ⇔ a recyclebinconfig row named 'organization' exists and is active.
            // Its cleanupintervalindays is the org-wide retention (1-30 days).
            // Docs: learn.microsoft.com/power-platform/admin/restore-deleted-table-records
            try {
              const r = await dvRequest("GET", "recyclebinconfigs?$select=cleanupintervalindays,statecode&$filter=name eq 'organization'");
              const row = r?.value?.[0];
              result = { enabled: !!row && row.statecode === 0, retentionDays: row?.cleanupintervalindays ?? null };
            } catch (e) {
              // Table missing (older org) or no read privilege — report unknown, never throw.
              result = { enabled: false, unknown: true, error: e.message?.substring(0, 200) };
            }
            break;
          }

          case "deletesByEntity": {
            // Best-effort: WHO deleted / WHEN, from the audit log (action=Delete) for one table.
            // "Deleted by" isn't a column on the bin record — the delete event lives in `audits`.
            // ONE query (not per-row) → map { objectIdLower: {by, on} }. null on failure / audit off.
            validateName(params.logicalName, "logicalName");
            try {
              const topD = Math.min(Math.max(parseInt(params.top, 10) || 2000, 1), 5000);
              const data = await dvRequest("GET",
                `audits?$select=_objectid_value,_userid_value,createdon&$filter=action eq 3 and objecttypecode eq '${params.logicalName}'&$orderby=createdon desc&$top=${topD}`);
              const map = {};
              for (const a of (data?.value || [])) {
                const oid = String(a._objectid_value || "").toLowerCase();
                if (oid && !map[oid]) map[oid] = { by: a["_userid_value@OData.Community.Display.V1.FormattedValue"] || "", on: a.createdon };
              }
              result = map;
            } catch { result = null; }
            break;
          }

          case "recycleBinTables": {
            // The tables ACTUALLY enabled for deleted-record keeping (Microsoft-documented
            // detection): recyclebinconfig rows with statecode=0 (active) and isreadyforrecyclebin=1,
            // joined to the entity table for the logical name. Returns logical names so the UI can
            // show only restorable tables. Returns null on failure/no-privilege → caller shows all.
            // Docs: learn.microsoft.com/power-apps/developer/data-platform/restore-deleted-records
            try {
              const xml = "<fetch><entity name='recyclebinconfig'>" +
                "<filter type='and'><condition attribute='statecode' operator='eq' value='0' />" +
                "<condition attribute='isreadyforrecyclebin' operator='eq' value='1' /></filter>" +
                "<link-entity name='entity' from='entityid' to='extensionofrecordid' link-type='inner' alias='ent'>" +
                "<attribute name='logicalname' /><order attribute='logicalname' /></link-entity></entity></fetch>";
              const data = await dvRequest("GET", `recyclebinconfigs?fetchXml=${encodeURIComponent(xml)}`);
              result = (data?.value || []).map(r => r["ent.logicalname"]).filter(Boolean);
            } catch { result = null; }
            break;
          }

          case "restoreRecord": {
            // Restore a deleted record from the recycle bin — unbound Restore action.
            // Target is an @odata.id reference (restore works by PRIMARY KEY only; the
            // platform does not support alternate keys for Restore).
            validateEntitySet(params.entitySet);
            validateGuid(params.id);
            const ctxR = d365Context || extractContext();
            if (!ctxR) throw new Error("D365 context not found");
            result = await dvRequest("POST", "Restore", {
              Target: { "@odata.id": `${ctxR.clientUrl}/api/data/${ctxR.apiVersion}/${params.entitySet}(${params.id})` },
            });
            break;
          }

          case "hasPrivilege": {
            // Does the current user hold a named privilege (through any of their roles)?
            // Used to refine UI gating (e.g. prvPublishCustomization → Translations read-only).
            // Returns true/false, or null when it couldn't be determined (callers fail-open:
            // the server re-enforces anyway, and blocking UI on a probe error would frustrate).
            try {
              validateName(params.privilegeName, "privilegeName");
              const who = await dvRequest("GET", "WhoAmI");
              if (!who?.UserId) { result = null; break; }
              const priv = await dvRequest("GET", `privileges?$select=privilegeid&$filter=name eq '${params.privilegeName}'`);
              const privId = priv?.value?.[0]?.privilegeid;
              if (!privId) { result = null; break; }
              const up = await dvRequest("GET", `systemusers(${who.UserId})/Microsoft.Dynamics.CRM.RetrieveUserPrivileges()`);
              result = (up?.RolePrivileges || []).some(p => String(p.PrivilegeId || "").toLowerCase() === String(privId).toLowerCase());
            } catch { result = null; }
            break;
          }

          case "principalAccess": {
            // The current user's access rights on ONE record (e.g. "ReadAccess,WriteAccess,...").
            // Lets the UI pre-check inline edit BEFORE the user types a value, instead of failing
            // on commit. Returns the rights string, or null when undetermined (callers fail-open).
            try {
              validateEntitySet(params.entitySet);
              validateGuid(params.id);
              const who = await dvRequest("GET", "WhoAmI");
              if (!who?.UserId) { result = null; break; }
              const target = encodeURIComponent(JSON.stringify({ "@odata.id": `${params.entitySet}(${params.id})` }));
              const r = await dvRequest("GET", `systemusers(${who.UserId})/Microsoft.Dynamics.CRM.RetrievePrincipalAccess(Target=@tid)?@tid=${target}`);
              result = r?.AccessRights || null;
            } catch { result = null; }
            break;
          }

          case "isSystemAdmin": {
            // Check if the current user has the System Administrator role.
            // The System Administrator role grants prvBypassCustomPlugins (among many others),
            // which is required to use MSCRM.BypassCustomPluginExecution + related bypass headers.
            // Returns false on any error (defensive — never block UI on permission check failure).
            try {
              const who = await dvRequest("GET", "WhoAmI");
              if (!who?.UserId) { result = false; break; }
              const roles = await dvRequest(
                "GET",
                `systemusers(${who.UserId})/systemuserroles_association?$select=name&$filter=name eq 'System Administrator'`
              );
              result = (roles?.value || []).length > 0;
            } catch {
              result = false;
            }
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
