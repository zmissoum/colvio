// Bulk user settings (Users & Licenses › Bulk settings) — PURE, unit-tested.
//
// Two tables, one row per user each:
//   usersettings — entity set `usersettingscollection`, primary key = systemuserid (the row IS
//                  the user's personal options); update = PATCH usersettingscollection(<userid>).
//   mailbox      — entity set `mailboxes`, key mailboxid; a user's mailbox points back to the user
//                  through regardingobjectid (Targets: queue, systemuser — queue mailboxes are
//                  excluded). Writing a mailbox needs Read + Write on the Mailbox table.
// Codes and labels below are Microsoft's (Dataverse table reference, usersettings / mailbox).
import { isServiceAccount } from "./adoptionUtils.js";

const FMT = "@OData.Community.Display.V1.FormattedValue";
const LOOKUP_TABLE = "@Microsoft.Dynamics.CRM.lookuplogicalname";
const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const SETTINGS_TABLES = {
  usersettings: { key: "usersettings", label: "Personal settings", entitySet: "usersettingscollection", idField: "systemuserid", extra: [] },
  mailbox: { key: "mailbox", label: "Mailboxes", entitySet: "mailboxes", idField: "mailboxid", extra: ["name", "emailaddress", "_regardingobjectid_value", "isforwardmailbox"] },
};

const yesNo = [{ value: true, label: "Yes" }, { value: false, label: "No" }];

export const SETTINGS = [
  { key: "incomingemailfilteringmethod", table: "usersettings", kind: "choice", label: "Email tracking",
    help: "Personal Options › Email: which incoming email messages Dynamics 365 tracks automatically.",
    options: [
      { value: 0, label: "All email messages" },
      { value: 1, label: "Email messages in response to Dynamics 365 email" },
      { value: 2, label: "Email messages from Dynamics 365 Leads, Contacts and Accounts" },
      { value: 3, label: "Email messages from Dynamics 365 records that are email enabled" },
      { value: 4, label: "No email messages" },
    ] },
  { key: "timezonecode", table: "usersettings", kind: "integer", source: "timezones", label: "Time zone",
    help: "Dates and times are shown and entered in this time zone. The list is the org's own time zone definitions." },
  { key: "uilanguageid", table: "usersettings", kind: "integer", source: "languages", label: "User interface language",
    help: "Language of the app. Only the languages provisioned on this org are offered — Dataverse refuses the others." },
  { key: "helplanguageid", table: "usersettings", kind: "integer", source: "languages", label: "Help language",
    help: "Language of the Help content. Only the languages provisioned on this org are offered." },
  { key: "localeid", table: "usersettings", kind: "integer", source: "locales", label: "Regional format (dates & numbers)",
    help: "Personal Options › Formats: how dates, times and numbers are DISPLAYED — not the interface language. The Personal Options dialog also refreshes the detailed date/number patterns when a format is picked; this screen writes the format (localeid) only, so check one user's dates and numbers before rolling it out." },
  { key: "transactioncurrencyid", table: "usersettings", kind: "lookup", source: "currencies", label: "Default currency",
    nav: "transactioncurrencyid", targetSet: "transactioncurrencies",
    help: "Currency pre-filled on the records the user creates. Only active currencies are offered." },
  { key: "paginglimit", table: "usersettings", kind: "integer", label: "Records per page",
    help: "Rows per page in list views (Personal Options › General).",
    options: [25, 50, 75, 100, 250].map(n => ({ value: n, label: String(n) })) },
  { key: "issendasallowed", table: "usersettings", kind: "boolean", label: "Allow others to send email on my behalf",
    help: "Personal Options › Email: lets other users send email on this user's behalf.", options: yesNo },
  { key: "reportscripterrors", table: "usersettings", kind: "choice", label: "Script error reporting",
    help: "Personal Options › Privacy: what happens when a script error occurs. An org-level privacy setting can override the user's choice.",
    options: [
      { value: 1, label: "Ask me for permission to send an error report to Microsoft" },
      { value: 2, label: "Automatically send an error report to Microsoft without asking me for permission" },
      { value: 3, label: "Never send an error report to Microsoft about Microsoft Dynamics 365" },
    ] },
  { key: "defaultsearchexperience", table: "usersettings", kind: "choice", label: "Default search experience",
    help: "Personal Options › General: the search mode the app opens with.",
    options: [
      { value: 0, label: "Relevance search" },
      { value: 1, label: "Categorized search" },
      { value: 2, label: "Use last search" },
      { value: 3, label: "Custom search" },
    ] },
  { key: "incomingemaildeliverymethod", table: "mailbox", kind: "choice", label: "Incoming email",
    help: "How incoming email reaches the mailbox. Server-side sync only processes a mailbox after a successful Test & Enable.",
    options: [
      { value: 0, label: "None" },
      { value: 1, label: "Microsoft Dynamics 365 for Outlook" },
      { value: 2, label: "Server-Side Synchronization" },
      { value: 3, label: "Forward Mailbox" },
    ] },
  { key: "outgoingemaildeliverymethod", table: "mailbox", kind: "choice", label: "Outgoing email",
    help: "How outgoing email leaves the mailbox. Server-side sync only processes a mailbox after a successful Test & Enable.",
    options: [
      { value: 0, label: "None" },
      { value: 1, label: "Microsoft Dynamics 365 for Outlook" },
      { value: 2, label: "Server-Side Synchronization" },
    ] },
  { key: "actdeliverymethod", table: "mailbox", kind: "choice", label: "Appointments, contacts and tasks",
    help: "How appointments, contacts and tasks synchronize with Exchange. Server-side sync only processes a mailbox after a successful Test & Enable.",
    options: [
      { value: 0, label: "Microsoft Dynamics 365 for Outlook" },
      { value: 1, label: "Server-Side Synchronization" },
      { value: 2, label: "None" },
    ] },
  { key: "emailrouteraccessapproval", table: "mailbox", kind: "choice", label: "Email address approval",
    help: "Approving needs the \"Approve Email Addresses for Users or Queues\" privilege — and, with Exchange Online, System Administrator plus Microsoft 365 Global admin or Exchange admin (or the Delegated Mailbox Approver role). Users can approve their OWN mailbox when its address matches their UPN. Every refusal is listed per user with the server's message.",
    options: [
      { value: 0, label: "Empty", writable: false },
      { value: 1, label: "Approved" },
      { value: 2, label: "Pending Approval" },
      { value: 3, label: "Rejected" },
    ] },
];

