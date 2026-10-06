import { describe, it, expect } from "vitest";
import {
  SETTINGS, SETTINGS_TABLES, settingsFor, findSetting, readField, selectFor, normalizeValue, normalizeTimeZones,
  normalizeCurrencies, optionsFor, formatValue, buildPatchBody, indexRows, planChange, filterUsers, buOptions,
  exportRows, runPool,
} from "../userSettingsCatalog.js";

const FMT = "@OData.Community.Display.V1.FormattedValue";
const LK = "@Microsoft.Dynamics.CRM.lookuplogicalname";
const EUR = "6a1b2c3d-0000-4000-8000-00000000e0e0";
const USD = "6a1b2c3d-0000-4000-8000-00000000d0d0";
const ctx = {
  timezones: normalizeTimeZones([{ timezonecode: 105, userinterfacename: "(GMT+01:00) Paris", bias: -60, retiredorder: 0 }, { timezonecode: 4, userinterfacename: "(GMT-08:00) Pacific", bias: 480, retiredorder: 0 }]),
  languages: [{ code: 1033, name: "English" }, { code: 1036, name: "French" }],
  currencies: normalizeCurrencies([{ transactioncurrencyid: EUR.toUpperCase(), currencyname: "Euro", isocurrencycode: "EUR", statecode: 0 }, { transactioncurrencyid: USD, currencyname: "US Dollar", isocurrencycode: "USD", statecode: 1 }]),
};
const users = [
  { id: "A1", fullname: "Alice Martin", email: "alice@contoso.com", disabled: false, accessMode: 0, buId: "b1", buName: "Contoso" },
  { id: "a2", fullname: "Bruno Lefebvre", email: "bruno@contoso.com", disabled: true, accessMode: 0, buId: "b2", buName: "Sales EU" },
  { id: "a3", fullname: "# Integration", email: "int@contoso.com", disabled: false, accessMode: 4, buId: "b1", buName: "Contoso" },
  { id: "a4", fullname: "App user", email: "", disabled: false, accessMode: 0, isApp: true, buId: "b1", buName: "Contoso" },
  { id: "a5", fullname: "Chloé Dubois", email: "chloe@fabrikam.fr", disabled: false, accessMode: 1, buId: "b2", buName: "Sales EU" },
];

describe("catalog — Microsoft's codes", () => {
  it("covers both tables with the documented columns", () => {
    expect(settingsFor("usersettings").map(s => s.key)).toEqual(["incomingemailfilteringmethod", "timezonecode", "uilanguageid", "helplanguageid", "localeid", "transactioncurrencyid", "paginglimit", "issendasallowed", "reportscripterrors", "defaultsearchexperience"]);
    expect(settingsFor("mailbox").map(s => s.key)).toEqual(["incomingemaildeliverymethod", "outgoingemaildeliverymethod", "actdeliverymethod", "emailrouteraccessapproval"]);
    expect(SETTINGS_TABLES.usersettings).toMatchObject({ entitySet: "usersettingscollection", idField: "systemuserid" });
    expect(SETTINGS_TABLES.mailbox).toMatchObject({ entitySet: "mailboxes", idField: "mailboxid" });
  });
  it("keeps the option values of the reference tables", () => {
    const vals = (k) => findSetting(k).options.map(o => o.value);
    expect(vals("incomingemailfilteringmethod")).toEqual([0, 1, 2, 3, 4]);
    expect(vals("reportscripterrors")).toEqual([1, 2, 3]);
    expect(vals("defaultsearchexperience")).toEqual([0, 1, 2, 3]);
    expect(vals("incomingemaildeliverymethod")).toEqual([0, 1, 2, 3]);
    expect(vals("outgoingemaildeliverymethod")).toEqual([0, 1, 2]);
    expect(findSetting("actdeliverymethod").options.map(o => [o.value, o.label])).toEqual([[0, "Microsoft Dynamics 365 for Outlook"], [1, "Server-Side Synchronization"], [2, "None"]]);
    expect(vals("paginglimit")).toEqual([25, 50, 75, 100, 250]);
  });
  it("$select reads lookups as _x_value and the mailbox's regarding user", () => {
    expect(readField(findSetting("transactioncurrencyid"))).toBe("_transactioncurrencyid_value");
    expect(selectFor("usersettings").split(",")).toContain("_transactioncurrencyid_value");
    expect(selectFor("usersettings").startsWith("systemuserid,")).toBe(true);
    expect(selectFor("mailbox").split(",")).toEqual(expect.arrayContaining(["mailboxid", "_regardingobjectid_value", "emailrouteraccessapproval", "emailaddress"]));
    expect(SETTINGS.every(s => s.help && s.label)).toBe(true);
  });
});

