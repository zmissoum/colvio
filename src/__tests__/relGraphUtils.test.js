import { describe, it, expect } from "vitest";
import { isSystemParent, isSystemChild, splitRels, groupParents } from "../relGraphUtils.js";

describe("relationship classification (missing-relations fix)", () => {
  it("USER-HIT: business lookups classify as business, plumbing as system", () => {
    expect(isSystemParent({ lookupField: "fou_cardaccountid" })).toBe(false);
    expect(isSystemParent({ lookupField: "createdby" })).toBe(true);
    expect(isSystemParent({ lookupField: "OWNERID" })).toBe(true); // case-insensitive
    expect(isSystemParent({ lookupField: "transactioncurrencyid" })).toBe(true);
  });
  it("child plumbing tables (async jobs, sync errors) classify as system; real children do not", () => {
    expect(isSystemChild({ targetEntity: "asyncoperation" })).toBe(true);
    expect(isSystemChild({ targetEntity: "fou_paymentincident" })).toBe(false);
    expect(isSystemChild({ targetEntity: "annotation" })).toBe(false); // notes are business-relevant
    expect(isSystemChild({ targetEntity: "contact" })).toBe(false);
  });
  it("splitRels: business FIRST and alphabetized — metadata order buried them past the render cap", () => {
    const { business, system } = splitRels([
      { lookupField: "createdby", targetEntity: "systemuser" },
      { lookupField: "fou_cardaccountid", targetEntity: "fou_cardaccount" },
      { lookupField: "ownerid", targetEntity: "principal" },
      { lookupField: "fou_bankid", targetEntity: "fou_bank" },
    ], isSystemParent);
    expect(business.map(r => r.targetEntity)).toEqual(["fou_bank", "fou_cardaccount"]);
    expect(system.length).toBe(2);
  });
  it("handles empty/missing input", () => {
    expect(splitRels(null, isSystemParent)).toEqual({ business: [], system: [] });
  });
});

describe("groupParents", () => {
  it("keeps a business lookup to systemuser visible next to the system group that also targets systemuser", () => {
    const g = groupParents([
      { lookupField: "createdby", targetEntity: "systemuser" },
      { lookupField: "modifiedby", targetEntity: "systemuser" },
      { lookupField: "preferredsystemuserid", targetEntity: "systemuser" },
      { lookupField: "primarycontactid", targetEntity: "contact" },
    ]);
    const sys = g.filter(isSystemParent), biz = g.filter(r => !isSystemParent(r));
    expect(sys).toHaveLength(1);
    expect(sys[0]).toMatchObject({ targetEntity: "systemuser", count: 2 });
    expect(biz.map(r => `${r.targetEntity}:${r.lookupField}:${r.count}`).sort()).toEqual(["contact:primarycontactid:1", "systemuser:preferredsystemuserid:1"]);
  });
});
