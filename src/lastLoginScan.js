// Last logins of MANY users from the user-access audit — never one request per user. Windows of
// time are walked backwards from now; each window is answered by one aggregate query (the latest
// login per user, server-side), bisected by the content script when the server truncates it. The
// walk stops as soon as every wanted user has a date, or when the audit's first row is reached:
// only then is "never" certain. Pure: the planning and bookkeeping, no requests.

export const HOUR = 3600000;
export const DAY = 86400000;
export const MIN_WINDOW = HOUR;
export const MAX_WINDOW = 60 * DAY;
export const START_WINDOW = 7 * DAY;

// The next window: ends at the cursor, never starts before the floor. null once the floor is reached.
export function nextWindow(cursorMs, floorMs, sizeMs) {
  if (!Number.isFinite(cursorMs) || !Number.isFinite(floorMs) || cursorMs <= floorMs) return null;
  const fromMs = Math.max(floorMs, cursorMs - Math.max(MIN_WINDOW, sizeMs || START_WINDOW));
  return { fromMs, toMs: cursorMs, from: new Date(fromMs).toISOString(), to: new Date(cursorMs).toISOString() };
}

// Size of the next window from how many requests the last one cost (1 = a single aggregate):
// grow while the org is quiet, shrink when the server had to split it.
export function adaptWindow(sizeMs, requests) {
  const r = Number(requests) || 1;
  if (r <= 1) return Math.min(MAX_WINDOW, sizeMs * 2);
  if (r >= 6) return Math.max(MIN_WINDOW, Math.floor(sizeMs / 4));
  if (r >= 3) return Math.max(MIN_WINDOW, Math.floor(sizeMs / 2));
  return sizeMs;
}

// Fold a window's { userId: lastIso } into found (user → latest date). Windows arrive newest first,
// so the first date seen is the latest — the max is kept anyway.
export function mergeFound(found, byUser) {
  for (const [id, iso] of Object.entries(byUser || {})) {
    if (!id || !iso) continue;
    const k = String(id).toLowerCase();
    const cur = found.get(k);
    if (!cur || iso > cur) found.set(k, iso);
  }
  return found;
}

export const remaining = (wanted, found) => (wanted || []).filter(id => !found.has(String(id).toLowerCase()));

// Verdicts once the walk ends. { date } for a found user; { date: null } = never, only when the
// audit's first row was reached; { date: null, since } when the walk stopped earlier (cancelled, or
// the floor unknown): no login since that date, which is NOT "never".
export function finalize(wanted, found, { reachedFloor = false, floorKnown = true, scannedToMs = null } = {}) {
  const out = new Map();
  for (const id of wanted || []) {
    const k = String(id).toLowerCase();
    if (found.has(k)) out.set(k, { date: found.get(k) });
    else if (reachedFloor && floorKnown) out.set(k, { date: null });
    else out.set(k, { date: null, since: scannedToMs != null ? new Date(scannedToMs).toISOString() : null });
  }
  return out;
}

// One line of progress for the UI.
export function scanLabel({ cursorMs, found, total, requests }) {
  const back = Number.isFinite(cursorMs) ? new Date(cursorMs).toLocaleDateString() : "…";
  return `last logins — ${found}/${total} found, scanned back to ${back}${requests ? ` (${requests} request${requests > 1 ? "s" : ""})` : ""}`;
}
