import { describe, it, expect } from "vitest";
import { readPairs, valuesToResolve, buildAssociationItems, summarizeAssociation, isGuid } from "../associationUtils.js";

const G1 = "11111111-1111-1111-1111-111111111111", G2 = "22222222-2222-2222-2222-222222222222", G3 = "33333333-3333-3333-3333-333333333333";

describe("association mode (N:N tables)", () => {
  it("readPairs keeps the rows with both ends and reports the blanks", () => {
    const rows = [{ user: "a@x.com", team: "Sales" }, { user: "", team: "Sales" }, { user: "b@x.com", team: " " }, { user: G1, team: G2 }];
    const r = readPairs(rows, "user", "team");
    expect(r.pairs).toEqual([{ row: 0, v1: "a@x.com", v2: "Sales" }, { row: 3, v1: G1, v2: G2 }]);
    expect(r.blank).toEqual([{ row: 1, missing: "user" }, { row: 2, missing: "team" }]);
  });
  it("valuesToResolve: only non-GUID values of an end matched by a column, deduplicated", () => {
    const { pairs } = readPairs([{ u: "a@x.com", t: "Sales" }, { u: "a@x.com", t: G2 }, { u: G1, t: "Ops" }], "u", "t");
    expect(valuesToResolve(pairs, 1, true)).toEqual(["a@x.com"]);
    expect(valuesToResolve(pairs, 2, true)).toEqual(["Sales", "Ops"]);
    expect(valuesToResolve(pairs, 1, false)).toEqual([]);
  });
  it("buildAssociationItems resolves, refuses unresolved / ambiguous, sends a duplicate pair once", () => {
    const { pairs } = readPairs([
      { u: "a@x.com", t: "Sales" }, { u: "A@X.COM", t: "sales" }, { u: "nobody@x.com", t: "Sales" }, { u: "dup@x.com", t: "Sales" }, { u: `{${G1.toUpperCase()}}`, t: G2 },
    ], "u", "t");
    const r1 = new Map([["a@x.com", G1], ["dup@x.com", { ambiguous: 2 }]]);
    const r2 = new Map([["sales", G2]]);
    const r = buildAssociationItems(pairs, r1, r2);
    expect(r.items).toEqual([{ row: 0, id1: G1, id2: G2 }]); // row 1 = same pair, row 4 = same GUIDs
    expect(r.problems.map(p => p.row)).toEqual([1, 2, 3, 4]);
    expect(r.problems[0].duplicate).toBe(true);
    expect(r.problems[1].msg).toMatch(/not found/);
    expect(r.problems[2].msg).toMatch(/ambiguous/);
    expect(r.problems[3].duplicate).toBe(true);
    expect(isGuid(G3)).toBe(true);
    expect(isGuid("SAP-1")).toBe(false);
  });
  it("summarizeAssociation counts done / already / errors", () => {
    expect(summarizeAssociation([{ status: "ASSOCIATED" }, { status: "ASSOCIATED", note: "already associated", already: true }, { status: "ERROR", msg: "x" }])).toEqual({ done: 1, already: 1, errors: 1 });
  });
});
