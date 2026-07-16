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
    // No control chars ANYWHERE — entitySet is interpolated into raw $batch request lines, where a
    // smuggled CR/LF would inject headers into the multipart body (defense-in-depth; the panel is
    // the only caller and is trusted, but the batch key VALUES are already ctrl-stripped — the set
    // name must not be the one gap).
    if (/[\x00-\x1f\x7f]/.test(v)) throw new Error(`Invalid entitySet: control characters not allowed`);
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

  // When an abort (user cancel, or the panel's chunk-timeout abort) short-circuits a batch loop,
  // the untouched rows must NOT vanish from the results — the run would look "done" while most of
  // the file was never sent. Give every row with no log entry an explicit, RETRYABLE error, and
  // tell the panel this call ended aborted so it stops dispatching further chunks.
  const padAbortedRows = (results, total) => {
    results.aborted = batchAborted;
    if (!batchAborted) return;
    const seen = new Set(results.log.map(e => e.row));
    const msg = "Aborted before send — the run stopped early (chunk timeout or cancel); retry to send this row";
    for (let i = 1; i <= total; i++) {
      if (seen.has(i)) continue;
      results.log.push({ row: i, status: "ERROR", msg });
      results.errors.push({ row: i, msg, payload: "" });
    }
  };

  async function dvRequest(method, path, body = null, extraHeaders = null) {
    const ctx = d365Context || extractContext();
    if (!ctx) throw new Error("D365 context not detected");
    // A raw "#" in a URL starts the FRAGMENT — the browser strips everything after it before the
    // request leaves, so a filter like contains(fullname,'#') reaches Dataverse truncated mid-string
    // ("unterminated string literal"). A literal # is never meaningful in an API URL, so always
    // send it percent-encoded. (Other reserved chars are handled by fetch/URL normalization.)
    path = String(path).replace(/#/g, "%23");
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

          case "getEntities": {
            // TableType tells apart Virtual tables (external data via a data provider — writes and
            // filter operators depend on the provider, no audit/recycle bin) and Elastic tables
            // (Cosmos-backed — 500-row max pages, the audit-table gotcha). Selectable on current
            // orgs; fall back without it so the entity list can never break on an older schema.
            let rawE;
            try { rawE = await dvRequest("GET", "EntityDefinitions?$filter=IsIntersect eq false&$select=LogicalName,DisplayName,EntitySetName,IsCustomEntity,IsManaged,MetadataId,TableType"); }
            catch { rawE = await dvRequest("GET", "EntityDefinitions?$filter=IsIntersect eq false&$select=LogicalName,DisplayName,EntitySetName,IsCustomEntity,IsManaged,MetadataId"); }
            result = (rawE.value || []).map(e => ({
              logical: e.LogicalName,
              display: e.DisplayName?.UserLocalizedLabel?.Label || e.LogicalName,
              entitySet: e.EntitySetName || (e.LogicalName + "s"),
              isCustom: e.IsCustomEntity || false,
              isManaged: e.IsManaged || false,
              metadataId: e.MetadataId || null,
              tableType: e.TableType || "Standard",
            }));
            break;
          }

          case "getFields": {
            validateName(params.logicalName, 'logicalName');
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

                // Skip types that are never useful in data queries
                const aType = a.AttributeType || "";
                if (aType === "Virtual" || aType === "CalendarRules") return false;

                return true;
              })
              .map(a => {
                const aType = a.AttributeType || "String";
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

            // Microsoft-documented bypass headers — go on each individual request inside the
            // multipart body, NOT on the outer $batch envelope. Verified against the docs
            // (learn.microsoft.com/power-apps/developer/data-platform/bypass-custom-business-logic):
            //  · MSCRM.BypassCustomPluginExecution: true → ALL custom SYNCHRONOUS logic (sync
            //    plug-ins AND real-time workflows); privilege prvBypassCustomPlugins.
            //  · MSCRM.BypassBusinessLogicExecution: CustomAsync (or CustomSync,CustomAsync when
            //    both boosters are on — the modern parameter covers both in one header);
            //    privilege prvBypassCustomBusinessLogic. Sysadmin holds both by default.
            //  · MSCRM.SuppressDuplicateDetection: true → skip duplicate-detection rules.
            // (The old "MSCRM.BypassSynchronousLogic" header does NOT exist — Dataverse silently
            //  ignored it, so the async-bypass checkbox used to be a no-op.)
            const bypassPairs = [
              params.bypassPlugins && params.bypassAsyncLogic ? ["MSCRM.BypassBusinessLogicExecution", "CustomSync,CustomAsync"] : null,
              params.bypassPlugins && !params.bypassAsyncLogic ? ["MSCRM.BypassCustomPluginExecution", "true"] : null,
              !params.bypassPlugins && params.bypassAsyncLogic ? ["MSCRM.BypassBusinessLogicExecution", "CustomAsync"] : null,
              params.suppressDuplicates ? ["MSCRM.SuppressDuplicateDetection", "true"] : null,
            ].filter(Boolean);
            const bypassHeaderLines = bypassPairs.map(([k, v]) => `${k}: ${v}\r\n`).join("");
            // Same headers for the serial-PATCH/POST fallback — rows must get the boosters
            // whichever transport they end up on.
            const bypassHeaderObj = bypassPairs.length ? Object.fromEntries(bypassPairs) : null;

            const buildClean = (rec) => {
              const c = {};
              for (const [k, v] of Object.entries(rec)) { if (!STRIP.has(k)) c[k] = v; }
              return c;
            };

            const parseBatchResponse = (text, batchOffset, chunkLen) => {
              const log = [];
              const blocks = text.split(/Content-Type:\s*application\/http/i);
              for (let i = 1; i < blocks.length; i++) {
                const block = blocks[i];
                const statusMatch = block.match(/HTTP\/1\.1\s+(\d{3})/);
                if (!statusMatch) continue;
                const status = parseInt(statusMatch[1], 10);
                // Map each part by its echoed Content-ID (1-based row within the items array), NOT by
                // ordinal position — robust to a value/error message containing "Content-Type:
                // application/http" (extra split) or any response reordering. Fall back to position.
                const cid = parseInt((block.match(/Content-ID:\s*(\d+)/i) || [])[1], 10);
                const rowIdx = Number.isFinite(cid) ? cid : (batchOffset + i);
                if (rowIdx < batchOffset + 1 || rowIdx > batchOffset + chunkLen) continue;
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
                  {
                    // Pad any item with no parsed response. The parser maps by Content-ID, so a gap is
                    // a SPECIFIC row — pad by row number (seen-set), not by tail position.
                    const seen = new Set(chunkLog.map(e => e.row));
                    for (let i = 0; i < chunk.length; i++) {
                      const rowIdx = batch + i + 1;
                      if (seen.has(rowIdx)) continue;
                      results.log.push({ row: rowIdx, status: "ERROR", msg: "No response received from batch" });
                      results.errors.push({ row: rowIdx, msg: "No response received from batch", payload: "" });
                    }
                  }
                } else {
                  for (let i = 0; i < chunk.length; i++) {
                    const rowIdx = batch + i + 1;
                    if (batchAborted) break; // cancelled — stop the serial fallback mid-chunk too
                    try {
                      await dvRequest("POST", entitySet, buildClean(chunk[i]), bypassHeaderObj);
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
                  if (batchAborted) break; // cancelled — stop the serial fallback mid-chunk too
                  try {
                    await dvRequest("POST", entitySet, buildClean(chunk[i]), bypassHeaderObj);
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
            padAbortedRows(results, records.length);
            result = results;
            break;
          }

          case "batchUpsert": {
            const items = params.items || [];
            const entitySet = params.entitySet;
            const keyField = params.keyField;
            const isPrimaryKey = params.isPrimaryKey || false;
            const results = { created: 0, updated: 0, errors: [], log: [] };
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
            // when it's missing (vs. plain PATCH-by-key which upserts). Plus the MSCRM bypass
            // headers — doc-verified names (see batchCreate for the full rationale): the modern
            // MSCRM.BypassBusinessLogicExecution covers sync+async; the old
            // "MSCRM.BypassSynchronousLogic" never existed and was silently ignored.
            const bypassPairs = [
              params.bypassPlugins && params.bypassAsyncLogic ? ["MSCRM.BypassBusinessLogicExecution", "CustomSync,CustomAsync"] : null,
              params.bypassPlugins && !params.bypassAsyncLogic ? ["MSCRM.BypassCustomPluginExecution", "true"] : null,
              !params.bypassPlugins && params.bypassAsyncLogic ? ["MSCRM.BypassBusinessLogicExecution", "CustomAsync"] : null,
              params.suppressDuplicates ? ["MSCRM.SuppressDuplicateDetection", "true"] : null,
            ].filter(Boolean);
            const bypassHeaderLines = [
              params.updateOnly ? "If-Match: *" : null,
              ...bypassPairs.map(([k, v]) => `${k}: ${v}`),
            ].filter(Boolean).map(l => l + "\r\n").join("");
            // Serial-fallback headers: boosters + If-Match must survive the transport switch.
            const fbHeaders = (bypassPairs.length || params.updateOnly)
              ? { ...Object.fromEntries(bypassPairs), ...(params.updateOnly ? { "If-Match": "*" } : {}) }
              : null;

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
              for (let i = 1; i < blocks.length; i++) {
                const block = blocks[i];
                const statusMatch = block.match(/HTTP\/1\.1\s+(\d{3})/);
                if (!statusMatch) continue;
                const status = parseInt(statusMatch[1], 10);
                // Map by echoed Content-ID (see batchCreate) — robust to extra splits / reordering.
                const cid = parseInt((block.match(/Content-ID:\s*(\d+)/i) || [])[1], 10);
                const rowIdx = Number.isFinite(cid) ? cid : (batchOffset + i);
                if (rowIdx < batchOffset + 1 || rowIdx > batchOffset + chunkLen) continue;
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
                    } else if (entry.status === "CREATED") {
                      // Upsert that CREATED a record (201) — counted separately from real updates so the
                      // result card's Created/Updated split matches the log + the rollback set.
                      results.created++;
                    } else {
                      results.updated++;
                    }
                    results.log.push(entry);
                  }
                  // Pad missing entries (parser couldn't extract — mark as unknown)
                  {
                    // Pad any item with no parsed response. The parser maps by Content-ID, so a gap is
                    // a SPECIFIC row — pad by row number (seen-set), not by tail position.
                    const seen = new Set(chunkLog.map(e => e.row));
                    for (let i = 0; i < chunk.length; i++) {
                      const rowIdx = batch + i + 1;
                      if (seen.has(rowIdx)) continue;
                      results.log.push({ row: rowIdx, status: "ERROR", msg: "No response received from batch" });
                      results.errors.push({ row: rowIdx, msg: "No response received from batch", payload: "" });
                    }
                  }
                } else {
                  // Batch endpoint failed entirely — fall back to serial PATCH for this chunk
                  for (let i = 0; i < chunk.length; i++) {
                    const rowIdx = batch + i + 1;
                    if (batchAborted) break; // cancelled — stop the serial fallback mid-chunk too
                    try {
                      await dvRequest("PATCH", buildPath(chunk[i]), buildClean(chunk[i]), fbHeaders);
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
                  if (batchAborted) break; // cancelled — stop the serial fallback mid-chunk too
                  try {
                    await dvRequest("PATCH", buildPath(chunk[i]), buildClean(chunk[i]), fbHeaders);
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
            padAbortedRows(results, items.length);
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

            // Speed boosters apply to DELETE too — sync plug-ins and async logic fire on deletes
            // as well. Same tri-state mapping as batchCreate/batchUpsert; no SuppressDuplicateDetection
            // here (duplicate detection doesn't apply to deletes).
            const bypassPairsD = [
              params.bypassPlugins && params.bypassAsyncLogic ? ["MSCRM.BypassBusinessLogicExecution", "CustomSync,CustomAsync"] : null,
              params.bypassPlugins && !params.bypassAsyncLogic ? ["MSCRM.BypassCustomPluginExecution", "true"] : null,
              !params.bypassPlugins && params.bypassAsyncLogic ? ["MSCRM.BypassBusinessLogicExecution", "CustomAsync"] : null,
            ].filter(Boolean);
            const bypassHeaderLinesD = bypassPairsD.map(([k, v]) => `${k}: ${v}\r\n`).join("");
            const bypassHeaderObjD = bypassPairsD.length ? Object.fromEntries(bypassPairsD) : null;

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
              for (let i = 1; i < blocks.length; i++) {
                const block = blocks[i];
                const statusMatch = block.match(/HTTP\/1\.1\s+(\d{3})/);
                if (!statusMatch) continue;
                const status = parseInt(statusMatch[1], 10);
                // Map by echoed Content-ID (see batchCreate) — robust to extra splits / reordering.
                const cid = parseInt((block.match(/Content-ID:\s*(\d+)/i) || [])[1], 10);
                const rowIdx = Number.isFinite(cid) ? cid : (batchOffset + i);
                if (rowIdx < batchOffset + 1 || rowIdx > batchOffset + chunkLen) continue;
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
                body += "DELETE " + baseUrl + "/" + path + " HTTP/1.1\r\n" + bypassHeaderLinesD + "\r\n";
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
                  {
                    // Pad any item with no parsed response. The parser maps by Content-ID, so a gap is
                    // a SPECIFIC row — pad by row number (seen-set), not by tail position.
                    const seen = new Set(chunkLog.map(e => e.row));
                    for (let i = 0; i < chunk.length; i++) {
                      const rowIdx = batch + i + 1;
                      if (seen.has(rowIdx)) continue;
                      results.log.push({ row: rowIdx, status: "ERROR", msg: "No response received from batch" });
                      results.errors.push({ row: rowIdx, msg: "No response received from batch", payload: "" });
                    }
                  }
                } else {
                  for (let i = 0; i < chunk.length; i++) {
                    const rowIdx = batch + i + 1;
                    if (batchAborted) break; // cancelled — stop the serial fallback mid-chunk too
                    try { await dvRequest("DELETE", buildPath(chunk[i]), null, bypassHeaderObjD || undefined); results.deleted++; results.log.push({ row: rowIdx, status: "DELETED" }); }
                    catch (e) { const msg = e.message?.substring(0, 500) || "Error"; results.errors.push({ row: rowIdx, msg, payload: "" }); results.log.push({ row: rowIdx, status: "ERROR", msg }); }
                  }
                }
              } catch (batchErr) {
                for (let i = 0; i < chunk.length; i++) {
                  const rowIdx = batch + i + 1;
                  if (batchAborted) break; // cancelled — stop the serial fallback mid-chunk too
                  try { await dvRequest("DELETE", buildPath(chunk[i]), null, bypassHeaderObjD || undefined); results.deleted++; results.log.push({ row: rowIdx, status: "DELETED" }); }
                  catch (e) { const msg = e.message?.substring(0, 500) || "Error"; results.errors.push({ row: rowIdx, msg, payload: "" }); results.log.push({ row: rowIdx, status: "ERROR", msg }); }
                }
              }
            }
            padAbortedRows(results, items.length);
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

          case "getLoginEvents": {
            // ALL user-login audit rows (action 64) in a time window — fuel for the Adoption tab.
            // Returns just {date,userId,userName} so the panel can aggregate + filter (role/BU)
            // client-side without re-querying. Paged (5000/page) and hard-capped. NOTE: needs
            // "Audit user access" enabled, and only sees rows still within the org's audit retention.
            const ISO = /^\d{4}-\d{2}-\d{2}(T[0-9:.]+Z?)?$/; // date-picker values only — never interpolate free text
            const fromD = params.from && ISO.test(params.from) ? params.from : null;
            const toD = params.to && ISO.test(params.to) ? params.to : null;
            const capL = Math.min(Math.max(parseInt(params.cap, 10) || 100000, 1), 300000);
            let urlL = `audits?$select=createdon,_objectid_value&$filter=action eq 64${fromD ? ` and createdon ge ${fromD}` : ""}${toD ? ` and createdon le ${toD}` : ""}&$orderby=createdon desc`;
            const events = [];
            let moreL = false; // capped = we STOPPED with data still on the server, not "row count == cap"
            while (urlL) {
              if (events.length >= capL) { moreL = true; break; }
              const dL = await dvRequest("GET", urlL, null, { Prefer: "odata.maxpagesize=5000" });
              (dL.value || []).forEach(a => events.push({
                date: a.createdon,
                userId: a._objectid_value || "",
                userName: a["_objectid_value@OData.Community.Display.V1.FormattedValue"] || "",
              }));
              const nlL = dL["@odata.nextLink"];
              urlL = nlL ? nlL.replace(/^.*\/api\/data\/v[\d.]+\//, "") : null;
            }
            result = { events: events.slice(0, capL), capped: moreL || events.length > capL };
            break;
          }

          case "getLoginStatsSlice": {
            // ONE time slice (typically a day) of login audit, aggregated SERVER-SIDE per user via
            // FetchXML aggregate (count + max createdon, grouped by objectid — the audit table
            // supports aggregates per learn.microsoft.com/power-apps/developer/data-platform/auditing/retrieve-audit-data).
            // Dataverse caps ANY aggregate query at 50k scanned rows (AggregateQueryRecordLimit);
            // the caller slices the window by day precisely so each query stays under it —
            // Microsoft's documented workaround ("add date-range filters, run multiple times,
            // combine"). A slice that still blows the cap (>50k logins in one day) falls back to a
            // raw paged scan of JUST that slice, aggregated here. Either way only per-user totals
            // cross the bridge — never raw events — so org size stops mattering.
            const ISO_S = /^\d{4}-\d{2}-\d{2}(T[0-9:.]+Z?)?$/; // guards both OData and FetchXML interpolation
            if (!params.from || !ISO_S.test(params.from) || !params.to || !ISO_S.test(params.to)) throw new Error("getLoginStatsSlice: invalid from/to");
            const fromS = params.from, toS = params.to;
            // Exact-but-slower path: paged raw scan of the slice, aggregated here. Used when the
            // aggregate result is truncated, errors, or blows the 50k AggregateQueryRecordLimit.
            const scanSlice = async () => {
              const byU = new Map();
              let url = `audits?$select=createdon,_objectid_value&$filter=action eq 64 and createdon ge ${fromS} and createdon lt ${toS}`;
              while (url) {
                const dL = await dvRequest("GET", url, null, { Prefer: "odata.maxpagesize=5000" });
                for (const a of (dL.value || [])) {
                  const id = a._objectid_value || "";
                  let u = byU.get(id);
                  if (!u) { u = { userId: id, userName: a["_objectid_value@OData.Community.Display.V1.FormattedValue"] || "", count: 0, last: "" }; byU.set(id, u); }
                  u.count++; if (a.createdon > u.last) u.last = a.createdon;
                }
                const nl = dL["@odata.nextLink"];
                url = nl ? nl.replace(/^.*\/api\/data\/v[\d.]+\//, "") : null;
              }
              return { rows: [...byU.values()], method: "scan" };
            };
            try {
              // count=5000: audit is an ELASTIC table, whose default page size is 500 (not 5000) —
              // without it the aggregate result was silently paged at 500 groups and the chart
              // flat-lined at exactly 500 distinct users/day. <order alias> on the groupby column
              // per the aggregate-data doc.
              const fx = `<fetch aggregate="true" count="5000"><entity name="audit"><attribute name="objectid" alias="uid" groupby="true"/><attribute name="auditid" alias="n" aggregate="count"/><attribute name="createdon" alias="last" aggregate="max"/><filter type="and"><condition attribute="action" operator="eq" value="64"/><condition attribute="createdon" operator="ge" value="${fromS}"/><condition attribute="createdon" operator="lt" value="${toS}"/></filter><order alias="uid"/></entity></fetch>`;
              const d = await dvRequest("GET", `audits?fetchXml=${encodeURIComponent(fx)}`);
              const vals = d.value || [];
              // ANY continuation signal — or a full page — means the aggregate was truncated by
              // server paging: never trust it, take the exact scan instead. Threshold is 500, NOT
              // 5000: elastic tables clamp the page size to a 500 MAXIMUM (page-results doc), so
              // count="5000" is best-effort and a 5000 threshold could never fire.
              const truncated = !!d["@Microsoft.Dynamics.CRM.fetchxmlpagingcookie"] || !!d["@odata.nextLink"] || d["@Microsoft.Dynamics.CRM.morerecords"] === true || vals.length >= 500;
              if (truncated) {
                result = await scanSlice();
              } else {
                const rows = vals.map(r => ({
                  userId: r.uid || "",
                  userName: r["uid@OData.Community.Display.V1.FormattedValue"] || "",
                  count: r.n || 0,
                  last: r.last || "",
                }));
                result = { rows, method: "aggregate" };
              }
            } catch (e) {
              const msg = e?.message || "";
              // Auth/session problems must surface as a failed slice; any other aggregate hiccup
              // (50k limit 8004E023, elastic quirks with count/order…) falls back to the exact scan.
              if (/401|403|privilege|permission|expired/i.test(msg)) throw e;
              result = await scanSlice();
            }
            break;
          }

          case "getPluginSteps": {
            // Static inventory of plug-in step REGISTRATIONS (what runs on which message/entity,
            // at which stage, sync or async) — the design-time view, not the runtime jobs that
            // System Ops shows. Paged; a heavy org has a few thousand steps at most.
            const rowsP = [];
            let urlP = `sdkmessageprocessingsteps?$select=sdkmessageprocessingstepid,name,stage,mode,rank,statecode,ismanaged,filteringattributes,modifiedon&$expand=plugintypeid($select=typename,assemblyname),sdkmessageid($select=name),sdkmessagefilterid($select=primaryobjecttypecode)&$orderby=name`;
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
            break;
          }

          case "getProcesses": {
            // Every PROCESS DEFINITION from the workflow table — category tells them apart:
            // 0 classic workflow / 1 dialog / 2 business rule / 3 action / 4 BPF / 5 modern
            // (Power Automate) cloud flow / 6 desktop flow. type eq 1 keeps definitions only
            // (2 = per-record activations, 3 = templates).
            const rowsW = [];
            let urlW = `workflows?$select=workflowid,name,category,statecode,mode,primaryentity,ismanaged,triggeroncreate,triggerondelete,triggeronupdateattributelist,_ownerid_value,modifiedon&$filter=type eq 1&$orderby=name`;
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
                modifiedon: w.modifiedon || "",
              }));
              const nlW = dW["@odata.nextLink"];
              urlW = nlW ? nlW.replace(/^.*\/api\/data\/v[\d.]+\//, "") : null;
            }
            result = rowsW;
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
            const fields = "systemuserid,fullname,internalemailaddress,isdisabled,accessmode,caltype,title,createdon,_businessunitid_value,address1_telephone1,mobilephone,_parentsystemuserid_value";
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
              manager: u["_parentsystemuserid_value@OData.Community.Display.V1.FormattedValue"] || "",
              phone: u.address1_telephone1 || "",
              mobile: u.mobilephone || "",
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

          case "getUserCountsByBu": {
            // One grouped-aggregate query → user count per business unit. Drives the BU-tree badges
            // without loading every user row up front. Subject to Dataverse's aggregate record limit
            // on very large orgs, so the caller treats this as best-effort (badges just go blank).
            const dC = await dvRequest("GET", "systemusers?$apply=groupby((_businessunitid_value),aggregate($count as count))");
            const counts = {};
            (dC.value || []).forEach(r => { counts[r._businessunitid_value || ""] = r.count || 0; });
            result = counts;
            break;
          }

          case "getUsersByBu": {
            // Direct members of ONE business unit, fetched lazily when that BU is opened (keeps the
            // module snappy on large orgs instead of loading every user on mount). Same row shape as
            // getAllUsers so the panel renders identically.
            const buIdB = String(params.buId || "");
            if (buIdB) validateGuid(buIdB); // never interpolate an unvalidated id into the OData URL
            const ACCESS_MODES_B = { 0: "Read-Write", 1: "Admin", 2: "Read", 3: "Support", 4: "Non-Interactive", 5: "Delegated Admin" };
            const CAL_TYPES_B = { 0: "Full", 1: "Admin", 2: "Basic", 3: "Device Full", 4: "Device Basic", 5: "Essential", 6: "Device Essential", 7: "Enterprise", 8: "Device Enterprise", 9: "Sales", 10: "Service", 11: "Field Service", 12: "Project Service" };
            const fieldsB = "systemuserid,fullname,internalemailaddress,isdisabled,accessmode,caltype,title,createdon,_businessunitid_value,address1_telephone1,mobilephone,_parentsystemuserid_value";
            const mapUserB = (u) => ({
              id: u.systemuserid, fullname: u.fullname || "", email: u.internalemailaddress || "",
              disabled: u.isdisabled, accessMode: u.accessmode ?? 0, accessModeLabel: ACCESS_MODES_B[u.accessmode] || `Mode ${u.accessmode}`,
              calType: u.caltype ?? 0, calTypeLabel: CAL_TYPES_B[u.caltype] || `Type ${u.caltype}`,
              buName: u["_businessunitid_value@OData.Community.Display.V1.FormattedValue"] || "", buId: u._businessunitid_value || "",
              title: u.title || "", manager: u["_parentsystemuserid_value@OData.Community.Display.V1.FormattedValue"] || "",
              phone: u.address1_telephone1 || "", mobile: u.mobilephone || "", createdOn: u.createdon,
            });
            const filtB = buIdB ? `_businessunitid_value eq ${buIdB}` : "_businessunitid_value eq null";
            let usersB = [];
            let urlB = `systemusers?$select=${fieldsB}&$filter=${filtB}&$orderby=fullname asc&$top=5000`;
            let guardB = 0;
            while (urlB && guardB++ < 50) {
              const dataB = await dvRequest("GET", urlB);
              usersB = usersB.concat((dataB.value || []).map(mapUserB));
              const nlB = dataB["@odata.nextLink"];
              urlB = nlB ? nlB.replace(/^.*\/api\/data\/v[\d.]+\//, "") : null;
            }
            result = usersB;
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

          case "getRolePrivilegeMatrix": {
            // Full CRUD-style privilege matrix for a role, like the make.powerapps role editor grid:
            // one row per table × the 8 access rights (Create/Read/Write/Delete/Append/AppendTo/
            // Assign/Share), each cell = the granted DEPTH (0 None · 1 User · 2 BU · 4 Parent:Child ·
            // 8 Org). Built from the FULL privilege catalog (so NOT-granted cells show as None) crossed
            // with the role's granted depths. Non-table (task-based) privileges go into `misc`.
            validateGuid(params.roleId);
            const rd = await dvRequest("GET", `RetrieveRolePrivilegesRole(RoleId=${params.roleId})`);
            const DEPTH_MAP_M = { "Basic": 1, "Local": 2, "Deep": 4, "Global": 8 };
            const grantedDepth = {};
            (rd.RolePrivileges || []).forEach(p => {
              const depth = typeof p.Depth === "string" ? (DEPTH_MAP_M[p.Depth] || 0) : (p.Depth || 0);
              grantedDepth[p.PrivilegeId] = depth;
            });
            // Ensure the org's full privilege catalog is cached (name + accessright per privilege).
            if (!window.__colvioPrivCache) {
              window.__colvioPrivCache = {};
              let allP = []; let pg = 1; let more = true;
              while (more) {
                const fx = `<fetch page="${pg}" count="5000"><entity name="privilege"><attribute name="privilegeid"/><attribute name="name"/><attribute name="accessright"/><order attribute="privilegeid"/></entity></fetch>`;
                const pdata = await dvRequest("GET", `privileges?fetchXml=${encodeURIComponent(fx)}`);
                const b = pdata.value || [];
                allP = allP.concat(b);
                more = b.length === 5000; pg++;
              }
              allP.forEach(p => { window.__colvioPrivCache[p.privilegeid] = { name: p.name, accessRight: p.accessright }; });
            }
            const cat = window.__colvioPrivCache;
            // AccessRights enum → operation. A privilege carries exactly one of these.
            const AR = { 1: "Read", 2: "Write", 4: "Append", 16: "AppendTo", 32: "Create", 65536: "Delete", 262144: "Share", 524288: "Assign" };
            const entities = {}; // { schemaName: { op: depth } }
            const misc = [];
            for (const pid in cat) {
              const nm = cat[pid].name || "";
              const op = AR[cat[pid].accessRight];
              const depth = grantedDepth[pid] || 0;
              // Entity privilege = accessright is a core op AND the name is prv<Op><EntitySchemaName>.
              const entity = (op && nm.startsWith("prv" + op)) ? nm.substring(3 + op.length) : null;
              if (op && entity) {
                (entities[entity] = entities[entity] || {})[op] = Math.max(entities[entity][op] || 0, depth);
              } else {
                misc.push({ id: pid, name: nm, depth });
              }
            }
            result = {
              entities: Object.keys(entities).sort((a, b) => a.localeCompare(b)).map(e => ({ entity: e, ops: entities[e] })),
              misc: misc.sort((a, b) => a.name.localeCompare(b.name)),
            };
            break;
          }

          // A security role exists as one copy PER BUSINESS UNIT, all copies sharing the same NAME
          // (children link to the root via parentrootroleid). Instead of fanning out one query per
          // copy (slow + 429-storms orgs with many BUs), we start from systemusers and filter by the
          // role with an any() lambda on the user↔role N:N — ONE paged query, each user's BU included.
          // (Role names are effectively unique; if two unrelated roles share a name this over-matches.)
          case "getRoleUserCount": {
            const nameC = String(params.roleName || "");
            if (!nameC) { result = { count: 0 }; break; }
            const escC = nameC.replace(/[\x00-\x1f\x7f]/g, "").replace(/'/g, "''"); // strip control chars then quote-escape
            const d = await dvRequest("GET", `systemusers?$select=systemuserid&$top=1&$count=true&$filter=systemuserroles_association/any(o:o/name eq '${escC}')`);
            result = { count: d["@odata.count"] != null ? d["@odata.count"] : (d.value || []).length };
            break;
          }

          case "getRoleUsers": {
            const nameU = String(params.roleName || "");
            if (!nameU) { result = []; break; }
            const escU = nameU.replace(/[\x00-\x1f\x7f]/g, "").replace(/'/g, "''"); // strip control chars then quote-escape
            // Cap the fetch: a baseline role can be held by tens of thousands of users — paging all of
            // them is slow and risks a timeout. We stop once CAP distinct users are collected; the panel
            // already knows the true count and shows "first N of M". Caller may override (1..50000).
            const CAP = Math.min(Math.max(parseInt(params.cap, 10) || 10000, 1), 50000);
            const map = {};
            let url = `systemusers?$select=systemuserid,fullname,internalemailaddress,domainname,isdisabled,accessmode,_businessunitid_value,title,address1_telephone1,mobilephone,_parentsystemuserid_value&$filter=systemuserroles_association/any(o:o/name eq '${escU}')&$orderby=fullname asc`;
            while (url) {
              const d = await dvRequest("GET", url);
              (d.value || []).forEach(u => {
                const k = String(u.systemuserid || "").toLowerCase();
                if (k && !map[k]) map[k] = {
                  id: u.systemuserid,
                  name: u.fullname || u.domainname || u.systemuserid,
                  email: u.internalemailaddress || "",
                  domain: u.domainname || "",
                  disabled: !!u.isdisabled,
                  accessMode: u["accessmode@OData.Community.Display.V1.FormattedValue"] || "",
                  accessModeCode: u.accessmode,
                  bu: u["_businessunitid_value@OData.Community.Display.V1.FormattedValue"] || "",
                  title: u.title || "",
                  manager: u["_parentsystemuserid_value@OData.Community.Display.V1.FormattedValue"] || "",
                  phone: u.address1_telephone1 || "",
                  mobile: u.mobilephone || "",
                };
              });
              const nl = d["@odata.nextLink"];
              url = (nl && Object.keys(map).length < CAP) ? nl.replace(/^.*\/api\/data\/v[\d.]+\//, "") : null;
            }
            result = Object.values(map).sort((a, b) => (a.name || "").localeCompare(b.name || "")).slice(0, CAP);
            break;
          }

          case "getRoleTeamCount": {
            // How many TEAMS hold this role (users inherit the role through team membership — the
            // Users tab only lists direct assignments). Same by-NAME pattern as getRoleUserCount so
            // every business-unit copy of the role is covered in one query.
            const nameT = String(params.roleName || "");
            if (!nameT) { result = { count: 0 }; break; }
            const escT = nameT.replace(/[\x00-\x1f\x7f]/g, "").replace(/'/g, "''");
            const dT = await dvRequest("GET", `teams?$select=teamid&$top=1&$count=true&$filter=teamroles_association/any(o:o/name eq '${escT}')`);
            result = { count: dT["@odata.count"] != null ? dT["@odata.count"] : (dT.value || []).length };
            break;
          }

          case "getRoleTeams": {
            // The teams holding this role (across every BU copy, deduplicated), with each team's
            // member count. Counts use the same JSON-safe $count=true trick as getRoleUserCount
            // (a raw /$count endpoint returns text/plain, which dvRequest doesn't parse) and are
            // capped to the first 50 teams — beyond that the count shows as unknown.
            const nameTs = String(params.roleName || "");
            if (!nameTs) { result = []; break; }
            const escTs = nameTs.replace(/[\x00-\x1f\x7f]/g, "").replace(/'/g, "''");
            const mapT = {};
            let urlT = `teams?$select=teamid,name,teamtype,description,_businessunitid_value,_administratorid_value&$filter=teamroles_association/any(o:o/name eq '${escTs}')&$orderby=name asc`;
            while (urlT) {
              const dTs = await dvRequest("GET", urlT);
              (dTs.value || []).forEach(tm => {
                const k = String(tm.teamid || "").toLowerCase();
                if (k && !mapT[k]) mapT[k] = {
                  id: tm.teamid,
                  name: tm.name || tm.teamid,
                  type: tm["teamtype@OData.Community.Display.V1.FormattedValue"] || String(tm.teamtype ?? ""),
                  typeCode: tm.teamtype,
                  bu: tm["_businessunitid_value@OData.Community.Display.V1.FormattedValue"] || "",
                  admin: tm["_administratorid_value@OData.Community.Display.V1.FormattedValue"] || "",
                  description: tm.description || "",
                  memberCount: null,
                };
              });
              const nlT = dTs["@odata.nextLink"];
              urlT = nlT ? nlT.replace(/^.*\/api\/data\/v[\d.]+\//, "") : null;
            }
            const teamsList = Object.values(mapT).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
            for (const tm of teamsList.slice(0, 50)) {
              try {
                const cD = await dvRequest("GET", `systemusers?$select=systemuserid&$top=1&$count=true&$filter=teammembership_association/any(o:o/teamid eq ${tm.id})`);
                tm.memberCount = cD["@odata.count"] != null ? cD["@odata.count"] : null;
              } catch { tm.memberCount = null; }
            }
            result = teamsList;
            break;
          }

          case "assignRoleUsers": {
            // Bulk assign/remove a security role to/from users — the N:N systemuserroles_association.
            // THE gotcha: a role exists as one copy PER BUSINESS UNIT, and you must associate the copy
            // living in the USER's BU (associating another BU's copy fails). So: resolve every copy of
            // the role (name → {buId: roleId}), fetch each target user's BU, then POST/DELETE the $ref
            // per user with the right copy. Per-user results — one failure never aborts the batch.
            // Server enforces prvAssignRole; Colvio adds nothing the caller isn't entitled to.
            const nameR = String(params.roleName || "").replace(/[\x00-\x1f\x7f]/g, "");
            const idsR = Array.isArray(params.userIds) ? params.userIds : [];
            const removing = params.mode === "remove";
            if (!nameR || !idsR.length) { result = []; break; }
            idsR.forEach(validateGuid);
            const escRn = nameR.replace(/'/g, "''");
            const ctxA = d365Context || extractContext();
            const copies = await dvRequest("GET", `roles?$select=roleid,_businessunitid_value&$filter=name eq '${escRn}'`);
            const roleByBu = {};
            (copies.value || []).forEach(r => { roleByBu[String(r._businessunitid_value || "").toLowerCase()] = r.roleid; });
            const buByUser = {};
            for (let i = 0; i < idsR.length; i += 20) {
              const chunk = idsR.slice(i, i + 20);
              const f = chunk.map(u => `systemuserid eq ${u}`).join(" or ");
              const d = await dvRequest("GET", `systemusers?$select=systemuserid,_businessunitid_value&$filter=${f}`);
              (d.value || []).forEach(u => { buByUser[String(u.systemuserid).toLowerCase()] = String(u._businessunitid_value || "").toLowerCase(); });
            }
            const out = [];
            let idxR = 0;
            const workR = async () => {
              while (idxR < idsR.length) {
                const uid = idsR[idxR++];
                const bu = buByUser[uid.toLowerCase()];
                const rid = bu ? roleByBu[bu] : null;
                if (!rid) { out.push({ id: uid, ok: false, error: bu ? "No copy of this role in the user's business unit" : "User not found" }); continue; }
                try {
                  if (removing) await dvRequest("DELETE", `systemusers(${uid})/systemuserroles_association(${rid})/$ref`);
                  else await dvRequest("POST", `systemusers(${uid})/systemuserroles_association/$ref`, { "@odata.id": `${ctxA.clientUrl}/api/data/${ctxA.apiVersion}/roles(${rid})` });
                  out.push({ id: uid, ok: true });
                } catch (e) {
                  const msg = String(e.message || e);
                  // Idempotence: assigning a role the user already has / removing one they don't
                  // have are both no-ops in spirit — report them as OK with a note, not failures.
                  if (!removing && /duplicate|already exist/i.test(msg)) out.push({ id: uid, ok: true, note: "already assigned" });
                  else if (removing && /does not exist|not found|404/i.test(msg)) out.push({ id: uid, ok: true, note: "was not assigned" });
                  else out.push({ id: uid, ok: false, error: msg });
                }
              }
            };
            await Promise.all(Array.from({ length: Math.min(4, idsR.length) }, workR));
            result = out;
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
            // Match on the role-TEMPLATE id (627090ff-…, the fixed System Administrator template) so
            // this works regardless of UI language — a French org names the role "Administrateur
            // système", so the old name-only filter ('System Administrator') wrongly returned false.
            // (Name kept as an OR fallback for any org missing the template link.)
            // Returns false on any error (defensive — never block UI on permission check failure).
            try {
              const who = await dvRequest("GET", "WhoAmI");
              if (!who?.UserId) { result = false; break; }
              const roles = await dvRequest(
                "GET",
                `systemusers(${who.UserId})/systemuserroles_association?$select=name&$filter=_roletemplateid_value eq 627090ff-40a3-4053-8790-584edc5be201 or name eq 'System Administrator'`
              );
              result = (roles?.value || []).length > 0;
            } catch {
              result = false;
            }
            break;
          }

          case "getProcessInstances": {
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
            break;
          }

          case "getProcessStages": {
            // Every stage of a BPF definition (the values an admin can move a record to). Ordered by
            // stage category as a rough sequence proxy. The platform validates the target on PATCH.
            validateGuid(params.processId);
            const rs = await dvRequest("GET", `processstages?$select=processstageid,stagename,stagecategory,_processid_value&$filter=_processid_value eq ${params.processId}&$orderby=stagecategory asc`);
            result = (rs?.value || []).map(s => ({
              id: s.processstageid,
              name: s.stagename || "(unnamed stage)",
              category: s["stagecategory@OData.Community.Display.V1.FormattedValue"] || (s.stagecategory != null ? String(s.stagecategory) : ""),
            }));
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
