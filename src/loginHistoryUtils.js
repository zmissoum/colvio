// Dataverse "user access" audit, as Login History reads it.
//
// Audit action choices (learn.microsoft.com/power-apps/developer/data-platform/reference/entities/audit):
//   64 = User Access via Web           — the user opened a model-driven app
//   65 = User Access via Web Services  — the user called the API (any client other than a model-driven app)
// Neither one is a sign-in or a sign-out. Dataverse writes at most one access event per user per
// interval (4 h by default) and has NO sign-out event, so no session duration can be derived.
export const ACCESS_CHANNELS = {
  64: { key: "app", label: "App (web)" },
  65: { key: "api", label: "Web services" },
};

export function normalizeAccessEvent(r) {
  const ch = ACCESS_CHANNELS[r.actionCode];
  return { ...r, channel: ch?.key || "other", label: ch?.label || r.accessType || `Action ${r.actionCode}` };
}

export function sortNewestFirst(events) {
  return [...events].sort((a, b) => new Date(b.date) - new Date(a.date));
}

// events: normalized, any order. Days are local calendar days (what the timeline groups by).
export function accessStats(events) {
  if (!events?.length) return null;
  const sorted = sortNewestFirst(events);
  const byChannel = { app: 0, api: 0, other: 0 };
  for (const e of sorted) byChannel[e.channel] = (byChannel[e.channel] || 0) + 1;
  return {
    total: sorted.length,
    app: byChannel.app,
    api: byChannel.api,
    other: byChannel.other,
    last: new Date(sorted[0].date),
    first: new Date(sorted[sorted.length - 1].date),
    uniqueDays: new Set(sorted.map(e => new Date(e.date).toDateString())).size,
  };
}
