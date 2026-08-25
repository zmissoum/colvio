import { describe, it, expect } from "vitest";
import { coerceScalarForEdit, prepareUpdate } from "../updateUtils.js";

const G = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const META = {
  fieldTypes: {
    revenue: "Money", numberofemployees: "Integer", industrycode: "Picklist",
    donotemail: "Boolean", createdon: "DateTime", accountid: "Uniqueidentifier",
    parentaccountid: "Lookup", customerid: "Customer", brokenlookup: "Lookup", nosetlookup: "Lookup",
    name: "String",
  },
  lookupBinds: {
    parentaccountid: [{ nav: "parentaccountid", target: "account", set: "accounts" }],
    customerid: [
      { nav: "customerid_account", target: "account", set: "accounts" },
      { nav: "customerid_contact", target: "contact", set: "contacts" },
    ],
    nosetlookup: [{ nav: "nav_x", target: "fou_thing", set: null }],
  },
  odataFieldMap: { parentaccountid: "_parentaccountid_value" },
};

describe("coerceScalarForEdit — never a silent clear", () => {
  it("numbers coerce to JSON numbers; garbage and comma decimals are REFUSED (old code nulled them)", () => {
    expect(coerceScalarForEdit("1234.56", "Money")).toEqual({ ok: true, value: 1234.56 });
    expect(coerceScalarForEdit("450", "Integer")).toEqual({ ok: true, value: 450 });
    expect(coerceScalarForEdit("abc", "Integer").ok).toBe(false);
    expect(coerceScalarForEdit("12,5", "Integer").ok).toBe(false);
  });
  it("booleans accept true/false/1/0/yes/no, refuse anything else", () => {
    expect(coerceScalarForEdit("yes", "Boolean")).toEqual({ ok: true, value: true });
    expect(coerceScalarForEdit("0", "Boolean")).toEqual({ ok: true, value: false });
    expect(coerceScalarForEdit("oui", "Boolean").ok).toBe(false);
  });
  it("option sets require the numeric value", () => {
    expect(coerceScalarForEdit("3", "Picklist")).toEqual({ ok: true, value: 3 });
    const r = coerceScalarForEdit("Technology", "Picklist");
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/NUMERIC value/);
  });
  it("dates must parse; GUIDs must be GUID-shaped", () => {
    expect(coerceScalarForEdit("2026-08-26", "DateTime").ok).toBe(true);
    expect(coerceScalarForEdit("pas une date", "DateTime").ok).toBe(false);
    expect(coerceScalarForEdit(G, "Uniqueidentifier")).toEqual({ ok: true, value: G });
    expect(coerceScalarForEdit("3276711868", "Uniqueidentifier").ok).toBe(false);
  });
  it("strings pass through untouched", () => {
    expect(coerceScalarForEdit("hello 'world'", "String")).toEqual({ ok: true, value: "hello 'world'" });
  });
});

describe("prepareUpdate — scalars", () => {
  it("builds a typed body and localValue, mapping through odataFieldMap", () => {
    expect(prepareUpdate(META, "revenue", "99.5")).toEqual({ ok: true, body: { revenue: 99.5 }, localValue: 99.5 });
  });
  it("empty or 'null' clears the field", () => {
    expect(prepareUpdate(META, "name", "")).toEqual({ ok: true, body: { name: null }, localValue: null });
    expect(prepareUpdate(META, "revenue", "null").body).toEqual({ revenue: null });
  });
  it("refusals carry the field name for bare reasons", () => {
    const r = prepareUpdate(META, "industrycode", "Technology");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('"industrycode"');
  });
  it("no metadata → legacy heuristic (raw mode on another table)", () => {
    expect(prepareUpdate({}, "whatever", "true").body).toEqual({ whatever: true });
    expect(prepareUpdate({}, "whatever", "42").body).toEqual({ whatever: 42 });
    expect(prepareUpdate({}, "whatever", "texte").body).toEqual({ whatever: "texte" });
  });
});

describe("prepareUpdate — lookups (the user-hit class)", () => {
  it("text into a lookup is refused with the Data Loader pointer — nothing to send", () => {
    const r = prepareUpdate(META, "parentaccountid", "ACME France");
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/GUID/);
    expect(r.reason).toMatch(/Data Loader/);
  });
  it("a GUID builds nav@odata.bind toward the target set (never the _value column)", () => {
    const r = prepareUpdate(META, "parentaccountid", G);
    expect(r).toEqual({ ok: true, body: { "parentaccountid@odata.bind": `/accounts(${G})` }, localValue: G });
  });
  it("empty clears via {nav: null}", () => {
    expect(prepareUpdate(META, "parentaccountid", "").body).toEqual({ parentaccountid: null });
  });
  it("polymorphic lookup needs a target; resolves once given", () => {
    const r1 = prepareUpdate(META, "customerid", G);
    expect(r1.ok).toBe(false);
    expect(r1.needsTarget).toBe(true);
    expect(r1.reason).toMatch(/account or contact/);
    const r2 = prepareUpdate(META, "customerid", G, "contact");
    expect(r2.body).toEqual({ "customerid_contact@odata.bind": `/contacts(${G})` });
  });
  it("missing relationship metadata or unresolvable set → readable refusal, no blind write", () => {
    expect(prepareUpdate(META, "brokenlookup", G).ok).toBe(false);
    const r = prepareUpdate(META, "nosetlookup", G);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/entity set/);
  });
});
