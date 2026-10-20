/**
 * background.js — Service Worker (Manifest V3)
 *
 * Colvio — Click icon to open panel in new tab
 * Relay API calls between Colvio (tab B) and D365 content script (tab A)
 * Record activity: observe (read-only) the Web API writes a D365 tab sends
 */
import { startSave, finishSave, addSave } from "./saveCapture.js";

let d365TabId = null;
// Tab ids the browser swapped out from under us (memory-saver discard can REPLACE a tab: same
// visual tab in the strip, brand-new id — the panel's pinned id then points at nothing).
const replacedIds = new Map(); // old id → new id

// All D365 domains: commercial, US Gov, China
const D365_DOMAINS = [".dynamics.com", ".microsoftdynamics.us", ".dynamics.cn"];
const isD365Url = (url) => url && D365_DOMAINS.some(d => url.includes(d));

chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
  replacedIds.set(removedTabId, addedTabId);
  if (removedTabId === d365TabId) d365TabId = addedTabId;
});

const resolveReplaced = (id) => {
  let cur = id, hops = 0;
  while (replacedIds.has(cur) && hops++ < 10) cur = replacedIds.get(cur);
  return cur;
};

// The org tab is Colvio's transport — if the browser puts it to sleep mid-run, every in-flight
// bulk chunk dies with a bogus "tab was closed". Pin it awake while it serves the panel.
const keepAwake = (tabId) => { try { chrome.tabs.update(tabId, { autoDiscardable: false }); } catch { /* tab may be gone */ } };

chrome.runtime.onInstalled.addListener(() => {
  // Gray the icon everywhere by default; the declarativeContent rules below re-enable it on D365
  // pages only. Without this disable(), MV3 keeps the action enabled on every tab and the rules
  // are a no-op (the click handler was already guarded by isD365Url — this makes the affordance
  // visible AND gives the declarativeContent permission its observable use).
  chrome.action.disable();
  chrome.declarativeContent.onPageChanged.removeRules(undefined, () => {
    chrome.declarativeContent.onPageChanged.addRules([{
      conditions: D365_DOMAINS.map(d => new chrome.declarativeContent.PageStateMatcher({ pageUrl: { hostSuffix: d } })),
      actions: [new chrome.declarativeContent.ShowAction()],
    }]);
  });
});

// ── Click icon: open panel in new tab ────────────────────────
chrome.action.onClicked.addListener(async (tab) => {
  if (!isD365Url(tab.url)) return;
  d365TabId = tab.id;
  keepAwake(tab.id);

  // Inject content script
  try { await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] }); } catch {}

  const orgUrl = new URL(tab.url).origin;
  const panelUrl = chrome.runtime.getURL(`panel.html?orgUrl=${encodeURIComponent(orgUrl)}&tabId=${tab.id}`);

  // Reuse existing panel tab or open a new one — always PLACED RIGHT NEXT to the D365 tab
  // (index + 1) instead of the far end of the tab strip; openerTabId makes closing the panel
  // return focus to the D365 tab, and keeps it in the same tab group if the org tab is in one.
  const existing = await chrome.tabs.query({ url: chrome.runtime.getURL("panel.html*") });
  if (existing.length > 0) {
    try { await chrome.tabs.move(existing[0].id, { windowId: tab.windowId, index: tab.index + 1 }); } catch { /* dragged mid-move or pinned — keep it where it is */ }
    await chrome.tabs.update(existing[0].id, { active: true, url: panelUrl });
  } else {
    await chrome.tabs.create({ url: panelUrl, index: tab.index + 1, openerTabId: tab.id });
  }
});