describe("values — normalize, options, labels", () => {
  it("normalizes numbers, booleans and GUIDs; unset is null", () => {
    expect(normalizeValue(findSetting("paginglimit"), "50")).toBe(50);
    expect(normalizeValue(findSetting("issendasallowed"), false)).toBe(false);
    expect(normalizeValue(findSetting("transactioncurrencyid"), EUR.toUpperCase())).toBe(EUR);
    expect(normalizeValue(findSetting("transactioncurrencyid"), "EUR")).toBe(null);
    expect(normalizeValue(findSetting("timezonecode"), null)).toBe(null);
    expect(normalizeValue(findSetting("timezonecode"), "")).toBe(null);
  });
  it("keeps one time zone per code (current definition) west to east", () => {
    const tz = normalizeTimeZones([
      { timezonecode: 105, userinterfacename: "Paris", bias: -60, retiredorder: 0 },
      { timezonecode: 35, userinterfacename: "Eastern (old)", bias: 300, retiredorder: 1 },
      { timezonecode: 35, userinterfacename: "Eastern", bias: 300, retiredorder: 0 },
      { timezonecode: 4, userinterfacename: "Pacific", bias: 480, retiredorder: 0 },
      { userinterfacename: "broken" },
    ]);
    expect(tz).toEqual([{ code: 4, name: "Pacific", bias: 480 }, { code: 35, name: "Eastern", bias: 300 }, { code: 105, name: "Paris", bias: -60 }]);
  });
  it("offers only active currencies and no display-only codes for writing", () => {
    const cur = findSetting("transactioncurrencyid");
    expect(optionsFor(cur, ctx, { forWrite: true })).toEqual([{ value: EUR, label: "Euro (EUR)" }]);
    expect(optionsFor(cur, ctx).map(o => o.label)).toEqual(["Euro (EUR)", "US Dollar (USD) — inactive"]);
    expect(optionsFor(findSetting("emailrouteraccessapproval"), ctx, { forWrite: true }).map(o => o.value)).toEqual([1, 2, 3]);
    expect(optionsFor(findSetting("uilanguageid"), ctx)).toEqual([{ value: 1033, label: "English" }, { value: 1036, label: "French" }]);
    const loc = optionsFor(findSetting("localeid"), ctx);
    expect(loc.find(o => o.value === 1036).label).toBe("French (France)");
    expect(loc.map(o => o.label)).toEqual([...loc.map(o => o.label)].sort((a, b) => a.localeCompare(b)));
  });
  it("formats stored values readably, never a bare code when a name exists", () => {
    expect(formatValue(findSetting("incomingemailfilteringmethod"), { incomingemailfilteringmethod: 2 }, ctx)).toBe("Email messages from Dynamics 365 Leads, Contacts and Accounts");
    expect(formatValue(findSetting("timezonecode"), { timezonecode: 105 }, ctx)).toBe("(GMT+01:00) Paris");
    expect(formatValue(findSetting("timezonecode"), { timezonecode: 92 }, ctx)).toBe("Time zone code 92");
    // a language not provisioned any more: the LCID name, not the Integer annotation "1,031"
    expect(formatValue(findSetting("uilanguageid"), { uilanguageid: 1031, ["uilanguageid" + FMT]: "1,031" }, ctx)).toBe("German (Germany) (1031)");
    expect(formatValue(findSetting("transactioncurrencyid"), { _transactioncurrencyid_value: EUR }, ctx)).toBe("Euro (EUR)");
    expect(formatValue(findSetting("transactioncurrencyid"), { _transactioncurrencyid_value: "11111111-2222-4333-8444-555555555555", ["_transactioncurrencyid_value" + FMT]: "Yen" }, ctx)).toBe("Yen");
    expect(formatValue(findSetting("emailrouteraccessapproval"), { emailrouteraccessapproval: 0 }, ctx)).toBe("Empty");
    expect(formatValue(findSetting("paginglimit"), { paginglimit: 30 }, ctx)).toBe("30");
    expect(formatValue(findSetting("issendasallowed"), { issendasallowed: true }, ctx)).toBe("Yes");
    expect(formatValue(findSetting("paginglimit"), {}, ctx)).toBe("—");
  });
});

