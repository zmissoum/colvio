// Adoption metrics — PURE functions, no I/O, unit-tested.
//
// Everything here works on per-user SETS OF ACTIVE DAYS (ISO yyyy-mm-dd), which is what the
// server-side per-day aggregation gives us. One honesty rule drives the wording everywhere:
// Dataverse logs user access AT MOST once per UserAccessAuditingInterval (default 4 h), so
// counts are "access events", a stable activity proxy — NOT literal logins or clicks.

const DAY = 86400000;
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

/**
 * Service accounts never log in interactively BY DESIGN — counting them as "never signed in"
 * pollutes the list with false positives. accessmode: 3 Support, 4 Non-Interactive,
 * 5 Delegated Admin; isApp = S2S application user (applicationid set).
 */
export function isServiceAccount(u) {
  return !!u && (u.accessMode === 3 || u.accessMode === 4 || u.accessMode === 5 || !!u.isApp);
}

/** Human label for a service account's kind — isApp wins (more specific than its accessmode). */
export function serviceTypeLabel(u) {
  if (!u) return "";
  if (u.isApp) return "Application (S2S)";
  if (u.accessMode === 4) return "Non-Interactive";
  if (u.accessMode === 3) return "Support";
  if (u.accessMode === 5) return "Delegated Admin";
  return "";
}

/**
 * DAU/WAU/MAU + stickiness over a window.
 * @param daySets  array of Set<iso-day> — one per in-scope user (their active days in-window)
 * @param fromIso/toIso  window bounds
 * @returns {dauAvg, wau, mau, stickiness, windowDays} — wau/mau are null when the window is
 * shorter than 7/30 days (a 7-day MAU would silently understate; better absent than wrong).
 */
export function computeEngagement(daySets, fromIso, toIso) {
  const from = Date.parse(fromIso), to = Date.parse(toIso);
  const windowDays = Math.max(1, Math.round((to - from) / DAY));
  const wauFloor = isoDay(to - 7 * DAY), mauFloor = isoDay(to - 30 * DAY);
  const daily = new Map(); // iso-day -> distinct users
  let wau = 0, mau = 0;
  for (const days of daySets) {
    let inW = false, inM = false;
    for (const d of days) {
      daily.set(d, (daily.get(d) || 0) + 1);
      if (d > wauFloor) inW = true;
      if (d > mauFloor) inM = true;
    }
    if (inW) wau++;
    if (inM) mau++;
  }
  let sum = 0;
  for (const c of daily.values()) sum += c;
  const dauAvg = sum / windowDays; // quiet days count as 0 — dividing by active days would flatter
  return {
    dauAvg,
    wau: windowDays >= 7 ? wau : null,
    mau: windowDays >= 30 ? mau : null,
    stickiness: windowDays >= 30 && mau > 0 ? dauAvg / mau : null,
    windowDays,
  };
}

/**
 * Access events per weekday, Monday-first. byDayMaps = array of {iso-day: count} per user.
 * @returns [{label, events}] × 7
 */
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export function weekdayTotals(byDayMaps) {
  const t = [0, 0, 0, 0, 0, 0, 0];
  for (const m of byDayMaps) {
    for (const [d, c] of Object.entries(m || {})) {
      const wd = (new Date(d + "T00:00:00Z").getUTCDay() + 6) % 7; // Monday = 0
      if (wd >= 0 && wd < 7) t[wd] += c || 0;
    }
  }
  return t.map((events, i) => ({ label: WEEKDAYS[i], events }));
}

/**
 * Whole days since the last access. null lastIso → null (nothing to measure — the caller
 * shows "> windowDays" instead, which is all the loaded window can honestly assert).
 */
export function inactivityDays(lastIso, nowMs) {
  if (!lastIso) return null;
  const ms = nowMs - Date.parse(lastIso);
  return ms <= 0 ? 0 : Math.floor(ms / DAY);
}

/**
 * The selected BU plus every descendant — BFS over parentId, cycle-safe (a corrupted
 * hierarchy must degrade to a partial set, never an infinite loop).
 * @param rootId  selected businessunit id
 * @param bus     [{id, parentId}] — the whole org's BU list
 * @returns Set<id>
 */
export function buSubtreeIds(rootId, bus = []) {
  const children = new Map();
  for (const b of bus) {
    if (!b.parentId) continue;
    if (!children.has(b.parentId)) children.set(b.parentId, []);
    children.get(b.parentId).push(b.id);
  }
  const out = new Set([rootId]);
  const queue = [rootId];
  while (queue.length) {
    for (const c of (children.get(queue.shift()) || [])) {
      if (!out.has(c)) { out.add(c); queue.push(c); }
    }
  }
  return out;
}

/**
 * Per-BU adoption: rows [{bu, enrolled, active, rate}] sorted by enrolled desc.
 * @param users  [{buName, active: bool}] — already scoped (enabled, human, role-filtered)
 */
export function buAdoption(users) {
  const m = new Map();
  for (const u of users) {
    const k = u.buName || "(no BU)";
    let r = m.get(k);
    if (!r) { r = { bu: k, enrolled: 0, active: 0 }; m.set(k, r); }
    r.enrolled++;
    if (u.active) r.active++;
  }
  return [...m.values()]
    .map(r => ({ ...r, rate: r.enrolled ? r.active / r.enrolled : 0 }))
    .sort((a, b) => b.enrolled - a.enrolled || a.bu.localeCompare(b.bu));
}
