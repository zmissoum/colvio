import { describe, it, expect } from "vitest";
import { createDemoUserSettings, demoCurrencyId, DEMO_CURRENT_USER } from "../userSettingsDemo.js";
import { findSetting, settingsFor, readField, indexRows, normalizeTimeZones, normalizeCurrencies, formatValue, buildPatchBody, planChange, selectFor } from "../userSettingsCatalog.js";

const FMT = "@OData.Community.Display.V1.FormattedValue";
const DEMO_USERS = ["u1", "u2", "u3", "u4", "u5", "u6", "u7", "u8"].map(id => ({ id }));
const ctxOf = (d) => ({ timezones: normalizeTimeZones(d.timeZones()), currencies: normalizeCurrencies(d.currencies()), languages: [{ code: 1033, name: "English" }, { code: 1036, name: "French" }, { code: 1031, name: "German" }] });

describe("demo bulk settings — reads", () => {
  it("has one personal-settings row per demo user, with every catalog column", () => {
    const rows = createDemoUserSettings().rows("usersettings");
    expect(rows.map(r => r.systemuserid).sort()).toEqual(DEMO_USERS.map(u => u.id));
    const cols = selectFor("usersettings").split(",");
    for (const r of rows) for (const c of cols) expect(r[c]).not.toBeUndefined();
  });
  it("labels every stored value through the catalog (no raw codes on screen)", () => {
    const d = createDemoUserSettings();
    const ctx = ctxOf(d);
    for (const table of ["usersettings", "mailbox"]) {
      const { byUser } = indexRows(table, d.rows(table), DEMO_USERS);
      for (const { row } of byUser.values()) for (const s of settingsFor(table)) {
        expect(formatValue(s, row, ctx)).not.toMatch(/^(Value \d|Time zone code|—)/);
      }
    }
  });
  it("gives every user a mailbox and adds a queue mailbox the module must skip", () => {
    const d = createDemoUserSettings();
    const { byUser, skipped } = indexRows("mailbox", d.rows("mailbox"), DEMO_USERS);
    expect(byUser.size).toBe(8);
    expect(skipped).toBe(1);
  });
  it("carries the live read annotations (formatted values, lookup table)", () => {
    const d = createDemoUserSettings();
    const u3 = d.rows("usersettings").find(r => r.systemuserid === "u3");
    expect(u3["incomingemailfilteringmethod" + FMT]).toBe("Email messages in response to Dynamics 365 email");
    expect(u3["_transactioncurrencyid_value" + FMT]).toBe("Pound Sterling");
    expect(u3["localeid" + FMT]).toBe("2,057");
  });
  it("lists time zones with one retired duplicate and an inactive currency", () => {
    const d = createDemoUserSettings();
    expect(d.timeZones().length - normalizeTimeZones(d.timeZones()).length).toBe(1);
    expect(normalizeCurrencies(d.currencies()).filter(c => !c.active).map(c => c.iso)).toEqual(["CHF"]);
  });
  it("returns copies — a caller can't mutate the store", () => {
    const d = createDemoUserSettings();
    d.rows("usersettings")[0].paginglimit = 9999;
    expect(d.rows("usersettings").some(r => r.paginglimit === 9999)).toBe(false);
  });
});

describe("demo bulk settings — writes", () => {
  it("applies a PATCH body and keeps the annotations in step", () => {
    const d = createDemoUserSettings();
    const s = findSetting("incomingemailfilteringmethod");
    d.update("usersettings", "u5", buildPatchBody(s, 3));
    const r = d.rows("usersettings").find(x => x.systemuserid === "u5");
    expect(r.incomingemailfilteringmethod).toBe(3);
    expect(r["incomingemailfilteringmethod" + FMT]).toBe("Email messages from Dynamics 365 records that are email enabled");
  });
  it("binds the currency lookup and refuses an inactive one", () => {
    const d = createDemoUserSettings();
    const s = findSetting("transactioncurrencyid");
    d.update("usersettings", "u8", buildPatchBody(s, demoCurrencyId("EUR")));
    const r = d.rows("usersettings").find(x => x.systemuserid === "u8");
    expect(r[readField(s)]).toBe(demoCurrencyId("EUR"));
    expect(r[readField(s) + FMT]).toBe("Euro");
    expect(() => d.update("usersettings", "u8", buildPatchBody(s, demoCurrencyId("CHF")))).toThrow(/inactive/);
  });
  it("lets the signed-in user approve only their own mailbox (self-approval), refusing the others per mailbox", () => {
    const d = createDemoUserSettings();
    const s = findSetting("emailrouteraccessapproval");
    const { byUser } = indexRows("mailbox", d.rows("mailbox"), DEMO_USERS);
    const plan = planChange(["u1", "u2", "u5", "u8"], byUser, s, 1);
    expect(plan.same).toEqual(["u2"]); // already approved
    const outcome = plan.write.map(w => { try { d.update("mailbox", w.recordId, buildPatchBody(s, 1)); return [w.userId, "ok"]; } catch (e) { return [w.userId, e.message]; } });
    expect(outcome[0]).toEqual([DEMO_CURRENT_USER, "ok"]);
    expect(outcome.slice(1).map(o => o[0])).toEqual(["u5", "u8"]);
    expect(outcome.slice(1).every(o => /HTTP 403: .*Approve Email Addresses for Users or Queues/.test(o[1]))).toBe(true);
    // Pending / Rejected are not approvals — allowed
    expect(() => d.update("mailbox", byUser.get("u8").recordId, buildPatchBody(s, 3))).not.toThrow();
  });
  it("answers like the server for unknown records and properties", () => {
    const d = createDemoUserSettings();
    expect(() => d.update("usersettings", "nope", { paginglimit: 50 })).toThrow(/HTTP 404/);
    expect(() => d.update("usersettings", "u1", { emailrouteraccessapproval: 1 })).toThrow(/HTTP 400/);
    expect(() => d.update("bogus", "u1", {})).toThrow(/HTTP 404/);
  });
  it("keeps every store independent", () => {
    const a = createDemoUserSettings(), b = createDemoUserSettings();
    a.update("usersettings", "u1", { paginglimit: 250 });
    expect(b.rows("usersettings").find(r => r.systemuserid === "u1").paginglimit).toBe(50);
  });
});