describe("buildPatchBody", () => {
  it("writes the currency through @odata.bind to the entity set", () => {
    expect(buildPatchBody(findSetting("transactioncurrencyid"), EUR.toUpperCase())).toEqual({ "transactioncurrencyid@odata.bind": `/transactioncurrencies(${EUR})` });
    expect(() => buildPatchBody(findSetting("transactioncurrencyid"), "EUR")).toThrow(/record id/);
  });
  it("writes choices, integers and booleans as typed values", () => {
    expect(buildPatchBody(findSetting("incomingemailfilteringmethod"), "3")).toEqual({ incomingemailfilteringmethod: 3 });
    expect(buildPatchBody(findSetting("timezonecode"), 105)).toEqual({ timezonecode: 105 });
    expect(buildPatchBody(findSetting("issendasallowed"), false)).toEqual({ issendasallowed: false });
  });
  it("refuses values outside the setting's type or choices", () => {
    expect(() => buildPatchBody(findSetting("incomingemailfilteringmethod"), 7)).toThrow(/not one of its values/);
    expect(() => buildPatchBody(findSetting("emailrouteraccessapproval"), 0)).toThrow(/not one of its values/); // "Empty" is display-only
    expect(() => buildPatchBody(findSetting("paginglimit"), 33)).toThrow(/not one of its values/);
    expect(() => buildPatchBody(findSetting("timezonecode"), "1.5")).toThrow(/whole number/);
    expect(() => buildPatchBody(findSetting("timezonecode"), "")).toThrow(/whole number/);
    expect(() => buildPatchBody(findSetting("issendasallowed"), "yes")).toThrow(/Yes or No/);
    expect(() => buildPatchBody(null, 1)).toThrow(/Unknown setting/);
  });
});

describe("indexRows + planChange", () => {
  it("indexes personal settings by user id, case-insensitively", () => {
    const { byUser } = indexRows("usersettings", [{ systemuserid: "A1", paginglimit: 50 }, { systemuserid: "a5", paginglimit: 250 }]);
    expect(byUser.get("a1")).toEqual({ recordId: "A1", row: { systemuserid: "A1", paginglimit: 50 } });
    expect(byUser.size).toBe(2);
  });
  it("keeps user mailboxes, skips queue mailboxes and prefers a non-forward duplicate", () => {
    const rows = [
      { mailboxid: "m1", _regardingobjectid_value: "A1", ["_regardingobjectid_value" + LK]: "systemuser", isforwardmailbox: true },
      { mailboxid: "m2", _regardingobjectid_value: "a1", ["_regardingobjectid_value" + LK]: "systemuser", isforwardmailbox: false },
      { mailboxid: "mq", _regardingobjectid_value: "q1", ["_regardingobjectid_value" + LK]: "queue" },
      { mailboxid: "m5", _regardingobjectid_value: "a5" }, // no annotation: matched against the user list
      { mailboxid: "mx", _regardingobjectid_value: "zz" },
      { mailboxid: "mn" },
    ];
    const { byUser, duplicates, skipped } = indexRows("mailbox", rows, users);
    expect(byUser.get("a1").recordId).toBe("m2");
    expect(byUser.get("a5").recordId).toBe("m5");
    expect(byUser.has("q1")).toBe(false);
    expect({ duplicates, skipped, size: byUser.size }).toEqual({ duplicates: 1, skipped: 3, size: 2 });
  });
  it("splits a selection into to-write, already-at-value and without-row", () => {
    const s = findSetting("timezonecode");
    const { byUser } = indexRows("usersettings", [{ systemuserid: "a1", timezonecode: 105 }, { systemuserid: "a2", timezonecode: 4 }, { systemuserid: "a3" }]);
    const p = planChange(["A1", "a2", "a3", "a9"], byUser, s, 105);
    expect(p).toEqual({ write: [{ userId: "a2", recordId: "a2" }, { userId: "a3", recordId: "a3" }], same: ["A1"], missing: ["a9"] });
  });
  it("compares lookups by GUID whatever the case", () => {
    const s = findSetting("transactioncurrencyid");
    const { byUser } = indexRows("usersettings", [{ systemuserid: "a1", _transactioncurrencyid_value: EUR.toUpperCase() }]);
    expect(planChange(["a1"], byUser, s, EUR).same).toEqual(["a1"]);
    expect(planChange(["a1"], byUser, s, USD).write).toHaveLength(1);
  });
});

