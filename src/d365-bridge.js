/**
 * d365-bridge.js — Colvio Bridge API — panel React <-> Dataverse
 *
 * Two modes:
 *   1. Chrome Extension (panel.html opened in a tab)
 *      -> chrome.runtime.sendMessage -> background.js -> content.js -> fetch D365
 *
 *   2. Standalone (npm run dev)
 *      -> Mock data built into the app, no network calls
 */

// ── Detection ────────────────────────────────────────────────
const isExtension = typeof chrome !== "undefined" && !!chrome?.runtime?.id && !!chrome?.runtime?.sendMessage;

// Get D365 tabId from panel URL params
function getD365TabId() {
  try {
    const params = new URLSearchParams(window.location.search);
    return parseInt(params.get("tabId"), 10) || null;
  } catch { return null; }
}

function getOrgUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("orgUrl") || null;
  } catch { return null; }
}

// ── Metadata Cache (chrome.storage.local) ───────────────────
// TTL: entities=2h, fields/lookups=1h, entitySet=24h
const CACHE_TTL = { entities: 7200000, fields: 3600000, lookups: 3600000, entitySet: 86400000 };
const memCache = {}; // In-memory fast cache (per session)

async function cacheGet(key) {
  // 1. In-memory (instant)
  if (memCache[key] && Date.now() < memCache[key].exp) return memCache[key].data;
  // 2. chrome.storage.local (persistent)
  if (isExtension && chrome.storage?.local) {
    try {
      const result = await new Promise(r => chrome.storage.local.get([key], r));
      if (result[key] && Date.now() < result[key].exp) {
        memCache[key] = result[key]; // Promote to memory
        return result[key].data;
      }
    } catch {}
  }
  return null;
}

async function cacheSet(key, data, ttl) {
  const entry = { data, exp: Date.now() + ttl };
  memCache[key] = entry;
  if (isExtension && chrome.storage?.local) {
    try { chrome.storage.local.set({ [key]: entry }); } catch {}
  }
}

async function cacheClear() {
  Object.keys(memCache).forEach(k => delete memCache[k]);
  if (isExtension && chrome.storage?.local) {
    try {
      const all = await new Promise(r => chrome.storage.local.get(null, r));
      const metaKeys = Object.keys(all).filter(k => k.startsWith("d365_cache_"));
      if (metaKeys.length) chrome.storage.local.remove(metaKeys);
    } catch {}
  }
}

function cacheKey(type, name) { return `d365_cache_${getOrgUrl()||"default"}_${type}_${name||"all"}`; }

// ── Session expired handling ─────────────────────────────────
let sessionExpired = false;
const sessionListeners = new Set();
export function onSessionExpired(cb) { sessionListeners.add(cb); return () => sessionListeners.delete(cb); }
export function clearSessionExpired() { sessionExpired = false; }

// ── Rate limiting ────────────────────────────────────────────
const callTimestamps = [];
// 30 calls/sec covers normal browsing AND parallel batch operations.
// Dataverse tolerates ~6000 requests / 5 min per user (~20 req/sec sustained),
// so 30/sec is OK for short bursts and Dataverse will 429-throttle if exceeded.
const RATE_LIMIT = 30; // max calls per second

// ── Communication with background script ─────────────────────
let reqId = 0;

async function callD365(action, params = {}) {
  // Rate limiting
  const now = Date.now();
  callTimestamps.push(now);
  while (callTimestamps.length && callTimestamps[0] < now - 1000) callTimestamps.shift();
  if (callTimestamps.length >= RATE_LIMIT) {
    await new Promise(r => setTimeout(r, 100 * (callTimestamps.length - RATE_LIMIT + 1)));
  }

  return new Promise((resolve, reject) => {
    if (!isExtension) { reject(new Error("Not in extension")); return; }

    const id = ++reqId;
    let settled = false;

    // Timeout: batch operations get 5 minutes, normal ops get 30s
    const isLongOp = action === "batchCreate" || action === "batchUpsert" || action === "batchDeleteKeyed" || action === "getAllUsers" || action === "getAllRoles" || action === "getRolePrivileges" || action === "getRoleUsers" || action === "getRoleUserCount";
    const timeoutMs = isLongOp ? 600000 : 30000;
    const timer = setTimeout(() => {
      if (!settled) { settled = true; reject(new Error(`Timeout after ${timeoutMs/1000}s — action: ${action}`)); }
    }, timeoutMs);

    chrome.runtime.sendMessage(
      {
        __d365InspectorRequest: true,
        id,
        action,
        params,
        d365TabId: getD365TabId(),
      },
      (response) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response?.error) {
          if (response.error.includes("SESSION_EXPIRED") || response.error.includes("401") || response.error.includes("403")) {
            sessionExpired = true;
            sessionListeners.forEach(cb => cb());
          }
          reject(new Error(response.error));
        } else {
          resolve(response?.result);
        }
      }
    );
  });
}

