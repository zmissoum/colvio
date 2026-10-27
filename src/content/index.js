/**
 * Content script — injected on the Dataverse hosts (manifest content_scripts + background's
 * executeScript). No panel here: the Colvio panel lives in its own tab and reaches the org
 * THROUGH this script, with the user's own session (same origin = cookies).
 *   1. core.js    — context, validation, pacing, the request layer, the bulk-run abort state
 *   2. actions/*  — one async function per action the panel can ask for (relayed by background.js)
 *   3. this file  — the once-per-page guard, the message listener, the dispatch table
 * Built into ONE classic script, dist/content.js, by vite.content.config.js.
 */
import { coreActions } from "./core.js";
import metadata from "./actions/metadata.js";
import data from "./actions/data.js";
import security from "./actions/security.js";
import apps from "./actions/apps.js";
import automation from "./actions/automation.js";

// Every action, by name. Own properties only: a message naming "constructor" or "__proto__"
// must not reach Object.prototype.
const ACTIONS = Object.assign(Object.create(null), coreActions, metadata, data, security, apps, automation);

// Use a non-enumerable property to avoid page-level fingerprinting; injected twice (background
// re-injects after a tab slept), the second copy must not register a second listener.
if (!window.__colvioLoaded) {
  Object.defineProperty(window, "__colvioLoaded", { value: true, enumerable: false, configurable: false });

  // ── Handler: requests relayed by background.js ─────────
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message.__d365InspectorFromBg) return false;

    const { action, params } = message;

    (async () => {
      try {
        const fn = ACTIONS[action];
        if (typeof fn !== "function") throw new Error(`Unknown action: ${action}`);
        const result = await fn(params, action);
        sendResponse({ result });
      } catch (e) {
        sendResponse({ error: e.message });
      }
    })();

    return true; // async
  });

  // Signal to background that D365 tab is ready
  chrome.runtime.sendMessage({ action: "d365_tab_ready" });
}
