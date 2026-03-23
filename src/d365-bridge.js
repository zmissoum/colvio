/**
 * d365-bridge.js — Colvio Bridge API — panel React ↔ Dataverse
 *
 * Deux modes :
 *   1. Extension Chrome (panel.html ouvert en onglet)
 *      → chrome.runtime.sendMessage → background.js → content.js → fetch D365
 *
 *   2. Standalone (npm run dev / claude.ai artifact)
 *      → Mock data built into the app, no network calls
 */

// ── Detection ────────────────────────────────────────────────
const isExtension = typeof chrome !== "undefined" && !!chrome?.runtime?.sendMessage;

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

// ── Communication avec le background ─────────────────────────
let reqId = 0;

function callD365(action, params = {}) {
  return new Promise((resolve, reject) => {
    if (!isExtension) { reject(new Error("Not in extension")); return; }

    const id = ++reqId;
    let settled = false;

    // Timeout: batch operations get 5 minutes, normal ops get 30s
    const isBatch = action === "batchCreate" || action === "batchUpsert";
    const timeoutMs = isBatch ? 300000 : 30000;
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
          reject(new Error(response.error));
        } else {
          resolve(response?.result);
        }
      }
    );
  });
}

// ── API publique ─────────────────────────────────────────────
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

  async batchCreate(entitySet, records) {
    if (isExtension) {
      return callD365("batchCreate", { entitySet, records });
    }
    return { created: records.length, errors: [] };
  },

  async batchUpsert(entitySet, keyField, items, isPrimaryKey = false) {
    if (isExtension) {
      return callD365("batchUpsert", { entitySet, keyField, items, isPrimaryKey });
    }
    return { updated: items.length, errors: [] };
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
    ];
    const k = cacheKey("lookups", logicalName);
    const cached = await cacheGet(k);
    if (cached) return cached;
    const data = await callD365("getLookups", { logicalName });
    if (data) await cacheSet(k, data, CACHE_TTL.lookups);
    return data;
  },

  async getChildRelationships(logicalName) {
    if (!isExtension) return [
      { lookupField: "customerid", navProperty: "opportunity_customer_accounts", targetEntity: "opportunity", type: "collection" },
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
};