// ── Public API ───────────────────────────────────────────────
export const bridge = {
  isExtension,

  getOrgUrl,

  async getContext() {
    if (isExtension) return callD365("getContext");
    return {
      clientUrl: "https://org-demo.crm4.dynamics.com",
      orgName: "org-demo",
      apiVersion: "v9.2",
      source: "standalone_mock",
      isProduction: false,
    };
  },

  async checkPermissions() {
    if (!isExtension) return { canReadAudit: true, canReadSolutions: true, canReadAllUsers: true, canBypassPlugins: true, canPublish: true };
    const probe = async (url) => {
      try { await callD365("probe", { url }); return true; } catch { return false; }
    };
    const checkAdmin = async () => {
      try { return !!(await callD365("isSystemAdmin")); } catch { return false; }
    };
    // NOTE: canPublish is intentionally NOT probed here — it chains 3 requests (WhoAmI →
    // privilege id → RetrieveUserPrivileges) and this function gates the first paint of the
    // tab bar. Call checkPublishPrivilege() separately (cached); default fail-open.
    const [canReadAudit, canReadSolutions, canReadAllUsers, canBypassPlugins] = await Promise.all([
      probe("audits?$top=1&$select=createdon"),
      probe("solutions?$top=1&$filter=isvisible eq true&$select=solutionid"),
      probe("systemusers?$top=1&$select=systemuserid"),
      checkAdmin(),
    ]);
    return { canReadAudit, canReadSolutions, canReadAllUsers, canBypassPlugins, canPublish: true };
  },

  // ── Record audit history ─────────────────────────────────────
  async getRecordAuditTrail(id, top = 50) {
    if (!isExtension) return [];
    return callD365("recordAuditTrail", { id, top });
  },
  async getAuditDetails(auditId) {
    if (!isExtension) return null;
    return callD365("auditDetails", { auditId });
  },

  // ── Recycle bin (Dataverse "keep deleted records") ───────────
  async recycleBinStatus() {
    // Delegates to the cached org-features probe — one shared roundtrip per session.
    const f = await this.getOrgFeatures();
    return f?.recycleBin || { enabled: false, unknown: true };
  },
  async restoreRecord(entitySet, id) {
    if (!isExtension) return { id };
    return callD365("restoreRecord", { entitySet, id });
  },
  // Logical names of tables enabled for restore (cached 10 min, org-scoped). null = couldn't
  // determine (no privilege / older org) → the UI should fall back to showing all tables.
  // Best-effort map { objectIdLower: {by, on} } of who/when deleted records of a table (audit log).
  // Returns {} or null when unavailable (audit off / no privilege) — caller treats as "unknown".
  async recordsDeletedBy(logicalName, top = 2000) {
    if (!isExtension) return {};
    try { return await callD365("deletesByEntity", { logicalName, top }); } catch { return null; }
  },
  async recycleBinTables() {
    if (!isExtension) return ["account", "contact"];
    const k = cacheKey("rbtables", "all");
    const cached = await cacheGet(k);
    if (cached) return cached.list;
    try {
      const list = await callD365("recycleBinTables");
      if (Array.isArray(list)) { await cacheSet(k, { list }, 600000); return list; }
      return null;
    } catch { return null; }
  },

  // Access rights of the current user on one record ("ReadAccess,WriteAccess,..."), or null when
  // undetermined. Used to pre-check inline edit; callers should fail-open on null.
  async getRecordAccess(entitySet, id) {
    if (!isExtension) return "ReadAccess,WriteAccess";
    try { return await callD365("principalAccess", { entitySet, id }); } catch { return null; }
  },

  // Publish privilege, resolved OFF the startup path and cached 6h (org-scoped). Fail-open:
  // the server still enforces publish rights; this only refines the Translations UI.
  async checkPublishPrivilege() {
    if (!isExtension) return true;
    const k = cacheKey("priv", "publish");
    const cached = await cacheGet(k);
    if (cached !== null) return cached.value;
    let value = true;
    try { const r = await callD365("hasPrivilege", { privilegeName: "prvPublishCustomization" }); value = r !== false; } catch {}
    await cacheSet(k, { value }, 21600000); // 6h
    return value;
  },

  // Org-level feature switches (audit, plugin traces, recycle bin) — ONE probe per session,
  // cached 10 min (org-scoped) so tab badges and module banners never re-query.
  async getOrgFeatures() {
    if (!isExtension) return { auditEnabled: true, pluginTraceSetting: 2, recycleBin: { enabled: true, retentionDays: 30 } };
    const k = cacheKey("orgfeat", "all");
    const cached = await cacheGet(k);
    if (cached) return cached;
    try {
      const data = await callD365("orgFeatures");
      if (data) await cacheSet(k, data, 600000);
      return data || { auditEnabled: null, pluginTraceSetting: null, recycleBin: { enabled: false, unknown: true } };
    } catch { return { auditEnabled: null, pluginTraceSetting: null, recycleBin: { enabled: false, unknown: true } }; }
  },

  async getEntities() {
    if (!isExtension) return null;
    const k = cacheKey("entities");
    const cached = await cacheGet(k);
    if (cached) return cached;
    const data = await callD365("getEntities");
    if (data) await cacheSet(k, data, CACHE_TTL.entities);
    return data;
  },

  async getEntityCount(entitySet) {
    if (isExtension) return callD365("getEntityCount", { entitySet });
    return Math.floor(Math.random() * 10000);
  },

  async getEntitySet(logicalName) {
    if (!isExtension) return logicalName + "s";
    const k = cacheKey("entitySet", logicalName);
    const cached = await cacheGet(k);
    if (cached) return cached;
    const data = await callD365("getEntitySet", { logicalName });
    if (data) await cacheSet(k, data, CACHE_TTL.entitySet);
    return data;
  },

  async getFields(logicalName) {
    if (!isExtension) return null;
    const k = cacheKey("fields", logicalName);
    const cached = await cacheGet(k);
    if (cached) return cached;
    const data = await callD365("getFields", { logicalName });
    if (data) await cacheSet(k, data, CACHE_TTL.fields);
    return data;
  },

  async query(entitySet, options = {}) {
    if (isExtension) return callD365("query", { entitySet, options });
    return null;
  },

  async queryRaw(path) {
    if (isExtension) return callD365("queryRaw", { path });
    return null;
  },

  // Ad-hoc request runner used by the API Tester module.
  // Returns { ok, status, statusText, headers, body, bodyParsed, elapsed, url, clientError? }
  // — does NOT throw on 4xx/5xx; caller renders the raw response so the user
  // can inspect Dataverse error messages directly.
  async customRequest({ method, path, headers, body }) {
    if (!isExtension) {
      return {
        ok: true, status: 200, statusText: "OK",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mock: true, method, path }, null, 2),
        bodyParsed: { mock: true, method, path },
        elapsed: 42, url: path,
      };
    }
    return callD365("customRequest", { method, path, headers, body });
  },

  async executeFetchXml(fetchXml) {
    if (isExtension) return callD365("fetchXml", { fetchXml });
    return { records: [], count: 0, moreRecords: false };
  },

  async create(entitySet, data) {
    if (isExtension) {
      const res = await callD365("create", { entitySet, data });
      return res;
    }
    return { id: crypto.randomUUID(), ...data };
  },

  async batchDelete(entitySet, ids) {
    if (isExtension) {
      return callD365("batchDelete", { entitySet, ids });
    }
    return { deleted: ids.length, errors: [] };
  },

  // withCanDelete: also fetch the CanBeDeleted managed property (best-effort; only the bulk-delete
  // pre-check needs it). Left off elsewhere so a non-selectable CanBeDeleted can't 400 the call.
  async getEntityMetadata(logicalName, withCanDelete = false) {
    if (!isExtension) return { canBeDeleted: true, displayName: logicalName };
    return callD365("getEntityMetadata", { logicalName, withCanDelete });
  },

  // CHUNK = 100 matches content.js's HTTP $batch size, giving one progress update
  // per Dataverse roundtrip (~100-300ms). Each chunk brings back any errors from
  // its 100 records, so error counts surface in real-time during the run.
  // Chrome's 64 MB IPC limit: 100 records × ~50 KB ≈ 5 MB, well under the cap.
  // shouldAbort is checked between chunks; the in-flight HTTP batch completes
  // before the loop exits (no way to cancel content.js mid-roundtrip).
  // Worker-pool parallelism: CONCURRENCY chunks fly to Dataverse in parallel,
  // each chunk is a single multipart $batch request of 100 records.
  // Throughput improves ~CONCURRENCY× for typical Dataverse latencies (~200-400ms/roundtrip).
  // Dataverse Service Protection allows up to 52 concurrent calls per session,
  // so CONCURRENCY=5 is well within bounds and keeps headroom for other operations.
  async batchCreate(entitySet, records, onProgress, shouldAbort, opts = {}) {
    if (!isExtension) return { created: records.length, errors: [], log: [] };
    // Clear any stale abort flag in the content script, and prepare a once-only notifier so a
    // user cancel also stops retries/chunks already running inside the content script.
    try { await callD365("resetBatchAbort"); } catch {}
    let abortNotified = false;
    const notifyAbort = () => { if (!abortNotified) { abortNotified = true; callD365("abortBatch").catch(() => {}); } };
    const CHUNK = Math.max(1, Math.min(500, opts.chunk || 100));
    const CONCURRENCY = Math.max(1, Math.min(10, opts.concurrency || 5));
    // MSCRM bypass headers — forwarded per-chunk; content.js injects them on each
    // individual operation inside the multipart $batch body.
    const bypass = {
      bypassPlugins: !!opts.bypassPlugins,
      suppressDuplicates: !!opts.suppressDuplicates,
      bypassSyncLogic: !!opts.bypassSyncLogic,
    };
    const agg = { created: 0, errors: [], log: [], aborted: false };
    const chunks = [];
    for (let i = 0; i < records.length; i += CHUNK) chunks.push({ start: i, slice: records.slice(i, i + CHUNK) });

    let nextIdx = 0;
    let processedRecords = 0;
    const worker = async () => {
      while (true) {
        if (shouldAbort?.()) { agg.aborted = true; notifyAbort(); return; }
        const idx = nextIdx++;
        if (idx >= chunks.length) return;
        const { start, slice } = chunks[idx];
        let chunkErrors, chunkLog;
        try {
          const r = await callD365("batchCreate", { entitySet, records: slice, ...bypass });
          agg.created += r?.created || 0;
          chunkErrors = (r?.errors || []).map(e => ({ ...e, row: (e.row || 0) + start }));
          chunkLog = (r?.log || []).map(e => ({ ...e, row: (e.row || 0) + start }));
        } catch (e) {
          // One chunk failing (a 600s timeout, network drop, content-script error) must NOT abort the
          // whole load — record its rows as per-row errors (logged + retryable) and carry on with the
          // next chunks. Previously an unhandled chunk rejection killed the entire batch.
          const msg = e?.message || String(e);
          chunkErrors = slice.map((_, i) => ({ row: start + i + 1, msg, payload: "" }));
          chunkLog = slice.map((_, i) => ({ row: start + i + 1, status: "ERROR", msg }));
        }
        if (chunkErrors.length) agg.errors.push(...chunkErrors);
        if (chunkLog.length) agg.log.push(...chunkLog);
        processedRecords += slice.length;
        onProgress?.({ done: Math.min(processedRecords, records.length), total: records.length, errorCount: agg.errors.length, newErrors: chunkErrors, newLog: chunkLog });
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, chunks.length) }, () => worker()));
    return agg;
  },

  async batchUpsert(entitySet, keyField, items, isPrimaryKey = false, onProgress, shouldAbort, opts = {}) {
    if (!isExtension) return { updated: items.length, errors: [], log: [] };
    try { await callD365("resetBatchAbort"); } catch {}
    let abortNotified = false;
    const notifyAbort = () => { if (!abortNotified) { abortNotified = true; callD365("abortBatch").catch(() => {}); } };
    const CHUNK = Math.max(1, Math.min(500, opts.chunk || 100));
    const CONCURRENCY = Math.max(1, Math.min(10, opts.concurrency || 5));
    // MSCRM bypass headers + update-only flag (If-Match: * → 404 instead of create when missing).
    const bypass = {
      bypassPlugins: !!opts.bypassPlugins,
      suppressDuplicates: !!opts.suppressDuplicates,
      bypassSyncLogic: !!opts.bypassSyncLogic,
      updateOnly: !!opts.updateOnly,
    };
    const agg = { updated: 0, errors: [], log: [], aborted: false };
    const chunks = [];
    for (let i = 0; i < items.length; i += CHUNK) chunks.push({ start: i, slice: items.slice(i, i + CHUNK) });

    let nextIdx = 0;
    let processedRecords = 0;
    const worker = async () => {
      while (true) {
        if (shouldAbort?.()) { agg.aborted = true; notifyAbort(); return; }
        const idx = nextIdx++;
        if (idx >= chunks.length) return;
        const { start, slice } = chunks[idx];
        let chunkErrors, chunkLog;
        try {
          const r = await callD365("batchUpsert", { entitySet, keyField, items: slice, isPrimaryKey, ...bypass });
          agg.updated += r?.updated || 0;
          chunkErrors = (r?.errors || []).map(e => ({ ...e, row: (e.row || 0) + start }));
          chunkLog = (r?.log || []).map(e => ({ ...e, row: (e.row || 0) + start }));
        } catch (e) {
          // One chunk failing (a 600s timeout, network drop, content-script error) must NOT abort the
          // whole load — record its rows as per-row errors (logged + retryable; a timeout classifies as
          // transient so the retry card offers exactly these rows) and carry on with the next chunks.
          const msg = e?.message || String(e);
          chunkErrors = slice.map((_, i) => ({ row: start + i + 1, msg, payload: "" }));
          chunkLog = slice.map((_, i) => ({ row: start + i + 1, status: "ERROR", msg }));
        }
        if (chunkErrors.length) agg.errors.push(...chunkErrors);
        if (chunkLog.length) agg.log.push(...chunkLog);
        processedRecords += slice.length;
        onProgress?.({ done: Math.min(processedRecords, items.length), total: items.length, errorCount: agg.errors.length, newErrors: chunkErrors, newLog: chunkLog });
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, chunks.length) }, () => worker()));
    return agg;
  },

  // Bulk DELETE by primary key or alternate key — same worker-pool + per-row log as batchUpsert.
  async batchDeleteKeyed(entitySet, keyField, items, isPrimaryKey = false, onProgress, shouldAbort, opts = {}) {
    if (!isExtension) return { deleted: items.length, errors: [], log: [] };
    try { await callD365("resetBatchAbort"); } catch {}
    let abortNotified = false;
    const notifyAbort = () => { if (!abortNotified) { abortNotified = true; callD365("abortBatch").catch(() => {}); } };
    const CHUNK = Math.max(1, Math.min(500, opts.chunk || 100));
    const CONCURRENCY = Math.max(1, Math.min(10, opts.concurrency || 5));
    const agg = { deleted: 0, errors: [], log: [], aborted: false };
    const chunks = [];
    for (let i = 0; i < items.length; i += CHUNK) chunks.push({ start: i, slice: items.slice(i, i + CHUNK) });
    let nextIdx = 0;
    let processedRecords = 0;
    const worker = async () => {
      while (true) {
        if (shouldAbort?.()) { agg.aborted = true; notifyAbort(); return; }
        const idx = nextIdx++;
        if (idx >= chunks.length) return;
        const { start, slice } = chunks[idx];
        let chunkErrors, chunkLog;
        try {
          const r = await callD365("batchDeleteKeyed", { entitySet, keyField, items: slice, isPrimaryKey });
          agg.deleted += r?.deleted || 0;
          chunkErrors = (r?.errors || []).map(e => ({ ...e, row: (e.row || 0) + start }));
          chunkLog = (r?.log || []).map(e => ({ ...e, row: (e.row || 0) + start }));
        } catch (e) {
          // One chunk failing (timeout / network / content-script error) must NOT abort the whole
          // delete — log its rows as per-row errors and carry on with the next chunks.
          const msg = e?.message || String(e);
          chunkErrors = slice.map((_, i) => ({ row: start + i + 1, msg, payload: "" }));
          chunkLog = slice.map((_, i) => ({ row: start + i + 1, status: "ERROR", msg }));
        }
        if (chunkErrors.length) agg.errors.push(...chunkErrors);
        if (chunkLog.length) agg.log.push(...chunkLog);
        processedRecords += slice.length;
        onProgress?.({ done: Math.min(processedRecords, items.length), total: items.length, errorCount: agg.errors.length, newErrors: chunkErrors, newLog: chunkLog });
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, chunks.length) }, () => worker()));
    return agg;
  },

  async upsert(entitySet, keyField, keyValue, data) {
    if (isExtension) return callD365("upsert", { entitySet, keyField, keyValue, data });
    return { status: 204 };
  },

  async getCurrentRecord() {
    if (isExtension) return callD365("getCurrentRecord");
    return null;
  },

  async getLookups(logicalName) {
    if (!isExtension) return [
      { lookupField: "parentcustomerid", navProperty: "parentcustomerid_account", targetEntity: "account", type: "single" },
      { lookupField: "ownerid", navProperty: "ownerid", targetEntity: "systemuser", type: "single" },
      { lookupField: "transactioncurrencyid", navProperty: "transactioncurrencyid", targetEntity: "transactioncurrency", type: "single" },
      { lookupField: "primarycontactid", navProperty: "primarycontactid", targetEntity: "contact", type: "single" },
      { lookupField: "preferredsystemuserid", navProperty: "preferredsystemuserid", targetEntity: "systemuser", type: "single" },
    ];
    const k = cacheKey("lookups", logicalName);
    const cached = await cacheGet(k);
    if (cached) return cached;
    const data = await callD365("getLookups", { logicalName });
    if (data) await cacheSet(k, data, CACHE_TTL.lookups);
    return data;
  },

  async getEntityKeys(logicalName) {
    if (!isExtension) return [{ logicalName: "key_accountnumber", keyAttributes: ["accountnumber"] }];
    const k = cacheKey("keys", logicalName);
    const cached = await cacheGet(k);
    if (cached) return cached;
    const data = await callD365("getEntityKeys", { logicalName });
    if (data) await cacheSet(k, data, CACHE_TTL.lookups);
    return data;
  },

  async getChildRelationships(logicalName) {
    if (!isExtension) return [
      { lookupField: "customerid", navProperty: "opportunity_customer_accounts", targetEntity: "opportunity", type: "collection" },
      { lookupField: "parentcustomerid", navProperty: "contact_customer_accounts", targetEntity: "contact", type: "collection" },
      { lookupField: "regardingobjectid", navProperty: "account_tasks", targetEntity: "task", type: "collection" },
      { lookupField: "regardingobjectid", navProperty: "account_emails", targetEntity: "email", type: "collection" },
      { lookupField: "customerid", navProperty: "order_customer_accounts", targetEntity: "salesorder", type: "collection" },
      { lookupField: "parentcustomerid", navProperty: "incident_customer_accounts", targetEntity: "incident", type: "collection" },
    ];
    const k = cacheKey("childrels", logicalName);
    const cached = await cacheGet(k);
    if (cached) return cached;
    const data = await callD365("getChildRelationships", { logicalName });
    if (data) await cacheSet(k, data, CACHE_TTL.lookups);
    return data;
  },

  async getOptionSet(entityName, fieldName, attrType) {
    if (!isExtension) return [
      { value: 0, label: "Active", color: null },
      { value: 1, label: "Inactive", color: null },
    ];
    const k = cacheKey("optset", `${entityName}.${fieldName}`);
    const cached = await cacheGet(k);
    if (cached) return cached;
    const data = await callD365("getOptionSet", { entityName, fieldName, attrType });
    if (data) await cacheSet(k, data, CACHE_TTL.lookups);
    return data;
  },

  async update(entitySet, id, data) {
    if (isExtension) return callD365("update", { entitySet, id, data });
    return { ok: true };
  },

  async clearCache() {
    await cacheClear();
    return true;
  },

  async searchUsers(search) {
    if (isExtension) return callD365("searchUsers", { search });
    return [
      { id: "aaa-bbb-ccc", fullname: "Zakaria Missoum", email: "zakaria@demo.com", disabled: false, title: "Admin" },
      { id: "ddd-eee-fff", fullname: "Alex Baker", email: "alex@demo.com", disabled: false, title: "Sales Rep" },
    ];
  },

  async getLoginHistory(userId, top = 100) {
    if (isExtension) return callD365("getLoginHistory", { userId, top });
    // Mock data
    const now = Date.now();
    return Array.from({ length: 15 }, (_, i) => ({
      date: new Date(now - i * 3600000 * (2 + Math.random() * 10)).toISOString(),
      action: i % 5 === 0 ? "Logout" : "Login",
      userId,
      info: "",
    }));
  },

  async getApiLimits() {
    if (isExtension) { try { return callD365("getApiLimits"); } catch { return null; } }
    return { remaining: 55479, limit: 60000 };
  },

  // ── Solutions ──
  async getSolutions() {
    if (!isExtension) return [
      { id: "aaa-111-bbb", uniqueName: "ColvioDemo", displayName: "Colvio Demo Solution", version: "1.0.0.0", isManaged: false, installedOn: "2025-01-15T10:00:00Z", description: "Custom entities and fields" },
      { id: "bbb-222-ccc", uniqueName: "SalesEnterprise", displayName: "Dynamics 365 Sales Enterprise", version: "9.2.24014.10032", isManaged: true, installedOn: "2024-06-01T08:00:00Z", description: "" },
      { id: "ccc-333-ddd", uniqueName: "msdynce_ServicePatch", displayName: "Service Patch", version: "9.2.24013.10010", isManaged: true, installedOn: "2024-06-01T08:00:00Z", description: "" },
      { id: "ddd-444-eee", uniqueName: "CustomerInsights", displayName: "Customer Insights", version: "1.0.0.8", isManaged: true, installedOn: "2025-02-10T14:30:00Z", description: "" },
    ];
    const k = cacheKey("solutions");
    const cached = await cacheGet(k);
    if (cached) return cached;
    const data = await callD365("getSolutions");
    if (data) await cacheSet(k, data, CACHE_TTL.entities);
    return data;
  },

  async getSolutionComponents(solutionId) {
    if (!isExtension) return [
      { id: "c1", type: 1, objectId: "a1b2c3d4-0001", behavior: 0, name: "Account" },
      { id: "c2", type: 1, objectId: "a1b2c3d4-0002", behavior: 0, name: "Contact" },
      { id: "c3", type: 1, objectId: "a1b2c3d4-0003", behavior: 0, name: "Lead" },
      { id: "c4", type: 2, objectId: "b1b2c3d4-0001", behavior: 0, name: "name (Account)" },
      { id: "c5", type: 2, objectId: "b1b2c3d4-0002", behavior: 0, name: "emailaddress1 (Contact)" },
      { id: "c6", type: 2, objectId: "b1b2c3d4-0003", behavior: 0, name: "revenue (Account)" },
      { id: "c7", type: 2, objectId: "b1b2c3d4-0004", behavior: 0, name: "telephone1 (Account)" },
      { id: "c8", type: 9, objectId: "c1c2c3d4-0001", behavior: 0, name: "industrycode" },
      { id: "c9", type: 9, objectId: "c1c2c3d4-0002", behavior: 0, name: "customertypecode" },
      { id: "c10", type: 26, objectId: "d1d2d3d4-0001", behavior: 0, name: "Active Accounts" },
      { id: "c11", type: 26, objectId: "d1d2d3d4-0002", behavior: 0, name: "My Active Contacts" },
      { id: "c12", type: 26, objectId: "d1d2d3d4-0003", behavior: 0, name: "All Leads" },
      { id: "c13", type: 60, objectId: "e1e2e3e4-0001", behavior: 0, name: "new_custom_script.js" },
      { id: "c14", type: 60, objectId: "e1e2e3e4-0002", behavior: 0, name: "new_style.css" },
      { id: "c15", type: 10, objectId: "f1f2f3f4-0001", behavior: 0, name: "account_parent_account (1:N)" },
      { id: "c16", type: 10, objectId: "f1f2f3f4-0002", behavior: 0, name: "contact_customer_accounts (N:1)" },
      { id: "c17", type: 59, objectId: "g1g2g3g4-0001", behavior: 0, name: "Accounts by Industry" },
      { id: "c18", type: 91, objectId: "h1h2h3h4-0001", behavior: 0, name: "ColvioDemo.Plugins.AccountPlugin" },
    ];
    return callD365("getSolutionComponents", { solutionId });
  },

  // ── Translations ──
  async getOrgLanguages() {
    if (!isExtension) return [
      { code: 1033, name: "English" }, { code: 1036, name: "French" }, { code: 1031, name: "German" },
    ];
    const k = cacheKey("orglangs");
    const cached = await cacheGet(k);
    if (cached) return cached;
    const data = await callD365("getOrgLanguages");
    if (data) await cacheSet(k, data, CACHE_TTL.entities);
    return data;
  },

  async getAttributeLabels(logicalName) {
    if (!isExtension) return [
      { logical: "name", type: "String", labels: [{ label: "Account Name", languageCode: 1033 },{ label: "Nom du compte", languageCode: 1036 },{ label: "Firmenname", languageCode: 1031 }], descriptions: [] },
      { logical: "revenue", type: "Money", labels: [{ label: "Annual Revenue", languageCode: 1033 },{ label: "Chiffre d'affaires", languageCode: 1036 },{ label: "Jahresumsatz", languageCode: 1031 }], descriptions: [] },
      { logical: "telephone1", type: "String", labels: [{ label: "Main Phone", languageCode: 1033 },{ label: "Telephone principal", languageCode: 1036 },{ label: "Haupttelefon", languageCode: 1031 }], descriptions: [] },
      { logical: "emailaddress1", type: "String", labels: [{ label: "Email", languageCode: 1033 },{ label: "Courriel", languageCode: 1036 },{ label: "E-Mail", languageCode: 1031 }], descriptions: [] },
      { logical: "address1_city", type: "String", labels: [{ label: "City", languageCode: 1033 },{ label: "Ville", languageCode: 1036 },{ label: "Stadt", languageCode: 1031 }], descriptions: [] },
      { logical: "industrycode", type: "Picklist", labels: [{ label: "Industry", languageCode: 1033 },{ label: "Secteur", languageCode: 1036 },{ label: "Branche", languageCode: 1031 }], descriptions: [] },
      { logical: "statecode", type: "State", labels: [{ label: "Status", languageCode: 1033 },{ label: "Statut", languageCode: 1036 },{ label: "Status", languageCode: 1031 }], descriptions: [] },
      { logical: "numberofemployees", type: "Integer", labels: [{ label: "Employees", languageCode: 1033 },{ label: "Employes", languageCode: 1036 },{ label: "Mitarbeiter", languageCode: 1031 }], descriptions: [] },
      { logical: "websiteurl", type: "String", labels: [{ label: "Website", languageCode: 1033 },{ label: "Site web", languageCode: 1036 },{ label: "Webseite", languageCode: 1031 }], descriptions: [] },
      { logical: "accountnumber", type: "String", labels: [{ label: "Account Number", languageCode: 1033 },{ label: "Numero de compte", languageCode: 1036 },{ label: "Kontonummer", languageCode: 1031 }], descriptions: [] },
    ];
    return callD365("getAttributeLabels", { logicalName });
  },

  async updateAttributeLabel(entityName, attributeName, localizedLabels) {
    if (!isExtension) return { ok: true };
    return callD365("updateAttributeLabel", { entityName, attributeName, localizedLabels });
  },

  async publishEntity(logicalName) {
    if (!isExtension) return { ok: true };
    return callD365("publishEntity", { logicalName });
  },

  // ── User & License Monitor ──
  async getAllUsers() {
    if (!isExtension) return [
      { id: "u1", fullname: "Zakaria Missoum", email: "zakaria@contoso.com", disabled: false, accessMode: 0, accessModeLabel: "Read-Write", calType: 7, calTypeLabel: "Enterprise", buName: "Contoso", buId: "bu1", title: "CRM Admin", createdOn: "2022-03-15T10:00:00Z" },
      { id: "u2", fullname: "Marie Martin", email: "marie@contoso.com", disabled: false, accessMode: 0, accessModeLabel: "Read-Write", calType: 9, calTypeLabel: "Sales", buName: "Contoso FR", buId: "bu2", title: "Sales Manager", createdOn: "2023-06-01T08:00:00Z" },
      { id: "u3", fullname: "Alex Baker", email: "alex@contoso.com", disabled: false, accessMode: 0, accessModeLabel: "Read-Write", calType: 2, calTypeLabel: "Basic", buName: "Contoso UK", buId: "bu3", title: "Sales Rep", createdOn: "2024-01-10T14:30:00Z" },
      { id: "u4", fullname: "Sophie Lefevre", email: "sophie@contoso.com", disabled: true, accessMode: 0, accessModeLabel: "Read-Write", calType: 7, calTypeLabel: "Enterprise", buName: "Contoso FR", buId: "bu2", title: "Consultant", createdOn: "2021-11-08T09:00:00Z" },
      { id: "u5", fullname: "Lucas Moreau", email: "lucas@contoso.com", disabled: false, accessMode: 2, accessModeLabel: "Read", calType: 2, calTypeLabel: "Basic", buName: "Contoso", buId: "bu1", title: "Analyst", createdOn: "2025-02-20T11:00:00Z" },
      { id: "u6", fullname: "Emma Petit", email: "emma@contoso.com", disabled: true, accessMode: 0, accessModeLabel: "Read-Write", calType: 9, calTypeLabel: "Sales", buName: "Contoso UK", buId: "bu3", title: "Account Exec", createdOn: "2023-09-15T16:00:00Z" },
      { id: "u7", fullname: "# D365 Integration", email: "integration@contoso.com", disabled: false, accessMode: 4, accessModeLabel: "Non-Interactive", calType: 0, calTypeLabel: "Full", buName: "Contoso", buId: "bu1", title: "Service Account", createdOn: "2020-01-01T00:00:00Z" },
      { id: "u8", fullname: "Pierre Bernard", email: "pierre@contoso.com", disabled: false, accessMode: 1, accessModeLabel: "Admin", calType: 0, calTypeLabel: "Full", buName: "Contoso", buId: "bu1", title: "System Admin", createdOn: "2020-06-01T08:00:00Z" },
    ];
    // No cache — monitoring tool should always fetch fresh data
    return callD365("getAllUsers");
  },

  async getUserRoles(userId) {
    if (!isExtension) return [
      { id: "r1", name: "System Administrator" },
      { id: "r2", name: "Sales Manager" },
      { id: "r3", name: "Basic User" },
    ];
    return callD365("getUserRoles", { userId });
  },

  async getUserLastLogin(userId) {
    if (!isExtension) {
      const daysAgo = Math.floor(Math.random() * 90);
      return daysAgo < 60 ? { date: new Date(Date.now() - daysAgo * 86400000).toISOString() } : null;
    }
    return callD365("getUserLastLogin", { userId });
  },

  // ── Security Audit ──
  async getAllRoles() {
    if (!isExtension) return [
      { id: "r1", rootId: "r1", name: "System Administrator", isManaged: true, isCustom: false, buName: "Contoso" },
      { id: "r2", rootId: "r2", name: "Sales Manager", isManaged: true, isCustom: false, buName: "Contoso" },
      { id: "r3", rootId: "r3", name: "Basic User", isManaged: true, isCustom: false, buName: "Contoso" },
      { id: "r4", rootId: "r4", name: "Custom CRM Admin", isManaged: false, isCustom: true, buName: "Contoso" },
      { id: "r5", rootId: "r5", name: "Custom Sales Rep", isManaged: false, isCustom: true, buName: "Contoso" },
      { id: "r6", rootId: "r6", name: "Marketing User", isManaged: true, isCustom: false, buName: "Contoso" },
    ];
    return callD365("getAllRoles");
  },

  async getRolePrivileges(roleId) {
    if (!isExtension) {
      const SENSITIVE = ["prvDeleteAccount","prvDeleteContact","prvWriteSystemUser","prvDeleteSystemUser","prvAssignRole","prvReadAudit","prvDeleteAudit","prvExportToExcel","prvBulkDelete","prvWriteRole","prvDeleteRole","prvPublishAll","prvImportCustomization"];
      return [
        ...SENSITIVE.map((name, i) => ({ id: `p${i}`, name, accessRight: 2, depth: 8, depthLabel: "Organization", isOrg: true })),
        { id: "p20", name: "prvReadAccount", accessRight: 1, depth: 8, depthLabel: "Organization", isOrg: true },
        { id: "p21", name: "prvWriteAccount", accessRight: 2, depth: 4, depthLabel: "Parent: Child BU", isOrg: false },
        { id: "p22", name: "prvCreateAccount", accessRight: 16, depth: 2, depthLabel: "Business Unit", isOrg: false },
        { id: "p23", name: "prvReadContact", accessRight: 1, depth: 1, depthLabel: "User", isOrg: false },
      ];
    }
    return callD365("getRolePrivileges", { roleId });
  },

  async getRoleUserCount(roleName) {
    if (!isExtension) return { count: Math.floor(Math.random() * 50) + 1 };
    return callD365("getRoleUserCount", { roleName });
  },

  async getRoleUsers(roleName) {
    if (!isExtension) return [
      { id: "u1", name: "Alice Martin", email: "alice.martin@contoso.com", domain: "contoso\\alice", disabled: false, accessMode: "Read-Write", accessModeCode: 0, bu: "Contoso" },
      { id: "u2", name: "Bruno Lefebvre", email: "bruno.lefebvre@contoso.com", domain: "contoso\\bruno", disabled: false, accessMode: "Read-Write", accessModeCode: 0, bu: "Sales EU" },
      { id: "u3", name: "Svc Integration", email: "", domain: "app\\svcint", disabled: false, accessMode: "Non-interactive", accessModeCode: 4, bu: "Contoso" },
      { id: "u4", name: "Old Account", email: "old@contoso.com", domain: "contoso\\old", disabled: true, accessMode: "Read-Write", accessModeCode: 0, bu: "Sales US" },
    ];
    return callD365("getRoleUsers", { roleName });
  },

  async getManyToManyRelationships(logicalName) {
    if (!isExtension) return [
      { schemaName: "accountleads_association", entity1: "account", entity2: "lead", intersectEntity: "accountleads" },
      { schemaName: "listcontact_association", entity1: "list", entity2: "contact", intersectEntity: "listcontact" },
    ];
    const k = cacheKey("m2m", logicalName);
    const cached = await cacheGet(k);
    if (cached) return cached;
    const data = await callD365("getManyToManyRelationships", { logicalName });
    if (data) await cacheSet(k, data, CACHE_TTL.lookups);
    return data;
  },
};
