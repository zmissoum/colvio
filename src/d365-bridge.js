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
const RATE_LIMIT = 10; // max calls per second

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

  async getEntityMetadata(logicalName) {
    if (!isExtension) return { canBeDeleted: true, displayName: logicalName };
    return callD365("getEntityMetadata", { logicalName });
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
      { id: "c1", type: 1, objectId: "a1b2c3d4-0001", behavior: 0 },
      { id: "c2", type: 1, objectId: "a1b2c3d4-0002", behavior: 0 },
      { id: "c3", type: 1, objectId: "a1b2c3d4-0003", behavior: 0 },
      { id: "c4", type: 2, objectId: "b1b2c3d4-0001", behavior: 0 },
      { id: "c5", type: 2, objectId: "b1b2c3d4-0002", behavior: 0 },
      { id: "c6", type: 2, objectId: "b1b2c3d4-0003", behavior: 0 },
      { id: "c7", type: 2, objectId: "b1b2c3d4-0004", behavior: 0 },
      { id: "c8", type: 9, objectId: "c1c2c3d4-0001", behavior: 0 },
      { id: "c9", type: 9, objectId: "c1c2c3d4-0002", behavior: 0 },
      { id: "c10", type: 26, objectId: "d1d2d3d4-0001", behavior: 0 },
      { id: "c11", type: 26, objectId: "d1d2d3d4-0002", behavior: 0 },
      { id: "c12", type: 26, objectId: "d1d2d3d4-0003", behavior: 0 },
      { id: "c13", type: 60, objectId: "e1e2e3e4-0001", behavior: 0 },
      { id: "c14", type: 60, objectId: "e1e2e3e4-0002", behavior: 0 },
      { id: "c15", type: 10, objectId: "f1f2f3f4-0001", behavior: 0 },
      { id: "c16", type: 10, objectId: "f1f2f3f4-0002", behavior: 0 },
      { id: "c17", type: 59, objectId: "g1g2g3g4-0001", behavior: 0 },
      { id: "c18", type: 91, objectId: "h1h2h3h4-0001", behavior: 0 },
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
