// Demo-mode data for Users & Licenses › Bulk settings: the usersettings rows, mailboxes, time
// zone definitions and currencies a live org returns for the demo users of getAllUsers (u1…u8),
// in the same shapes as the Web API reads (formatted-value and lookup annotations included).
// Writes go to this in-memory copy, so the module's apply → per-user result → refreshed values
// loop runs for real. Pure: no React, no DOM, no network.
import { SETTINGS, SETTINGS_TABLES, findSetting } from "./userSettingsCatalog.js";
import { binGuid } from "./recycleBinDemo.js";

const FMT = "@OData.Community.Display.V1.FormattedValue";
const LOOKUP_TABLE = "@Microsoft.Dynamics.CRM.lookuplogicalname";

// The signed-in demo user (Zakaria Missoum, CRM Admin): the only mailbox he can approve is his
// own — Microsoft's self-approval rule — every other approval needs a Microsoft 365 admin.
export const DEMO_CURRENT_USER = "u1";

// [code, userinterfacename, bias, retiredorder]
const TIME_ZONES = [
  [4, "(GMT-08:00) Pacific Time (US & Canada)", 480, 0],
  [20, "(GMT-06:00) Central Time (US & Canada)", 360, 0],
  [35, "(GMT-05:00) Eastern Time (US & Canada)", 300, 0],
  [35, "(GMT-05:00) Eastern Time (US & Canada) — 2006 rules", 300, 1],
  [85, "(GMT) Dublin, Edinburgh, Lisbon, London", 0, 0],
  [92, "(GMT) Coordinated Universal Time", 0, 0],
  [105, "(GMT+01:00) Brussels, Copenhagen, Madrid, Paris", -60, 0],
  [110, "(GMT+01:00) Amsterdam, Berlin, Bern, Rome, Stockholm, Vienna", -60, 0],
  [190, "(GMT+05:30) Chennai, Kolkata, Mumbai, New Delhi", -330, 0],
  [235, "(GMT+09:00) Osaka, Sapporo, Tokyo", -540, 0],
  [255, "(GMT+10:00) Canberra, Melbourne, Sydney", -600, 0],
];

// [iso, name, symbol, statecode]
const CURRENCIES = [["EUR", "Euro", "€", 0], ["USD", "US Dollar", "$", 0], ["GBP", "Pound Sterling", "£", 0], ["CHF", "Swiss Franc", "CHF", 1]];
export const demoCurrencyId = (iso) => binGuid("currency-" + iso);

// Per user: [tracking, time zone, UI lang, help lang, locale, currency, paging, send-as, script errors, search]
const SETTINGS_ROWS = {
  u1: [2, 105, 1036, 1036, 1036, "EUR", 50, false, 1, 2],
  u2: [2, 105, 1036, 1036, 1036, "EUR", 50, false, 1, 2],
  u3: [1, 85, 1033, 1033, 2057, "GBP", 50, false, 1, 2],
  u4: [2, 105, 1036, 1036, 1036, "EUR", 25, false, 1, 0],
  u5: [4, 4, 1033, 1033, 1033, "USD", 50, false, 1, 2],
  u6: [2, 85, 1033, 1033, 2057, "GBP", 250, true, 2, 1],
  u7: [2, 4, 1033, 1033, 1033, "USD", 50, false, 1, 2],
  u8: [0, 4, 1033, 1033, 1033, "USD", 100, true, 3, 2],
};
const SETTINGS_KEYS = ["incomingemailfilteringmethod", "timezonecode", "uilanguageid", "helplanguageid", "localeid", "transactioncurrencyid", "paginglimit", "issendasallowed", "reportscripterrors", "defaultsearchexperience"];

// Per mailbox: [regarding id, regarding table, name, email, incoming, outgoing, act, approval]
const MAILBOXES = [
  ["u1", "systemuser", "Zakaria Missoum", "zakaria@contoso.com", 2, 2, 1, 2],
  ["u2", "systemuser", "Marie Martin", "marie@contoso.com", 2, 2, 1, 1],
  ["u3", "systemuser", "Alex Baker", "alex@contoso.com", 2, 2, 1, 1],
  ["u4", "systemuser", "Sophie Lefevre", "sophie@contoso.com", 0, 0, 2, 0],
  ["u5", "systemuser", "Lucas Moreau", "lucas@contoso.com", 0, 0, 2, 2],
  ["u6", "systemuser", "Emma Petit", "emma@contoso.com", 1, 1, 0, 1],
  ["u7", "systemuser", "# D365 Integration", "integration@contoso.com", 0, 0, 2, 0],
  ["u8", "systemuser", "Pierre Bernard", "pierre@contoso.com", 2, 2, 1, 2],
  ["q-support", "queue", "Support", "support@contoso.com", 2, 2, 2, 1],
];