// ── Relay: Panel <-> Content Script ──────────────────────────
const tabsGet = (id) => new Promise((res) => { try { chrome.tabs.get(id, (t) => { void chrome.runtime.lastError; res(t || null); }); } catch { res(null); } });
const sendToTab = (id, msg) => new Promise((res) => {
  try {
    chrome.tabs.sendMessage(id, msg, (resp) => {
      const err = chrome.runtime.lastError;
      res(err ? { __relayErr: err.message || String(err) } : resp);
    });
  } catch (e) { res({ __relayErr: String(e?.message || e) }); }
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitForComplete = async (tabId, timeoutMs = 20000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const t = await tabsGet(tabId);
    if (!t) return false;
    if (t.status === "complete" && !t.discarded) return true;
    await sleep(400);
  }
  return false;
};

// Resilient relay. The naive version died in the wild: during a long Loader/delete run the org
// tab sits inactive, the browser's memory saver puts it to sleep (still visible in the tab strip,
// process gone — sometimes with a NEW tab id), and every remaining chunk failed with a misleading
// "The D365 tab was closed". Order of battle here: translate replaced ids → pick a live tab
// SHOWING THE PANEL'S ORG (pinned id first, then the last-registered one — the org check also
// stops requests from following a pinned tab that navigated to a different environment) → wake a
// sleeping tab (reload + wait) → send → on "receiving end does not exist", re-inject content.js
// (idempotent via its __colvioLoaded guard) and retry once → only then report, with the real
// cause and the recovery gesture.
async function relayToD365(message) {
  const orgOf = (t) => { try { return new URL(t.url).origin; } catch { return null; } };
  // Fail CLOSED on a missing org: the panel URL always carries orgUrl (set at open), so its absence
  // means a malformed open — and "any candidate tab will do" is exactly the wrong-environment relay
  // risk for a user with several orgs in one browser (audit finding). Refuse instead of guessing.
  if (!message.orgUrl) return { error: "This Colvio panel doesn't know which environment it belongs to. Close it and reopen it from your Dynamics 365 tab (Colvio icon)." };
  const okOrg = (t) => orgOf(t) === message.orgUrl;

  const candidates = [];
  if (message.d365TabId) candidates.push(resolveReplaced(message.d365TabId));
  if (d365TabId && !candidates.includes(resolveReplaced(d365TabId))) candidates.push(resolveReplaced(d365TabId));
  let target = null, targetTab = null;
  for (const id of candidates) {
    const t = await tabsGet(id);
    if (t && okOrg(t)) { target = id; targetTab = t; break; }
  }
  if (!target && message.orgUrl) {
    // Service-worker restarts wipe d365TabId/replacedIds from memory — but the org tab may sit
    // right there in the strip. Find ANY tab on the panel's org before giving up (audit finding).
    const found = await new Promise((res) => {
      try { chrome.tabs.query({ url: message.orgUrl + "/*" }, (ts) => { void chrome.runtime.lastError; res(ts || []); }); }
      catch { res([]); }
    });
    if (found.length) { target = found[0].id; targetTab = found[0]; d365TabId = target; }
  }
  if (!target) return { error: "Lost the D365 tab for this environment (closed, or replaced by the browser's memory saver). Open your Dynamics 365 environment and click the Colvio icon again." };

  keepAwake(target);
  if (targetTab.discarded) { // sleeping tab has no content script — wake it before talking to it
    try { chrome.tabs.reload(target); } catch { /* reload can race a closing tab */ }
    await waitForComplete(target);
  }

  const msg = { __d365InspectorFromBg: true, id: message.id, action: message.action, params: message.params };
  let resp = await sendToTab(target, msg);
  if (resp && resp.__relayErr && /receiving end does not exist/i.test(resp.__relayErr)) {
    try { await chrome.scripting.executeScript({ target: { tabId: target }, files: ["content.js"] }); } catch { /* tab closing/not injectable — the retry below reports it */ }
    await sleep(300);
    resp = await sendToTab(target, msg);
  }
  if (resp && resp.__relayErr) return { error: `Lost contact with the D365 tab (${resp.__relayErr}). It was probably put to sleep or reloaded mid-run — refresh the D365 tab, then retry; work already completed is unaffected.` };
  return resp;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Defense-in-depth: only accept messages from this extension's own pages/content scripts.
  // (No externally_connectable is declared, so web pages already can't reach this — this also
  // rejects a hypothetical compromised co-installed extension.)
  if (sender.id !== chrome.runtime.id) return;
  if (message.__d365InspectorRequest) {
    relayToD365(message).then(sendResponse);
    return true;
  }
  if (message.action === "d365_tab_ready") { d365TabId = sender.tab.id; keepAwake(sender.tab.id); sendResponse({ ok: true }); }
});

