/**
 * background.js — Service Worker (Manifest V3)
 *
 * Colvio — Click icon to open panel in new tab
 * Relay API calls between Colvio (tab B) and D365 content script (tab A)
 */

let d365TabId = null;

// All D365 domains: commercial, US Gov, China
const D365_DOMAINS = [".dynamics.com", ".microsoftdynamics.us", ".dynamics.cn"];
const isD365Url = (url) => url && D365_DOMAINS.some(d => url.includes(d));

chrome.runtime.onInstalled.addListener(() => {
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

  // Inject content script
  try { await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] }); } catch {}

  const orgUrl = new URL(tab.url).origin;
  const panelUrl = chrome.runtime.getURL(`panel.html?orgUrl=${encodeURIComponent(orgUrl)}&tabId=${tab.id}`);

  // Reuse existing panel tab or open a new one
  const existing = await chrome.tabs.query({ url: chrome.runtime.getURL("panel.html*") });
  if (existing.length > 0) {
    await chrome.tabs.update(existing[0].id, { active: true, url: panelUrl });
  } else {
    await chrome.tabs.create({ url: panelUrl });
  }
});

// ── Relay: Panel <-> Content Script ──────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.__d365InspectorRequest) {
    const targetTab = message.d365TabId || d365TabId;
    if (!targetTab) { sendResponse({ error: "D365 tab not found — go back to D365 and click ⚡" }); return true; }

    chrome.tabs.get(targetTab, (tab) => {
      if (chrome.runtime.lastError || !tab) { sendResponse({ error: "The D365 tab was closed." }); return; }
      chrome.tabs.sendMessage(targetTab, { __d365InspectorFromBg: true, id: message.id, action: message.action, params: message.params }, (resp) => {
        if (chrome.runtime.lastError) sendResponse({ error: chrome.runtime.lastError.message });
        else sendResponse(resp);
      });
    });
    return true;
  }
  if (message.action === "d365_tab_ready") { d365TabId = sender.tab.id; sendResponse({ ok: true }); }
});

chrome.tabs.onRemoved.addListener((id) => { if (id === d365TabId) d365TabId = null; });
