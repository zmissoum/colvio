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
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Defense-in-depth: only accept messages from this extension's own pages/content scripts.
  // (No externally_connectable is declared, so web pages already can't reach this — this also
  // rejects a hypothetical compromised co-installed extension.)
  if (sender.id !== chrome.runtime.id) return;
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
