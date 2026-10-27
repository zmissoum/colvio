// Content script › data. Data — queries (OData, FetchXML, raw), the $batch pipelines (create / upsert / delete / associate), single updates, raw requests for the API Tester and the Script Console, the recycle bin and audit reads.
// One async function per action; `params` is what the panel sent. Every request goes through
// core.js (dvRequest: host lock, pacing, timeouts, 429 back-off).
import { API_LIMIT, API_PACE_AT, SAFE_NAME, apiLog, apiPacedMs, apiTotal, apiTrim, batchRunId, buildKeyPath, d365Context, dvRequest, extractContext, fetchBatchWithRetry, fxEntitySets, getCurrentRecord, isRunAborted, padAbortedRows, rawRequest, runSignal, validateEntitySet, validateGuid, validateName } from "../core.js";

const ACTIONS = {
  async fetchXml(params) {
    let result;
    // Execute FetchXML query via D365 Web API
    const xml = params.fetchXml;
    if (!xml) throw new Error("Missing fetchXml parameter");
    // Extract entity name from FetchXML to build URL
    const entityMatch = xml.match(/<entity\s+name=["']([^"']+)["']/);
    if (!entityMatch) throw new Error("Cannot find <entity name='...'> in FetchXML");
    const entityName = entityMatch[1];
    validateName(entityName, "fetchXml entity");
    // Get entity set name (cached per table)
    let esName = fxEntitySets.get(entityName);
    if (!esName) {
      const esDef = await dvRequest("GET", `EntityDefinitions(LogicalName='${entityName}')?$select=EntitySetName`);
      esName = esDef?.EntitySetName || (entityName + "s");
      fxEntitySets.set(entityName, esName);
    }
    // Execute: GET /entitySet?fetchXml=<url-encoded>
    const encoded = encodeURIComponent(xml);
    const data = await dvRequest("GET", `${esName}?fetchXml=${encoded}`);
    // Check for paging cookie (FetchXML pagination)
    const pagingCookie = data["@Microsoft.Dynamics.CRM.fetchxmlpagingcookie"] || null;
    // morerecords is the server's own "there is a next page"; the cookie's presence is the
    // fallback signal when the annotation is missing.
    const more = data["@Microsoft.Dynamics.CRM.morerecords"];
    result = {
      records: data.value || [],
      count: data.value?.length || 0,
      pagingCookie,
      entitySetName: esName,
      moreRecords: typeof more === "boolean" ? more : !!pagingCookie,
    };
    return result;
  },
  async query(params) {
    let result;
    let path = validateEntitySet(params.entitySet);
    const isDirectFetch = /^[^?]*\(/.test(path); // e.g. accounts(GUID) — must be before ? to avoid matching parens in $filter
    const ps = [];
    if (params.options?.select) ps.push(`$select=${params.options.select}`);
    if (!isDirectFetch) {
      // the whole predicate percent-encoded (no caller pre-encodes): a "+" in an email read
      // as a space → "not found" → a row created WITHOUT its parent; "&" cut the query
      if (params.options?.filter) ps.push(`$filter=${encodeURIComponent(params.options.filter)}`);
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
          if (params.options?.filter) fps.push(`$filter=${encodeURIComponent(params.options.filter)}`);
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
    return result;
  },
  async queryRaw(params) {
    let result;
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
    return result;
  },
  async getApiStats(params) {
    let result;
    apiTrim(Date.now());
    result = { last5min: apiLog.length, limit: API_LIMIT, paceAt: API_PACE_AT, total: apiTotal, pacedMs: apiPacedMs };
    return result;
  },
  async customRequest(params) {
    let result;
    // Ad-hoc request runner for the API Tester module. Returns the raw
    // response (status, headers, body, elapsed) without throwing —
    // user wants to inspect 4xx/5xx responses, not have them swallowed.
    result = await rawRequest(params, 60000);
    return result;
  },
  async scriptRequest(params) {
    let result;
    // Script Console: same host-locked raw request, with a 5-minute budget — a script's
    // $batch of up to 1000 operations, or a long action, routinely outlives 60 s. 429
    // retries, dry run and the rollback journal live in the panel (scriptRuntime.js).
    result = await rawRequest(params, 300000, { apiOnly: true });
    return result;
  },
  async batchCreate(params) {
    let result;
    const myRun = Number.isFinite(Number(params.runId)) ? Number(params.runId) : batchRunId; // see abortedRuns
    const aborted = () => isRunAborted(myRun);
    const records = params.records || [];
    const entitySet = params.entitySet;
    const results = { created: 0, errors: [], log: [] };
    // overriddencreatedon / modifiedon are NOT stripped: migration mode maps them on purpose
    // (the panel gates them behind the privilege check) — stripping them here silently gave
    // every migrated record today's date while the log said CREATED (audit finding).
    const STRIP = new Set(["createdon","createdby","modifiedby","ownerid","owningbusinessunit","owningteam","owninguser","versionnumber","importsequencenumber","timezoneruleversionnumber","utcconversiontimezonecode"]);
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
      if (aborted()) break; // user cancelled / chunk timed out — stop sending further chunks
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
          signal: runSignal(myRun),
        }, 4, aborted);
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
          // A 401 on the $batch endpoint means the SESSION died mid-run — serial-falling-back
          // would grind through thousands of doomed per-row requests with no reconnect banner
          // (audit finding). Throw the session marker so the bridge stops the pool and the UI
          // shows Reconnect; rows of this and later chunks become explicit retryable errors.
          if (resp.status === 401) throw new Error("SESSION_EXPIRED: Session expired mid-run — refresh D365 (F5), reconnect, then retry the remaining rows");
          for (let i = 0; i < chunk.length; i++) {
            const rowIdx = batch + i + 1;
            if (aborted()) break; // cancelled — stop the serial fallback
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
          if (aborted()) break; // cancelled — stop the serial fallback
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
    padAbortedRows(results, records.length, myRun);
    result = results;
    return result;
  },
  async batchUpsert(params) {
    let result;
    const myRun = Number.isFinite(Number(params.runId)) ? Number(params.runId) : batchRunId; // see abortedRuns
    const aborted = () => isRunAborted(myRun);
    const items = params.items || [];
    const entitySet = params.entitySet;
    const keyField = params.keyField;
    const isPrimaryKey = params.isPrimaryKey || false;
    const results = { created: 0, updated: 0, errors: [], log: [] };
    // overriddencreatedon / modifiedon are NOT stripped: migration mode maps them on purpose
    // (the panel gates them behind the privilege check) — stripping them here silently gave
    // every migrated record today's date while the log said CREATED (audit finding).
    const STRIP = new Set(["createdon","createdby","modifiedby","ownerid","owningbusinessunit","owningteam","owninguser","versionnumber","importsequencenumber","timezoneruleversionnumber","utcconversiontimezonecode"]);
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

    // The record's URL segment — buildKeyPath (shared with batchDeleteKeyed): a value the key
    // can't address (not a GUID / not a number) is a per-row error, never sent.
    const buildPath = (item) => buildKeyPath(entitySet, keyField, item.keyValue, { isPrimaryKey, keyIsNumeric: !!params.keyIsNumeric });
    const refuse = (rowIdx, msg, payload) => { results.errors.push({ row: rowIdx, msg, payload }); results.log.push({ row: rowIdx, status: "ERROR", msg }); };
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
      if (aborted()) break; // user cancelled / chunk timed out — stop sending further chunks
      const chunk = items.slice(batch, batch + BATCH_SIZE);
      const boundary = "batch_d365_" + Date.now() + "_" + batch;

      // One changeset per record → per-record atomicity, errors don't cascade.
      // Still a single HTTP roundtrip for the whole chunk.
      let body = "", parts = 0;
      const refused = new Set(); // rows whose key was refused — logged, never sent, not padded
      for (let i = 0; i < chunk.length; i++) {
        const csName = "cs_" + Date.now() + "_" + (batch + i);
        const clean = buildClean(chunk[i]);
        const kp = buildPath(chunk[i]);
        if (kp.error) { refused.add(batch + i + 1); refuse(batch + i + 1, kp.error, JSON.stringify(chunk[i].record).substring(0, 200)); continue; }
        const path = kp.path;
        parts++;
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
      if (!parts) continue; // every key of the chunk refused — nothing to send

      try {
        const resp = await fetchBatchWithRetry(baseUrl + "/$batch", {
          method: "POST",
          headers: { "Content-Type": "multipart/mixed; boundary=" + boundary, "OData-MaxVersion": "4.0", "OData-Version": "4.0", "Accept": "application/json" },
          body,
          credentials: "same-origin",
          signal: runSignal(myRun),
        }, 4, aborted);
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
              if (seen.has(rowIdx) || refused.has(rowIdx)) continue;
              results.log.push({ row: rowIdx, status: "ERROR", msg: "No response received from batch" });
              results.errors.push({ row: rowIdx, msg: "No response received from batch", payload: "" });
            }
          }
        } else {
          // Batch endpoint failed entirely — fall back to serial PATCH for this chunk.
          // 401 = session died mid-run: throw the marker instead of grinding doomed
          // per-row requests with no reconnect banner (audit finding).
          if (resp.status === 401) throw new Error("SESSION_EXPIRED: Session expired mid-run — refresh D365 (F5), reconnect, then retry the remaining rows");
          for (let i = 0; i < chunk.length; i++) {
            const rowIdx = batch + i + 1;
            if (aborted()) break; // cancelled — stop the serial fallback
            if (refused.has(rowIdx)) continue;
            try {
              await dvRequest("PATCH", buildPath(chunk[i]).path, buildClean(chunk[i]), fbHeaders);
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
          if (aborted()) break; // cancelled — stop the serial fallback
          if (refused.has(rowIdx)) continue;
          try {
            await dvRequest("PATCH", buildPath(chunk[i]).path, buildClean(chunk[i]), fbHeaders);
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
    padAbortedRows(results, items.length, myRun);
    result = results;
    return result;
  },
  async batchAssociate(params) {
    let result;
    // Rows of a many-to-many table are not created: the two records are ASSOCIATED —
    // POST {set1}(id1)/{nav1}/$ref with the second record's @odata.id — and removed by
    // DELETE {set1}(id1)/{nav1}(id2)/$ref. One changeset per pair in a $batch, per-pair log,
    // serial fallback, per-run abort: the same shape as batchCreate / batchDeleteKeyed.
    const myRun = Number.isFinite(Number(params.runId)) ? Number(params.runId) : batchRunId;
    const aborted = () => isRunAborted(myRun);
    const set1 = validateEntitySet(params.set1), set2 = validateEntitySet(params.set2);
    validateName(params.nav1, "nav1");
    const removing = params.mode === "remove";
    const items = params.items || []; // [{ id1, id2 }]
    const results = { done: 0, already: 0, errors: [], log: [] };
    const BATCH_SIZE = 500;
    const ctx = d365Context || extractContext();
    if (!ctx) throw new Error("D365 context not found");
    const baseUrl = `${ctx.clientUrl}/api/data/${ctx.apiVersion}`;
    const okStatus = removing ? "DISASSOCIATED" : "ASSOCIATED";
    const refuse = (rowIdx, msg) => { results.errors.push({ row: rowIdx, msg, payload: "" }); results.log.push({ row: rowIdx, status: "ERROR", msg }); };
    // the idempotent outcomes: an association that already exists / one that wasn't there.
    // A 404 "<table> With Id = <guid> Does Not Exist" is the RECORD missing (a wrong GUID in
    // the file): an error, never "was not associated". Mirror of classifyAssociationOutcome
    // in src/associationUtils.js (tested there — this script can't import modules).
    const RECORD_MISSING = /With Id\s*=\s*\{?[0-9a-f-]{36}\}?\s+Does Not Exist/i;
    const classify = (status, msg) => {
      const m = String(msg || "");
      if (status === 204 || status === 200) return { status: okStatus };
      if (RECORD_MISSING.test(m)) return null;
      if (!removing && (status === 409 || /already|duplicate|exists/i.test(m))) return { status: okStatus, note: "already associated", already: true };
      if (removing && (status === 404 || /does not exist|not found|no association/i.test(m))) return { status: okStatus, note: "was not associated", already: true };
      return null;
    };
    const parseBatchResponse = (text, batchOffset, chunkLen) => {
      const log = [];
      const blocks = text.split(/Content-Type:\s*application\/http/i);
      for (let i = 1; i < blocks.length; i++) {
        const block = blocks[i];
        const statusMatch = block.match(/HTTP\/1\.1\s+(\d{3})/);
        if (!statusMatch) continue;
        const status = parseInt(statusMatch[1], 10);
        const cid = parseInt((block.match(/Content-ID:\s*(\d+)/i) || [])[1], 10);
        const rowIdx = Number.isFinite(cid) ? cid : (batchOffset + i);
        if (rowIdx < batchOffset + 1 || rowIdx > batchOffset + chunkLen) continue;
        const msg = (block.match(/"message":"([^"]{0,300})"/) || [])[1] || `HTTP ${status}`;
        const c = classify(status, msg);
        log.push(c ? { row: rowIdx, ...c } : { row: rowIdx, status: "ERROR", msg });
      }
      return log;
    };
    const pathOf = (it) => removing ? `${set1}(${it.id1})/${params.nav1}(${it.id2})/$ref` : `${set1}(${it.id1})/${params.nav1}/$ref`;
    const bodyOf = (it) => removing ? null : { "@odata.id": `${baseUrl}/${set2}(${it.id2})` };
    const single = async (it) => {
      try { await dvRequest(removing ? "DELETE" : "POST", pathOf(it), bodyOf(it)); return { status: okStatus }; }
      catch (e) {
        const msg = String(e.message || e);
        const st = parseInt((msg.match(/HTTP (\d{3})/) || [])[1], 10);
        return classify(st, msg) || { status: "ERROR", msg: msg.substring(0, 500) };
      }
    };
    const take = (rowIdx, entry) => {
      results.log.push({ row: rowIdx, ...entry });
      if (entry.status === "ERROR") results.errors.push({ row: rowIdx, msg: entry.msg || "Batch error", payload: "" });
      else if (entry.already) results.already++;
      else results.done++;
    };

    for (let batch = 0; batch < items.length; batch += BATCH_SIZE) {
      if (aborted()) break;
      const chunk = items.slice(batch, batch + BATCH_SIZE);
      const boundary = "batch_d365_" + Date.now() + "_" + batch;
      let body = "", parts = 0;
      const refused = new Set();
      for (let i = 0; i < chunk.length; i++) {
        const rowIdx = batch + i + 1;
        const it = chunk[i] || {};
        try { validateGuid(it.id1); validateGuid(it.id2); }
        catch { refused.add(rowIdx); refuse(rowIdx, "Both ends must be GUIDs"); continue; }
        parts++;
        const csName = "cs_" + Date.now() + "_" + (batch + i);
        body += "--" + boundary + "\r\n";
        body += "Content-Type: multipart/mixed; boundary=" + csName + "\r\n\r\n";
        body += "--" + csName + "\r\n";
        body += "Content-Type: application/http\r\nContent-Transfer-Encoding: binary\r\n";
        body += "Content-ID: " + rowIdx + "\r\n\r\n";
        if (removing) {
          body += "DELETE " + baseUrl + "/" + pathOf(it) + " HTTP/1.1\r\n\r\n";
        } else {
          body += "POST " + baseUrl + "/" + pathOf(it) + " HTTP/1.1\r\n";
          body += "Content-Type: application/json\r\n\r\n";
          body += JSON.stringify(bodyOf(it)) + "\r\n";
        }
        body += "--" + csName + "--\r\n";
      }
      body += "--" + boundary + "--\r\n";
      if (!parts) continue;
      const serial = async () => {
        for (let i = 0; i < chunk.length; i++) {
          const rowIdx = batch + i + 1;
          if (aborted()) break;
          if (refused.has(rowIdx)) continue;
          take(rowIdx, await single(chunk[i]));
        }
      };
      try {
        const resp = await fetchBatchWithRetry(baseUrl + "/$batch", {
          method: "POST",
          headers: { "Content-Type": "multipart/mixed; boundary=" + boundary, "OData-MaxVersion": "4.0", "OData-Version": "4.0", "Accept": "application/json" },
          body,
          credentials: "same-origin",
          signal: runSignal(myRun),
        }, 4, aborted);
        if (resp.ok) {
          const chunkLog = parseBatchResponse(await resp.text(), batch, chunk.length);
          const seen = new Set();
          for (const entry of chunkLog) { seen.add(entry.row); const { row, ...rest } = entry; take(row, rest); }
          for (let i = 0; i < chunk.length; i++) {
            const rowIdx = batch + i + 1;
            if (seen.has(rowIdx) || refused.has(rowIdx)) continue;
            refuse(rowIdx, "No response received from batch");
          }
        } else {
          if (resp.status === 401) throw new Error("SESSION_EXPIRED: Session expired mid-run — refresh D365 (F5), reconnect, then retry the remaining rows");
          await serial();
        }
      } catch (batchErr) {
        if (/SESSION_EXPIRED/.test(String(batchErr?.message || ""))) throw batchErr;
        await serial();
      }
    }
    padAbortedRows(results, items.length, myRun);
    result = results;
    return result;
  },
  async batchDeleteKeyed(params) {
    let result;
    const myRun = Number.isFinite(Number(params.runId)) ? Number(params.runId) : batchRunId; // see abortedRuns
    const aborted = () => isRunAborted(myRun);
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

    const buildPath = (item) => buildKeyPath(entitySet, keyField, item.keyValue, { isPrimaryKey, keyIsNumeric: !!params.keyIsNumeric }); // shared with batchUpsert
    const refuse = (rowIdx, msg) => { results.errors.push({ row: rowIdx, msg, payload: "" }); results.log.push({ row: rowIdx, status: "ERROR", msg }); };

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
      if (aborted()) break; // user cancelled / chunk timed out — stop sending further chunks
      const chunk = items.slice(batch, batch + BATCH_SIZE);
      const boundary = "batch_d365_" + Date.now() + "_" + batch;
      let body = "", parts = 0;
      const refused = new Set();
      for (let i = 0; i < chunk.length; i++) {
        const csName = "cs_" + Date.now() + "_" + (batch + i);
        const kp = buildPath(chunk[i]);
        if (kp.error) { refused.add(batch + i + 1); refuse(batch + i + 1, kp.error); continue; }
        const path = kp.path;
        parts++;
        body += "--" + boundary + "\r\n";
        body += "Content-Type: multipart/mixed; boundary=" + csName + "\r\n\r\n";
        body += "--" + csName + "\r\n";
        body += "Content-Type: application/http\r\nContent-Transfer-Encoding: binary\r\n";
        body += "Content-ID: " + (batch + i + 1) + "\r\n\r\n";
        body += "DELETE " + baseUrl + "/" + path + " HTTP/1.1\r\n" + bypassHeaderLinesD + "\r\n";
        body += "--" + csName + "--\r\n";
      }
      body += "--" + boundary + "--\r\n";
      if (!parts) continue; // every key of the chunk refused — nothing to send

      try {
        const resp = await fetchBatchWithRetry(baseUrl + "/$batch", {
          method: "POST",
          headers: { "Content-Type": "multipart/mixed; boundary=" + boundary, "OData-MaxVersion": "4.0", "OData-Version": "4.0", "Accept": "application/json" },
          body,
          credentials: "same-origin",
          signal: runSignal(myRun),
        }, 4, aborted);
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
              if (seen.has(rowIdx) || refused.has(rowIdx)) continue;
              results.log.push({ row: rowIdx, status: "ERROR", msg: "No response received from batch" });
              results.errors.push({ row: rowIdx, msg: "No response received from batch", payload: "" });
            }
          }
        } else {
          // A 401 on the $batch endpoint means the SESSION died mid-run — serial-falling-back
          // would grind through thousands of doomed per-row requests with no reconnect banner
          // (audit finding). Throw the session marker so the bridge stops the pool and the UI
          // shows Reconnect; rows of this and later chunks become explicit retryable errors.
          if (resp.status === 401) throw new Error("SESSION_EXPIRED: Session expired mid-run — refresh D365 (F5), reconnect, then retry the remaining rows");
          for (let i = 0; i < chunk.length; i++) {
            const rowIdx = batch + i + 1;
            if (aborted()) break; // cancelled — stop the serial fallback
            if (refused.has(rowIdx)) continue;
            try { await dvRequest("DELETE", buildPath(chunk[i]).path, null, bypassHeaderObjD || undefined); results.deleted++; results.log.push({ row: rowIdx, status: "DELETED" }); }
            catch (e) { const msg = e.message?.substring(0, 500) || "Error"; results.errors.push({ row: rowIdx, msg, payload: "" }); results.log.push({ row: rowIdx, status: "ERROR", msg }); }
          }
        }
      } catch (batchErr) {
        for (let i = 0; i < chunk.length; i++) {
          const rowIdx = batch + i + 1;
          if (aborted()) break; // cancelled — stop the serial fallback
          if (refused.has(rowIdx)) continue;
          try { await dvRequest("DELETE", buildPath(chunk[i]).path, null, bypassHeaderObjD || undefined); results.deleted++; results.log.push({ row: rowIdx, status: "DELETED" }); }
          catch (e) { const msg = e.message?.substring(0, 500) || "Error"; results.errors.push({ row: rowIdx, msg, payload: "" }); results.log.push({ row: rowIdx, status: "ERROR", msg }); }
        }
      }
    }
    padAbortedRows(results, items.length, myRun);
    result = results;
    return result;
  },
  async update(params) {
    let result;
    validateEntitySet(params.entitySet);
    if (params.id) validateGuid(params.id);
    // If-Match: * = update only. A bare PATCH upserts: a wrong id would CREATE a record instead of failing.
    result = await dvRequest("PATCH", `${params.entitySet}(${params.id})`, params.data, { "If-Match": "*" });
    return result;
  },
  async getCurrentRecord(params) {
    let result;
    result = getCurrentRecord();
    return result;
  },
  async createUserQuery(params) {
    let result;
    // A personal view (userquery) of one table: only its owner sees it, in the app's view
    // selector — Dynamics 365 can share it from there.
    validateName(params.entity, "entity");
    const vName = String(params.name || "").replace(/[\x00-\x1f\x7f]/g, "").trim().slice(0, 200);
    if (!vName) throw new Error("The view needs a name.");
    if (!/^\s*<fetch\b/i.test(params.fetchxml || "") || !/^\s*<grid\b/i.test(params.layoutxml || "")) throw new Error("Invalid view definition.");
    const created = await dvRequest("POST", "userqueries", {
      name: vName, returnedtypecode: params.entity, fetchxml: params.fetchxml, layoutxml: params.layoutxml,
      querytype: 0, description: String(params.description || "Saved from Colvio").slice(0, 2000),
    }, { Prefer: "return=representation" });
    result = { id: created?.userqueryid || null };
    return result;
  },
  async probe(params) {
    let result;
    // Lightweight permission probe — returns true if endpoint is accessible
    await dvRequest("GET", params.url);
    result = true;
    return result;
  },
  async recordAuditTrail(params) {
    let result;
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
    return result;
  },
  async auditDetails(params) {
    let result;
    // Field-level old->new diff for one audit row (RetrieveAuditDetails function).
    validateGuid(params.auditId);
    result = await dvRequest("GET", `audits(${params.auditId})/Microsoft.Dynamics.CRM.RetrieveAuditDetails()`);
    return result;
  },
  async deletesByEntity(params) {
    let result;
    // Best-effort: WHO deleted / WHEN, from the audit log (action=Delete) for one table.
    // "Deleted by" isn't a column on the bin record — the delete event lives in `audits`.
    // ONE query (not per-row) → map { objectIdLower: {by, on} }. null on failure / audit off.
    validateName(params.logicalName, "logicalName");
    try {
      const topD = Math.min(Math.max(parseInt(params.top, 10) || 2000, 1), 5000);
      const data = await dvRequest("GET",
        `audits?$select=_objectid_value,_userid_value,createdon&$filter=action eq 3 and objecttypecode eq '${params.logicalName}' and createdon ge ${new Date(Date.now() - 90 * 86400000).toISOString()}&$orderby=createdon desc&$top=${topD}`);
      const map = {};
      for (const a of (data?.value || [])) {
        const oid = String(a._objectid_value || "").toLowerCase();
        if (oid && !map[oid]) map[oid] = { by: a["_userid_value@OData.Community.Display.V1.FormattedValue"] || "", on: a.createdon };
      }
      result = map;
    } catch { result = null; }
    return result;
  },
  async recycleBinTables(params) {
    let result;
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
    return result;
  },
  async restoreRecord(params) {
    let result;
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
    return result;
  },
};
export default ACTIONS;