// Regional formats offered for localeid (Windows LCIDs) — also the fallback NAME of any LCID the
// org reports (a UI/help language outside the provisioned list).
export const LOCALE_NAMES = {
  1025: "Arabic (Saudi Arabia)", 3073: "Arabic (Egypt)", 5121: "Arabic (Algeria)", 6145: "Arabic (Morocco)", 7169: "Arabic (Tunisia)", 14337: "Arabic (U.A.E.)",
  1026: "Bulgarian", 1027: "Catalan", 2052: "Chinese (PRC)", 1028: "Chinese (Taiwan)", 3076: "Chinese (Hong Kong SAR)", 1050: "Croatian", 1029: "Czech", 1030: "Danish",
  1043: "Dutch (Netherlands)", 2067: "Dutch (Belgium)",
  1033: "English (United States)", 2057: "English (United Kingdom)", 3081: "English (Australia)", 4105: "English (Canada)", 5129: "English (New Zealand)", 6153: "English (Ireland)", 7177: "English (South Africa)", 16393: "English (India)",
  1061: "Estonian", 1035: "Finnish",
  1036: "French (France)", 2060: "French (Belgium)", 3084: "French (Canada)", 4108: "French (Switzerland)", 5132: "French (Luxembourg)",
  1031: "German (Germany)", 3079: "German (Austria)", 2055: "German (Switzerland)", 4103: "German (Luxembourg)",
  1032: "Greek", 1037: "Hebrew", 1081: "Hindi", 1038: "Hungarian", 1057: "Indonesian", 1040: "Italian (Italy)", 2064: "Italian (Switzerland)", 1041: "Japanese", 1087: "Kazakh", 1042: "Korean",
  1062: "Latvian", 1063: "Lithuanian", 1086: "Malay (Malaysia)", 1044: "Norwegian (Bokmål)", 1045: "Polish", 1046: "Portuguese (Brazil)", 2070: "Portuguese (Portugal)",
  1048: "Romanian", 1049: "Russian", 1051: "Slovak", 1060: "Slovenian", 3082: "Spanish (Spain)", 2058: "Spanish (Mexico)", 11274: "Spanish (Argentina)", 1053: "Swedish",
  1054: "Thai", 1055: "Turkish", 1058: "Ukrainian", 1066: "Vietnamese", 1069: "Basque", 1110: "Galician",
};

