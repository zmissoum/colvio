// Which Colvio panel a click on the toolbar icon opens, and which D365 tab a panel talks through —
// PURE (no chrome.*), unit-tested. The service worker imports it (copied next to background.js at
// build, like saveCapture.js).
//
// ONE PANEL PER ENVIRONMENT. A panel belongs to the org in its URL (?orgUrl=…). A click on a D365
// tab of org X brings X's panel to the front as it is — no reload: its queries, results and
// scripts stay — and leaves the panels of every other environment alone. No panel for X yet: a
// new one. The tab clicked becomes the one X's panel talks through.

export function panelOrgOf(url) {
  try { return new URL(url).searchParams.get("orgUrl") || null; } catch { return null; }
}

// panels: chrome.tabs of panel.html. Several panels of one org (opened by hand, restored by the
// browser): the one in the clicked tab's window first, then the one used last.
export function pickPanel(panels, orgUrl, windowId = null) {
  if (!orgUrl) return null;
  const mine = (panels || []).filter(p => p && p.id != null && panelOrgOf(p.url) === orgUrl);
  if (!mine.length) return null;
  const score = (p) => [p.windowId === windowId ? 1 : 0, Number(p.lastAccessed) || 0];
  return mine.reduce((best, p) => {
    const [a1, a2] = score(p), [b1, b2] = score(best);
    return a1 > b1 || (a1 === b1 && a2 > b2) ? p : best;
  });
}

// The D365 tabs a panel's request may go through, in order, without repeats: the tab this
// environment's Colvio was last opened from, the panel's own tab (its URL), the last tab that
// loaded content.js. The relay still checks that each shows the panel's org before using it.
export function relayCandidates(...ids) {
  const out = [];
  for (const id of ids) if (id != null && Number.isFinite(Number(id)) && !out.includes(Number(id))) out.push(Number(id));
  return out;
}
