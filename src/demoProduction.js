// Demo mode only: present the demo org as a PRODUCTION environment — opt-in, for the Health check
// video, whose "Unmanaged solutions in production" check only runs on production. The default demo
// is a sandbox; this flag turns the demo org into a production one for the page load:
//
//   localStorage "colvio_demo_production" = "1"
//
// set by tools/video/deep/health.mjs through Playwright before the page loads (make-deep.mjs passes
// a scenario's `storage` to openDemo). It is read once, where the demo org is built (app.jsx, the
// Demo Mode button), and never inside the extension: a real org's type comes from its URL and its
// OrganizationType (envDetect.js) — this key can't touch it. PURE, unit-tested.
export const DEMO_PRODUCTION_KEY = "colvio_demo_production";

// isExtension: the panel runs inside the extension (bridge.isExtension) → always false there.
// storage: localStorage (or a stand-in); unreadable storage → not production.
export function demoIsProduction(isExtension, storage) {
  if (isExtension) return false;
  try { return storage?.getItem?.(DEMO_PRODUCTION_KEY) === "1"; } catch { return false; }
}