describe("filterUsers / buOptions", () => {
  it("defaults to enabled people — service and application users excluded", () => {
    expect(filterUsers(users).map(u => u.id)).toEqual(["A1", "a5"]);
    expect(filterUsers(users, { kind: "service" }).map(u => u.id)).toEqual(["a3", "a4"]);
    expect(filterUsers(users, { status: "disabled", kind: "all" }).map(u => u.id)).toEqual(["a2"]);
    expect(filterUsers(users, { status: "all", kind: "all" })).toHaveLength(5);
  });
  it("filters by business unit, role members and name/email search", () => {
    expect(filterUsers(users, { buId: "b2", status: "all" }).map(u => u.id)).toEqual(["a2", "a5"]);
    expect(filterUsers(users, { roleIds: new Set(["a1"]) }).map(u => u.id)).toEqual(["A1"]);
    expect(filterUsers(users, { search: "FABRIKAM" }).map(u => u.id)).toEqual(["a5"]);
    expect(filterUsers(users, { search: "  alice " }).map(u => u.id)).toEqual(["A1"]);
  });
  it("lists each business unit once, by name", () => {
    expect(buOptions(users)).toEqual([["b1", "Contoso"], ["b2", "Sales EU"]]);
  });
});

describe("exportRows", () => {
  it("exports every setting of the table as readable columns", () => {
    const { byUser } = indexRows("usersettings", [{ systemuserid: "a1", timezonecode: 105, paginglimit: 50, _transactioncurrencyid_value: EUR }]);
    const { headers, rows } = exportRows("usersettings", users.slice(0, 2), byUser, ctx);
    expect(headers.slice(0, 5)).toEqual(["Name", "Email", "Business unit", "Status", "Account type"]);
    expect(headers).toContain("Time zone");
    const r = rows[0];
    expect(r[headers.indexOf("Time zone")]).toBe("(GMT+01:00) Paris");
    expect(r[headers.indexOf("Default currency")]).toBe("Euro (EUR)");
    expect(rows[1][headers.indexOf("Time zone")]).toBe(""); // no row loaded for that user
  });
  it("says which users have no mailbox", () => {
    const { byUser } = indexRows("mailbox", [{ mailboxid: "m1", _regardingobjectid_value: "a1", emailaddress: "alice@contoso.com", emailrouteraccessapproval: 1 }], users);
    const { headers, rows } = exportRows("mailbox", users.slice(0, 2), byUser, ctx);
    expect(rows.map(r => r[headers.indexOf("Mailbox")])).toEqual(["alice@contoso.com", "(no mailbox)"]);
    expect(rows[0][headers.indexOf("Email address approval")]).toBe("Approved");
  });
});

describe("runPool", () => {
  const tick = () => new Promise(r => setTimeout(r, 0));
  it("never runs more than `concurrency` writes at once and reports every result", async () => {
    let live = 0, peak = 0;
    const seen = [];
    const out = await runPool([1, 2, 3, 4, 5, 6, 7], async (n) => {
      live++; peak = Math.max(peak, live); await tick(); live--;
      if (n === 3) throw new Error("HTTP 403: missing privilege");
    }, { concurrency: 3, onProgress: p => seen.push(p) });
    expect(peak).toBe(3);
    expect(out.results).toHaveLength(7);
    expect(out.results.find(r => r.item === 3)).toEqual({ item: 3, ok: false, error: "HTTP 403: missing privilege" });
    expect(out.notSent).toEqual([]);
    expect(seen.at(-1)).toEqual({ done: 7, failed: 1, total: 7 });
  });
  it("stops dispatching on cancel — in-flight writes finish, the rest is reported not sent", async () => {
    let stop = false;
    const out = await runPool([1, 2, 3, 4, 5, 6], async (n) => { await tick(); if (n === 1) stop = true; }, { concurrency: 2, shouldStop: () => stop });
    expect(out.stopped).toBe(true);
    expect(out.results.map(r => r.item)).toEqual([1, 2]);
    expect(out.notSent).toEqual([3, 4, 5, 6]);
  });
  it("stops on a fatal error (dead session)", async () => {
    const out = await runPool([1, 2, 3, 4], async (n) => { await tick(); if (n === 1) throw new Error("SESSION_EXPIRED: refresh"); }, { concurrency: 1, isFatal: e => /SESSION_EXPIRED/.test(e) });
    expect(out.results).toHaveLength(1);
    expect(out.notSent).toEqual([2, 3, 4]);
    expect(out.stopped).toBe(true);
  });
  it("handles an empty list", async () => {
    expect(await runPool([], async () => {})).toEqual({ results: [], notSent: [], stopped: false });
  });
});