const labelOf = (key, v) => findSetting(key)?.options?.find(o => o.value === v)?.label;
const currencyName = (id) => CURRENCIES.find(c => demoCurrencyId(c[0]) === id)?.[1] || "";

// Formatted-value annotations follow the raw value, like a live read.
function annotate(row, key) {
  const s = findSetting(key);
  if (!s) return;
  if (s.kind === "lookup") {
    const f = `_${key}_value`;
    if (row[f]) { row[f + FMT] = currencyName(row[f]); row[f + LOOKUP_TABLE] = "transactioncurrency"; }
    else { delete row[f + FMT]; delete row[f + LOOKUP_TABLE]; }
    return;
  }
  const label = s.kind === "boolean" ? (row[key] ? "Yes" : "No") : s.kind === "integer" ? Number(row[key]).toLocaleString("en-US") : labelOf(key, row[key]);
  if (label !== undefined) row[key + FMT] = label;
}

export function createDemoUserSettings() {
  const settings = new Map();
  for (const [id, vals] of Object.entries(SETTINGS_ROWS)) {
    const row = { systemuserid: id };
    SETTINGS_KEYS.forEach((k, i) => {
      if (k === "transactioncurrencyid") row._transactioncurrencyid_value = demoCurrencyId(vals[i]);
      else row[k] = vals[i];
      annotate(row, k);
    });
    settings.set(id, row);
  }
  const mailboxes = new Map();
  for (const [reg, table, name, email, inc, out, act, appr] of MAILBOXES) {
    const id = binGuid("mailbox-" + reg);
    const row = { mailboxid: id, name, emailaddress: email, isforwardmailbox: false, _regardingobjectid_value: reg,
      ["_regardingobjectid_value" + FMT]: name, ["_regardingobjectid_value" + LOOKUP_TABLE]: table,
      incomingemaildeliverymethod: inc, outgoingemaildeliverymethod: out, actdeliverymethod: act, emailrouteraccessapproval: appr };
    ["incomingemaildeliverymethod", "outgoingemaildeliverymethod", "actdeliverymethod", "emailrouteraccessapproval"].forEach(k => annotate(row, k));
    mailboxes.set(id, row);
  }
  const store = { usersettings: settings, mailbox: mailboxes };

  return {
    rows(table) {
      const m = store[table];
      if (!m) throw new Error(`Unknown table ${table}`);
      return [...m.values()].map(r => ({ ...r }));
    },
    timeZones() {
      return TIME_ZONES.map(([timezonecode, userinterfacename, bias, retiredorder]) => ({ timezonecode, userinterfacename, bias, retiredorder }));
    },
    currencies() {
      return CURRENCIES.map(([iso, name, sym, state]) => ({ transactioncurrencyid: demoCurrencyId(iso), currencyname: name, isocurrencycode: iso, currencysymbol: sym, statecode: state }));
    },
    // Same contract as the live PATCH: resolves on success, throws the server-style message.
    update(table, id, body) {
      const m = store[table];
      const row = m?.get(id);
      if (!row) throw new Error(`HTTP 404: ${table} With Id = ${id} Does Not Exist`);
      const next = { ...row };
      for (const [k, v] of Object.entries(body || {})) {
        if (k.endsWith("@odata.bind")) {
          const nav = k.slice(0, -"@odata.bind".length);
          const s = SETTINGS.find(x => x.table === table && x.kind === "lookup" && x.nav === nav);
          const mt = String(v).match(/^\/(\w+)\(([0-9a-f-]{36})\)$/i);
          if (!s || !mt || mt[1] !== s.targetSet) throw new Error(`HTTP 400: An undeclared property '${nav}' was found in the payload`);
          const cur = CURRENCIES.find(c => demoCurrencyId(c[0]) === mt[2].toLowerCase());
          if (!cur) throw new Error(`HTTP 404: transactioncurrency With Id = ${mt[2]} Does Not Exist`);
          if (cur[3] !== 0) throw new Error(`HTTP 400: The currency ${cur[1]} is inactive`);
          next[`_${s.key}_value`] = mt[2].toLowerCase();
          annotate(next, s.key);
          continue;
        }
        const s = findSetting(k);
        if (!s || s.table !== table) throw new Error(`HTTP 400: Invalid property '${k}' was found in entity '${SETTINGS_TABLES[table]?.key || table}'`);
        if (k === "emailrouteraccessapproval" && v === 1 && row._regardingobjectid_value !== DEMO_CURRENT_USER) {
          throw new Error("HTTP 403: Approving this email address needs the Approve Email Addresses for Users or Queues privilege and a Microsoft 365 Global or Exchange admin (or the Delegated Mailbox Approver role) — demo org (permission error — your security roles, not your session)");
        }
        next[k] = v;
        annotate(next, k);
      }
      m.set(id, next);
      return { status: 204, ok: true };
    },
  };
}
