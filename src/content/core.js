// Content script › core — what every action shares. Bundled with index.js and the action
// modules into dist/content.js (vite.content.config.js). Validation of what the panel sends, the
// D365 context, the per-run abort state of the bulk pipelines, the API meter and pacing, the
// request layer (dvRequest / rawRequest), counting, $batch retries, the privilege catalog, the
// record open in the tab. The three actions that ASSIGN this module's state live here too.


// ── Security: input validation ──────────────────────────
export const SAFE_NAME = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
export const SAFE_GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validateName(v, label) {
  if (!v || !SAFE_NAME.test(v)) throw new Error(`Invalid ${label}: "${v}". Only alphanumeric and underscores allowed.`);
  return v;
}
export function validateEntitySet(v) {
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
export function validateGuid(v) {
  if (v && !SAFE_GUID.test(v)) throw new Error(`Invalid GUID format: "${v}"`);
  return v;
}
export function sanitizeSearchTerm(v) {
  if (typeof v !== "string") return "";
  return v.replace(/[\x00-\x1f]/g, "").substring(0, 100).replace(/'/g, "''");
}
// An OData string literal, ready for a URL: quotes doubled, control chars dropped, then
// percent-encoded — a raw "&" split the query string, "%" was an invalid escape, "+" read as a
// space ("john+doe@x" matched nothing, "R&D Manager" 400'd). fetch() leaves those three alone.
export const odataStr = (v) => encodeURIComponent("'" + String(v ?? "").replace(/[\x00-\x1f\x7f]/g, "").replace(/'/g, "''") + "'");

// The Dataverse clouds the manifest covers — commercial, US Government, China.
export const D365_HOST_SUFFIXES = [".dynamics.com", ".microsoftdynamics.us", ".dynamics.cn"];

// The URL segment addressing ONE record by key — shared by batchUpsert, batchDeleteKeyed and the
// serial fallbacks, so a fix lands in every transport. Returns { path } or { error }: a key the
// table can't address is REFUSED per row, never "cleaned" into another key (the old numeric
// allow-list turned "SAP-00123" into -00123 and wrote THAT record — audit finding). Alternate-key
// values are percent-encoded: inside a $batch request line a space, "%", "?" or "#" otherwise
// mis-parses the part (the serial fallback went through fetch, which encodes, so the same row
// failed in one transport and passed in the other).
export const stripCtrl = (v) => String(v ?? "").replace(/[\x00-\x1f\x7f]/g, "");
export const GUID_KEY_RE = /^\{?[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\}?$/;
export const NUMERIC_KEY_RE = /^[+-]?\d+(\.\d+)?$/;
export function buildKeyPath(entitySet, keyField, value, { isPrimaryKey = false, keyIsNumeric = false } = {}) {
  const v = stripCtrl(value).trim();
  if (!v) return { error: "Empty key value" };
  if (isPrimaryKey) {
    if (!GUID_KEY_RE.test(v)) return { error: `"${v.slice(0, 60)}" is not a GUID` };
    return { path: `${entitySet}(${v.replace(/[{}]/g, "").toLowerCase()})` };
  }
  if (keyIsNumeric) {
    if (!NUMERIC_KEY_RE.test(v)) return { error: `Key ${keyField}="${v.slice(0, 60)}" is not a number — the column is numeric, the row was not sent` };
    return { path: `${entitySet}(${keyField}=${v})` };
  }
  return { path: `${entitySet}(${keyField}=${encodeURIComponent("'" + v.replace(/'/g, "''") + "'")})` };
}

export let d365Context = null;

// ── Context D365 ─────────────────────────────────────────
// Content scripts run in the isolated world: window.Xrm is never visible here, so the org is
// read from the page's origin (the manifest already restricts injection to the Dataverse hosts).
// Every cloud the manifest covers is accepted — the commercial-only check left GCC and China
// orgs with "D365 context not detected" on every action (audit finding).
export function extractContext() {
  try {
    const url = window.location.origin;
    const host = new URL(url).hostname;
    if (D365_HOST_SUFFIXES.some(sfx => host.endsWith(sfx))) {
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
export let batchAborted = false;// "the current run is aborted" — read by the 429 back-off loops
// Run tokens: resetBatchAbort mints one per bulk run (the bridge passes it on every chunk and on
// abortBatch). Abort state is PER RUN: several bulk runs can share a tab (the Loader imports
// while the Explorer bulk-deletes) and a single global flag let a cancel in one of them abort
// the other, and a newer run's reset make an older run's chunk stop mid-loop with its rows
// neither sent nor logged (audit finding). An orphaned loop (its bridge call timed out, the user
// clicked Retry) is stopped by the timeout's own abortBatch(runId) — and the run's in-flight
// $batch fetch is aborted with it, so the server stops as soon as it can.
export let batchRunId = 0;
export const abortedRuns = new Set();
export const runControllers = new Map();// runId → AbortController of its in-flight $batch fetches
export const runSignal = (runId) => {
  let c = runControllers.get(runId);
  if (!c) { c = new AbortController(); runControllers.set(runId, c); }
  return c.signal;
};
export const isRunAborted = (runId) => abortedRuns.has(runId);

// When an abort (user cancel, or the panel's chunk-timeout abort) short-circuits a batch loop,
// the untouched rows must NOT vanish from the results — the run would look "done" while most of
// the file was never sent. Give every row with no log entry an explicit, RETRYABLE error, and
// tell the panel this call ended aborted so it stops dispatching further chunks.
export const padAbortedRows = (results, total, runId) => {
  results.aborted = isRunAborted(runId);
  if (!results.aborted) return;
  const seen = new Set(results.log.map(e => e.row));
  const msg = "Aborted before send — the run stopped early (chunk timeout or cancel); retry to send this row";
  for (let i = 1; i <= total; i++) {
    if (seen.has(i)) continue;
    results.log.push({ row: i, status: "ERROR", msg });
    results.errors.push({ row: i, msg, payload: "" });
  }
};

// ── API meter and pacing ───────────────────────────────────
// Dataverse service protection: ~6,000 requests per user per 5-minute sliding window (each
// operation inside a $batch counts). Every request Colvio sends is logged here; above 90 % of the
// quota the next request WAITS for the window to slide instead of hitting a 429 and its back-off.
// The panel reads the meter (getApiStats) for its sidebar.
export const API_WINDOW_MS = 300000, API_LIMIT = 6000, API_PACE_AT = 5400;
export const apiLog = [];
export let apiTotal = 0, apiPacedMs = 0;
export const apiTrim = (now) => { while (apiLog.length && apiLog[0] < now - API_WINDOW_MS) apiLog.shift(); };
export async function apiPace(n = 1) {
  let now = Date.now();
  apiTrim(now);
  if (apiLog.length + n > API_PACE_AT) {
    // wait until enough of the oldest entries leave the window
    const idx = Math.min(apiLog.length - 1, apiLog.length + n - API_PACE_AT - 1);
    const waitMs = Math.max(0, apiLog[Math.max(0, idx)] + API_WINDOW_MS - now);
    if (waitMs > 0) { await new Promise(r => setTimeout(r, Math.min(waitMs, 60000))); apiPacedMs += Math.min(waitMs, 60000); now = Date.now(); apiTrim(now); }
  }
  for (let i = 0; i < n; i++) apiLog.push(now);
  apiTotal += n;
}
export const batchOps = (body) => Math.max(1, (String(body || "").match(/Content-Type:\s*application\/http/gi) || []).length);

// Annotations: formatted values and lookup table names are what the UI shows; the paging cookie
// and record-count annotations drive FetchXML paging. associatednavigationproperty — one more
// string per lookup per row — is read nowhere, so it isn't requested (smaller pages). Callers
// reading ids only opt out of annotations altogether with NO_ANN.
export const ANNOTATIONS = "OData.Community.Display.V1.FormattedValue,Microsoft.Dynamics.CRM.lookuplogicalname,Microsoft.Dynamics.CRM.fetchxmlpagingcookie,Microsoft.Dynamics.CRM.morerecords,Microsoft.Dynamics.CRM.totalrecordcount,Microsoft.Dynamics.CRM.totalrecordcountlimitexceeded";
export const NO_ANN = { "X-Colvio-Annotations": "none" };

export async function dvRequest(method, path, body = null, extraHeaders = null) {
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
  const noAnn = headers["X-Colvio-Annotations"] === "none";
  const allAnn = headers["X-Colvio-Annotations"] === "all";
  delete headers["X-Colvio-Annotations"];

  const isWrite = method === "POST" || method === "PATCH" || method === "DELETE" || method === "PUT";

  // For reads: request the annotations the UI uses (see ANNOTATIONS). For writes: nothing
  // special. Append to (not clobber) any caller-supplied Prefer — e.g. odata.maxpagesize for
  // server-driven paging — so both travel together.
  if (!isWrite && !noAnn && !path.includes("EntityDefinitions")) {
    const ann = `odata.include-annotations="${allAnn ? "*" : ANNOTATIONS}"`;
    headers["Prefer"] = headers["Prefer"] ? `${headers["Prefer"]},${ann}` : ann;
  }

  // Timeout: 25s for writes, 60s for reads (roles/privileges can be large). The recycle-bin
  // Restore action gets 9.5 min: Dataverse re-creates cascade-deleted children synchronously,
  // which routinely blows past 25s on parent records (user hit "timeout after ~30s" on real
  // restores) — the bridge caps this call at 10 min.
  // PublishXml and metadata creates (columns, relationships) are synchronous server-side jobs
  // that take minutes on big orgs — same 9.5 min budget as Restore.
  // PublishAllXml, ExportTranslation / ImportTranslation and a heavy owner's business-unit move
  // are the same kind of synchronous job (minutes on a real solution); the 25 s budget made the
  // panel report "publish failed" / "move failed" while the server was still finishing, and the
  // user re-ran the import (audit finding). A caller can also ask for the long budget explicitly
  // with the X-Colvio-Long header (stripped before sending).
  const longHint = headers["X-Colvio-Long"] === "1";
  delete headers["X-Colvio-Long"];
  const isRestore = longHint || path === "Restore" || path === "PublishXml" || path === "PublishAllXml" || path === "RelationshipDefinitions" || path === "ImportTranslation" || /ExportTranslation$/.test(path) || /^EntityDefinitions\([^)]*\)\/Attributes$/.test(path);
  // Pacing waits BEFORE the timer is armed — a paced request must never read as "D365 did not respond".
  await apiPace();
  const budgetMs = isRestore ? 570000 : isWrite ? 25000 : 60000;
  let controller = new AbortController();
  let timeout = setTimeout(() => controller.abort(), budgetMs);

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
      await apiPace();
      // each retry gets its own timer — a retried request used to carry no signal at all and
      // could hang in the content script forever (the panel's timeout fired, the request leaked)
      controller = new AbortController();
      timeout = setTimeout(() => controller.abort(), budgetMs);
      resp = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined, credentials: "same-origin", signal: controller.signal });
      clearTimeout(timeout);
    }

    if (!resp.ok) {
      // 401 = session gone. 403 = INSUFFICIENT PRIVILEGE — lumping it into "session expired"
      // sent users into a pointless reconnect loop that masked the real cause (audit finding).
      if (resp.status === 401) {
        throw new Error("SESSION_EXPIRED: Session expired — refresh D365 (F5)");
      }
      if (resp.status === 403) {
        let privMsg = "";
        try { const t403 = await resp.text(); const j403 = JSON.parse(t403); privMsg = j403?.error?.message || ""; } catch { /* no details */ }
        throw new Error(`HTTP 403: ${privMsg || "Insufficient privileges for this operation"} (permission error — your security roles, not your session)`);
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
    // /$count answers text/plain — returned as text (it used to come back as {status, ok}, which
    // parseInt read as NaN: every table count showed 0; audit finding)
    if (ct.includes("text/plain")) return await resp.text();
    return { status: resp.status, ok: true };
  } catch (e) {
    clearTimeout(timeout);
    if (e.name === "AbortError") throw new Error(`Timeout: D365 did not respond within ${isRestore ? "9.5 minutes" : isWrite ? "25s" : "60s"}`);
    throw e;
  }
}

// An exact "how many rows match": $count=true is honest only below 5,000 (Dataverse caps the
// annotation there and the Security Audit showed "5000 users" for a 12,000-holder role — audit
// finding); past the cap the ids are paged and counted (5,000 a page, 50 pages).
export async function countByFilter(entitySet, idField, filter) {
  const d = await dvRequest("GET", `${entitySet}?$select=${idField}&$top=1&$count=true&$filter=${filter}`, null, NO_ANN);
  const c = d["@odata.count"];
  if (c == null) return (d.value || []).length;
  if (c < 5000) return c;
  let n = 0, guard = 0, url = `${entitySet}?$select=${idField}&$filter=${filter}`;
  while (url && guard++ < 50) {
    const pg = await dvRequest("GET", url, null, { Prefer: "odata.maxpagesize=5000", ...NO_ANN });
    n += (pg.value || []).length;
    url = pg["@odata.nextLink"] || null;
  }
  return n;
}

// Fetch a $batch with automatic 429 (Service Protection) backoff. Dataverse counts every
// operation inside a $batch against the request budget, so big loads can hit 429 — this honors
// Retry-After (capped) and retries the same batch instead of surfacing a throttle as a row error.
export async function fetchBatchWithRetry(url, options, maxRetries = 4, isAborted = () => batchAborted) {
  let attempt = 0;
  const ops = batchOps(options && options.body);
  while (true) {
    await apiPace(ops);
    const resp = await fetch(url, options);
    if (resp.status !== 429 || attempt >= maxRetries || isAborted()) return resp;
    const ra = parseInt(resp.headers.get("Retry-After") || "", 10);
    const waitMs = Math.min(isNaN(ra) ? 2 * (attempt + 1) : ra, 30) * 1000; // cap 30s
    await new Promise(r => setTimeout(r, waitMs));
    if (isAborted()) return resp; // user cancelled during the back-off — never re-send writes
    attempt++;
  }
}

// The org's privilege catalog (id → { name, accessRight }), loaded once per page and shared by
// the Security actions. Built in a local map and published only when every page has arrived: the
// two inline copies this replaces set the cache BEFORE loading, so one failed page left a partial
// catalog that every later call trusted (privileges shown as bare GUIDs until a D365 reload).
// FetchXML page numbers — more reliable here than @odata.nextLink.
export let privCatalog = null;
// Entity set name per table, for FetchXML: one metadata read per table per page load — it used to
// be read again for EVERY page of a FetchXML result (400 pages = 400 extra requests).
export const fxEntitySets = new Map();
export async function ensurePrivCatalog() {
  if (privCatalog) return privCatalog;
  const map = {};
  let page = 1, more = true;
  while (more) {
    const fx = `<fetch page="${page}" count="5000"><entity name="privilege"><attribute name="privilegeid"/><attribute name="name"/><attribute name="accessright"/><order attribute="privilegeid"/></entity></fetch>`;
    const d = await dvRequest("GET", `privileges?fetchXml=${encodeURIComponent(fx)}`, null, NO_ANN);
    const b = d.value || [];
    b.forEach(p => { map[p.privilegeid] = { name: p.name, accessRight: p.accessright }; });
    more = b.length === 5000; page++;
  }
  privCatalog = map;
  return map;
}

// Raw same-org request (API Tester, Script Console): the response is RETURNED, never thrown —
// a 4xx/5xx is the caller's to read. Host-locked to the user's org; method allow-list.
export async function rawRequest(params, timeoutMs, { apiOnly = false } = {}) {
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
    const finalUrl = new URL(url, ctxApi.clientUrl);
    if (finalUrl.hostname !== baseHost) throw new Error(`URL not allowed: resolved host ${finalUrl.hostname} is not your D365 org host (${baseHost})`);
    // Script Console: the Web API only — checked on the RESOLVED path, as fetch() will send it
    // ("..", "%2e%2e" and "\" collapse before the request leaves)
    if (apiOnly && !/^\/api\/data\/v\d+(\.\d+)?\//i.test(finalUrl.pathname)) throw new Error(`Only Web API paths (/api/data/…) are allowed: ${finalUrl.pathname}`);
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
  // before the timer, like dvRequest; a $batch counts every operation it carries
  await apiPace(hasBody && typeof params.body === "string" ? batchOps(params.body) : 1);
  const t0 = Date.now();
  const ctrl = new AbortController();
  const tmo = setTimeout(() => ctrl.abort(), timeoutMs);
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
    return {
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
    return {
      ok: false,
      status: 0,
      statusText: e.name === "AbortError" ? `Timeout (${Math.round(timeoutMs / 1000)}s)` : "Network error",
      headers: {},
      body: e.message || String(e),
      bodyParsed: null,
      elapsed: Date.now() - t0,
      url,
      clientError: true,
    };
  }
}

// ── Record URL detection ──────────────────────────────────
export function getCurrentRecord() {
  try {
    const p = new URLSearchParams(window.location.search);
    if (p.get("etn") && p.get("id")) return { entityType: p.get("etn"), recordId: p.get("id").replace(/[{}]/g, "") };
    const m = window.location.hash.match(/\/(\w+)\/([0-9a-f-]{36})/i);
    if (m) return { entityType: m[1], recordId: m[2] };
  } catch {}
  return null;
}

// ── Actions that assign the state above (ES module bindings can't be assigned from outside) ──
export const coreActions = {
  async getContext(params) {
    let result;
    d365Context = extractContext();
    // Enrich with authoritative OrganizationType from the Web API.
    // Documented enum members (Web API OrganizationType EnumType): "Customer" = primary
    // org, "Secondary" = production instances (a customer PROD reports one of THOSE —
    // there is NO "Production" member), "CustomerTest"/"CustomerFreeTest" = sandbox,
    // "TestDrive"/"EmailTrial"/"Trial", "Developer", "Default", "Teams", "Support"…
    // The panel maps them in envDetect.js (pure, tested, unknown ⇒ presumed prod).
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
    return result;
  },
  async resetBatchAbort(params) {
    let result;
    batchRunId++;
    batchAborted = false;
    for (const k of [...runControllers.keys()]) if (k < batchRunId - 8) runControllers.delete(k); // finished runs
    result = { ok: true, runId: batchRunId };
    return result;
  },
  async abortBatch(params) {
    let result;
    // the run named by the caller (the bridge always names it); a nameless abort = the current run
    const rid = Number.isFinite(Number(params.runId)) ? Number(params.runId) : batchRunId;
    abortedRuns.add(rid);
    try { runControllers.get(rid)?.abort(); } catch { /* no fetch in flight */ }
    if (rid === batchRunId) batchAborted = true;
    result = { ok: true };
    return result;
  },
};
