import { describe, it, expect } from "vitest";
import { isSystemParent, isSystemChild, splitRels, groupParents, nodesPerRow, wrapRow } from "../relGraphUtils.js";

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

describe("map layout", () => {
  const geo = { nodeW: 150, nodeH: 56, gap: 18, rowGap: 24 };
  it("fits as many nodes per row as the pane holds, never fewer than one", () => {
    expect(nodesPerRow(780, 150, 18)).toBe(4);
    expect(nodesPerRow(1044, 150, 18)).toBe(6);
    expect(nodesPerRow(120, 150, 18)).toBe(1);
  });
  it("wraps into centred rows and reports the band height", () => {
    const { pos, height } = wrapRow(6, { ...geo, perRow: 4, cx: 400, top: 100 });
    expect(pos.slice(0, 4).map(p => p.y)).toEqual([100, 100, 100, 100]);
    expect(pos.slice(4).map(p => p.y)).toEqual([180, 180]);
    expect(pos[0].x).toBe(400 - 1.5 * 168);        // 4 nodes centred on 400
    expect(pos[4].x + pos[5].x).toBe(800);         // the 2-node row is centred too
    expect(height).toBe(2 * 56 + 24);
  });
  it("keeps one row's height for an empty band", () => {
    expect(wrapRow(0, { ...geo, perRow: 4, cx: 0, top: 0 })).toEqual({ pos: [], height: 56 });
  });
});