export const settingsFor = (table) => SETTINGS.filter(s => s.table === table);
export const findSetting = (key) => SETTINGS.find(s => s.key === key) || null;
// The column a READ returns: a lookup comes back as _<name>_value.
export const readField = (s) => s.kind === "lookup" ? `_${s.key}_value` : s.key;
export const selectFor = (table) => {
  const t = SETTINGS_TABLES[table];
  return [t.idField, ...settingsFor(table).map(readField), ...t.extra].join(",");
};

// Comparable canonical value (what "already at this value" compares): numbers, booleans,
// lower-case GUIDs; null when unset or unreadable.
export function normalizeValue(s, raw) {
  if (raw === null || raw === undefined || raw === "") return null;
  if (s.kind === "lookup") return typeof raw === "string" && GUID_RE.test(raw) ? raw.toLowerCase() : null;
  if (s.kind === "boolean") return raw === true || raw === "true" ? true : raw === false || raw === "false" ? false : null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

// timezonedefinition rows → one entry per code (retiredorder 0 = the current definition), in the
// Windows order: west to east (bias = minutes to ADD to local time to get UTC), then by name.
export function normalizeTimeZones(rows) {
  const best = new Map();
  for (const r of rows || []) {
    const code = Number(r?.timezonecode);
    if (r?.timezonecode == null || !Number.isFinite(code)) continue;
    const ord = Number(r.retiredorder) || 0;
    const prev = best.get(code);
    if (!prev || ord < prev.ord) best.set(code, { code, name: r.userinterfacename || r.standardname || `Time zone ${code}`, bias: Number(r.bias) || 0, ord });
  }
  return [...best.values()].map(z => ({ code: z.code, name: z.name, bias: z.bias })).sort((a, b) => b.bias - a.bias || a.name.localeCompare(b.name));
}

export function normalizeCurrencies(rows) {
  return (rows || []).filter(r => r?.transactioncurrencyid).map(r => ({
    id: String(r.transactioncurrencyid).toLowerCase(),
    name: r.currencyname || r.isocurrencycode || "(unnamed)",
    iso: r.isocurrencycode || "",
    symbol: r.currencysymbol || "",
    active: (r.statecode ?? 0) === 0,
  })).sort((a, b) => a.name.localeCompare(b.name));
}

// Options of a setting. forWrite = the values one may PICK (active currencies only, no
// display-only codes such as approval "Empty"); otherwise every value that can be DISPLAYED.
export function optionsFor(s, ctx = {}, { forWrite = false } = {}) {
  if (!s) return [];
  if (s.options) return forWrite ? s.options.filter(o => o.writable !== false) : s.options;
  if (s.source === "timezones") return (ctx.timezones || []).map(z => ({ value: z.code, label: z.name }));
  if (s.source === "languages") return (ctx.languages || []).map(l => ({ value: Number(l.code), label: l.name || LOCALE_NAMES[l.code] || `LCID ${l.code}` }));
  if (s.source === "locales") return Object.entries(LOCALE_NAMES).map(([k, v]) => ({ value: Number(k), label: v })).sort((a, b) => a.label.localeCompare(b.label));
  if (s.source === "currencies") return (ctx.currencies || []).filter(c => !forWrite || c.active)
    .map(c => ({ value: c.id, label: `${c.name}${c.iso ? ` (${c.iso})` : ""}${c.active ? "" : " — inactive"}` }));
  return [];
}

// Readable label of a stored value: the catalog first, then the server's formatted annotation
// (choices / lookups only — an Integer's annotation is just the number with a thousands
// separator, "1,036"), then a known LCID name, then the raw code.
export function formatValue(s, row, ctx = {}) {
  if (!s || !row) return "—";
  const f = readField(s);
  const v = normalizeValue(s, row[f]);
  if (v === null) return "—";
  const hit = optionsFor(s, ctx).find(o => normalizeValue(s, o.value) === v);
  if (hit) return hit.label;
  if (s.kind !== "integer" && row[f + FMT]) return String(row[f + FMT]);
  if ((s.source === "languages" || s.source === "locales") && LOCALE_NAMES[v]) return `${LOCALE_NAMES[v]} (${v})`;
  if (s.source === "timezones") return `Time zone code ${v}`;
  if (s.kind === "integer") return String(v);
  return s.kind === "lookup" ? v : `Value ${v}`;
}

// PATCH body for one setting. Refuses (throws) anything that isn't a value of the setting's
// type, so a malformed write can't be sent.
export function buildPatchBody(s, value) {
  if (!s) throw new Error("Unknown setting");
  if (s.kind === "lookup") {
    const id = normalizeValue(s, value);
    if (!id) throw new Error(`${s.label}: not a record id`);
    return { [`${s.nav}@odata.bind`]: `/${s.targetSet}(${id})` };
  }
  if (s.kind === "boolean") {
    if (typeof value !== "boolean") throw new Error(`${s.label}: expected Yes or No`);
    return { [s.key]: value };
  }
  const n = Number(value);
  if (value === null || value === "" || typeof value === "boolean" || !Number.isInteger(n)) throw new Error(`${s.label}: expected a whole number`);
  if (s.options && !s.options.some(o => o.writable !== false && o.value === n)) throw new Error(`${s.label}: ${n} is not one of its values`);
  return { [s.key]: n };
}

// Raw rows → { byUser: Map(userId lower-case → { recordId, row }), duplicates, skipped }.
// Mailboxes: only those regarding a systemuser (queue mailboxes skipped); a user with several
// keeps a non-forward one.
export function indexRows(table, rows, users = []) {
  const byUser = new Map();
  let duplicates = 0, skipped = 0;
  if (table === "usersettings") {
    for (const r of rows || []) if (r?.systemuserid) byUser.set(String(r.systemuserid).toLowerCase(), { recordId: r.systemuserid, row: r });
    return { byUser, duplicates, skipped };
  }
  const known = new Set((users || []).map(u => String(u.id).toLowerCase()));
  for (const r of rows || []) {
    const reg = r?._regardingobjectid_value ? String(r._regardingobjectid_value).toLowerCase() : "";
    const kind = r?.["_regardingobjectid_value" + LOOKUP_TABLE];
    const isUser = !!reg && (kind ? kind === "systemuser" : known.has(reg));
    if (!isUser || !r.mailboxid) { skipped++; continue; }
    const prev = byUser.get(reg);
    if (prev) {
      duplicates++;
      if (prev.row.isforwardmailbox === true && r.isforwardmailbox !== true) byUser.set(reg, { recordId: r.mailboxid, row: r });
      continue;
    }
    byUser.set(reg, { recordId: r.mailboxid, row: r });
  }
  return { byUser, duplicates, skipped };
}

// Who a write would touch: selected users whose current value differs. Users already at the
// value are skipped (unchanged); users without a row (no mailbox) are counted apart.
export function planChange(selectedIds, byUser, s, newValue) {
  const target = normalizeValue(s, newValue);
  const write = [], same = [], missing = [];
  for (const id of selectedIds || []) {
    const hit = byUser?.get(String(id).toLowerCase());
    if (!hit) { missing.push(id); continue; }
    if (target !== null && normalizeValue(s, hit.row[readField(s)]) === target) same.push(id);
    else write.push({ userId: id, recordId: hit.recordId });
  }
  return { write, same, missing };
}

// User-list filters. kind: "people" (default — support, non-interactive, delegated-admin and
// application users never sign in), "service", "all". status: "enabled" | "disabled" | "all".
// roleIds: Set of lower-case user ids, or null for no role filter.
// signedIn: "any" | "yes" | "never", read from lastLogins (Map lower-case id → { date } with date
// null for never). A user whose last login isn't known (not read yet, or unreadable) matches
// neither "yes" nor "never" — never assumed.
export function filterUsers(users, { search = "", buId = "", status = "enabled", kind = "people", roleIds = null, signedIn = "any", lastLogins = null } = {}) {
  const q = search.trim().toLowerCase();
  return (users || []).filter(u => {
    if (status === "enabled" && u.disabled) return false;
    if (status === "disabled" && !u.disabled) return false;
    if (kind === "people" && isServiceAccount(u)) return false;
    if (kind === "service" && !isServiceAccount(u)) return false;
    if (buId && u.buId !== buId) return false;
    if (roleIds && !roleIds.has(String(u.id).toLowerCase())) return false;
    if (signedIn !== "any") {
      const ll = lastLogins?.get(String(u.id).toLowerCase());
      if (!ll || ll.error) return false;
      if (signedIn === "yes" ? !ll.date : !!ll.date) return false;
    }
    if (q && !`${u.fullname || ""} ${u.email || ""}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

export function buOptions(users) {
  const m = new Map();
  for (const u of users || []) if (u.buId) m.set(u.buId, u.buName || u.buId);
  return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
}

// Export: one row per listed user, every setting of the table as a readable column.
// lastLogins (optional): adds a "Last login" column — ISO date, "Never", or empty when unknown.
export function exportRows(table, users, byUser, ctx = {}, lastLogins = null) {
  const list = settingsFor(table);
  const mb = table === "mailbox";
  const headers = ["Name", "Email", "Business unit", "Status", "Account type", ...(lastLogins ? ["Last login"] : []), ...(mb ? ["Mailbox"] : []), ...list.map(s => s.label)];
  const rows = (users || []).map(u => {
    const hit = byUser?.get(String(u.id).toLowerCase());
    const ll = lastLogins?.get(String(u.id).toLowerCase());
    return [u.fullname || "", u.email || "", u.buName || "", u.disabled ? "Disabled" : "Enabled", isServiceAccount(u) ? "Service / application" : "Person",
      ...(lastLogins ? [!ll || ll.error ? "" : ll.date || "Never"] : []),
      ...(mb ? [hit ? (hit.row.emailaddress || hit.row.name || "") : "(no mailbox)"] : []),
      ...list.map(s => hit ? formatValue(s, hit.row, ctx) : "")];
  });
  return { headers, rows };
}

// Limited-concurrency writer. Stops DISPATCHING when shouldStop() turns true or a fatal error
// (dead session) comes back — writes already in flight finish, written ones stay written.
// notSent = the items never dispatched.
export async function runPool(items, worker, { concurrency = 4, shouldStop, isFatal, onProgress } = {}) {
  const list = items || [];
  const results = new Array(list.length);
  let next = 0, done = 0, failed = 0, stopped = false;
  const lane = async () => {
    while (true) {
      if (stopped || shouldStop?.()) { stopped = true; return; }
      const i = next++;
      if (i >= list.length) return;
      try { await worker(list[i], i); results[i] = { item: list[i], ok: true }; }
      catch (e) {
        const error = e?.message || String(e);
        results[i] = { item: list[i], ok: false, error };
        failed++;
        if (isFatal?.(error)) stopped = true;
      }
      done++;
      onProgress?.({ done, failed, total: list.length });
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, list.length)) }, lane));
  return { results: results.filter(Boolean), notSent: list.filter((_, i) => !results[i]), stopped };
}
