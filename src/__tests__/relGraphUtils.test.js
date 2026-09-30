import { describe, it, expect } from "vitest";
import { isSystemParent, isSystemChild, splitRels } from "../relGraphUtils.js";

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