chrome.tabs.onRemoved.addListener((id) => { if (id === d365TabId) d365TabId = null; });

// ── Record activity: the saves each D365 tab sends ───────────
// chrome.webRequest only LOOKS at the org's Web API writes (form saves, ribbon actions, Colvio's own
// edits) — nothing is blocked, changed or sent anywhere. Each one is kept per org in
// chrome.storage.session (memory only, gone when the browser closes): the record, the column NAMES
// sent (never the values), the status, the request ids and the timing. The panel's Record activity
// reads them to find what each save triggered.
const API_FILTER = { urls: D365_DOMAINS.map(d => `https://*${d}/api/data/*`), types: ["xmlhttprequest"] };
const openSaves = new Map(); // webRequest requestId → save on its way
let saveQueue = Promise.resolve(); // one read-modify-write at a time
const storeSave = (save) => {
  saveQueue = saveQueue.then(async () => {
    const key = `saves|${save.origin}`;
    const cur = (await chrome.storage.session.get(key))[key] || [];
    let list = addSave(cur, save);
    try { await chrome.storage.session.set({ [key]: list }); }
    catch { // session quota — keep the newest half rather than dropping every later save
      list = list.slice(0, Math.max(1, Math.floor(list.length / 2)));
      await chrome.storage.session.set({ [key]: list });
    }
  }).catch(() => { /* storage unavailable — the panel just won't list this save */ });
};
chrome.webRequest.onBeforeRequest.addListener((d) => {
  const s = startSave(d);
  if (!s) return;
  if (openSaves.size > 500) openSaves.clear(); // requests that never completed (tab killed mid-flight)
  openSaves.set(s.key, s);
}, API_FILTER, ["requestBody"]);
const closeSave = (d) => {
  const s = openSaves.get(String(d.requestId));
  if (!s) return;
  openSaves.delete(s.key);
  storeSave(finishSave(s, d));
};
chrome.webRequest.onCompleted.addListener(closeSave, API_FILTER, ["responseHeaders"]);
chrome.webRequest.onErrorOccurred.addListener(closeSave, API_FILTER);

// ── Plug-in trace log: back to the previous setting ──────────
// Record activity can switch the org's trace log to "All" for a debugging session; the panel stores
// { orgId, prev, at } and sets an alarm. When it fires, the previous value is written back through a
// tab of that org. No tab open → retried every 5 minutes (the panel shows the pending revert).
const TRACE_REVERT = "colvioTraceRevert|";
async function revertTraceSetting(orgUrl) {
  const key = `traceRevert|${orgUrl}`;
  const job = (await chrome.storage.local.get(key))[key];
  if (!job) return;
  const resp = await relayToD365({ orgUrl, action: "update", params: { entitySet: "organizations", id: job.orgId, data: { plugintracelogsetting: job.prev } } });
  if (resp && !resp.error) { await chrome.storage.local.remove(key); return; }
  await chrome.storage.local.set({ [key]: { ...job, lastError: (resp && resp.error) || "no answer from the D365 tab", lastTry: Date.now() } });
  chrome.alarms.create(TRACE_REVERT + orgUrl, { delayInMinutes: 5 });
}
chrome.alarms.onAlarm.addListener((a) => { if (a.name.startsWith(TRACE_REVERT)) revertTraceSetting(a.name.slice(TRACE_REVERT.length)); });
// Alarms don't survive a browser restart or an extension update: on every service-worker start the
// pending reverts in storage are re-armed (an overdue one fires right away).
chrome.storage.local.get(null).then((all) => {
  for (const [key, job] of Object.entries(all || {})) {
    if (!key.startsWith("traceRevert|") || !job || !job.at) continue;
    const orgUrl = key.slice("traceRevert|".length);
    chrome.alarms.get(TRACE_REVERT + orgUrl, (a) => { if (!a) chrome.alarms.create(TRACE_REVERT + orgUrl, { when: Math.max(Number(job.at) || 0, Date.now() + 1000) }); });
  }
}).catch(() => { /* storage unavailable */ });
