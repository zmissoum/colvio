import { describe, it, expect } from "vitest";
import { layoutBuTree, visibleBuList, extractEmails, matchUsersByEmails } from "../buTreeUtils.js";

const OPTS = { nodeW: 100, nodeH: 50, hGap: 10, vGap: 40 };

describe("visibleBuList", () => {
  const BUS = [
    { id: "root", name: "Root", parentId: null },
    { id: "eu", name: "EU", parentId: "root" },
    { id: "fr", name: "FR", parentId: "eu" },
    { id: "us", name: "US", parentId: "root" },
  ];
  it("nothing expanded → roots only; expanding reveals one level at a time", () => {
    expect(visibleBuList(BUS, new Set()).list.map(b => b.id)).toEqual(["root"]);
    expect(visibleBuList(BUS, new Set(["root"])).list.map(b => b.id).sort()).toEqual(["eu", "root", "us"]);
    expect(visibleBuList(BUS, new Set(["root", "eu"])).list.map(b => b.id).sort()).toEqual(["eu", "fr", "root", "us"]);
  });
  it("childCount comes from the FULL hierarchy (collapsed nodes badge what they hide)", () => {
    const { childCount } = visibleBuList(BUS, new Set());
    expect(childCount.get("root")).toBe(2);
    expect(childCount.get("eu")).toBe(1);
    expect(childCount.has("fr")).toBe(false);
  });
  it("expanding a hidden node has no effect until its ancestors are expanded", () => {
    expect(visibleBuList(BUS, new Set(["eu"])).list.map(b => b.id)).toEqual(["root"]);
  });
});

describe("layoutBuTree", () => {
  it("centers a parent over its two children; children don't overlap", () => {
    const r = layoutBuTree([
      { id: "root", name: "Root", parentId: null },
      { id: "a", name: "A", parentId: "root" },
      { id: "b", name: "B", parentId: "root" },
    ], OPTS);
    const [root, a, b] = ["root", "a", "b"].map(id => r.nodes.find(n => n.id === id));
    expect(a.y).toBe(90); expect(b.y).toBe(90); expect(root.y).toBe(0);
    expect(b.x - a.x).toBe(110);                       // nodeW + hGap — no overlap
    expect(root.x).toBe((a.x + b.x) / 2);              // centered over the pair
    expect(r.edges).toHaveLength(2);
    expect(r.width).toBe(210);
  });
  it("treats orphans (parent not visible) as roots, side by side", () => {
    const r = layoutBuTree([
      { id: "x", name: "X", parentId: "ghost" },
      { id: "y", name: "Y", parentId: null },
    ], OPTS);
    expect(r.nodes.every(n => n.depth === 0)).toBe(true);
    expect(r.nodes).toHaveLength(2);
    expect(r.edges).toHaveLength(0);
  });
  it("survives a cyclic hierarchy without looping", () => {
    const r = layoutBuTree([{ id: "a", name: "A", parentId: "b" }, { id: "b", name: "B", parentId: "a" }], OPTS);
    expect(r.nodes.length).toBeGreaterThan(0); // partial layout, no hang
  });
  it("deep chain stacks vertically with one slot width", () => {
    const r = layoutBuTree([
      { id: "1", name: "1", parentId: null },
      { id: "2", name: "2", parentId: "1" },
      { id: "3", name: "3", parentId: "2" },
    ], OPTS);
    expect(r.width).toBe(100);
    expect(r.height).toBe(3 * 90 - 40);
    expect(new Set(r.nodes.map(n => n.x)).size).toBe(1); // all centered in the same column
  });
});

describe("extractEmails", () => {
  it("splits on newlines, commas, semicolons and spaces", () => {
    expect(extractEmails("a@x.com\nb@x.com,c@x.com; d@x.com e@x.com"))
      .toEqual(["a@x.com", "b@x.com", "c@x.com", "d@x.com", "e@x.com"]);
  });
  it("handles Outlook's 'Name <email>' format", () => {
    expect(extractEmails('Jane Doe <jane@x.com>; "Smith, John" <john@x.com>'))
      .toEqual(["jane@x.com", "john@x.com"]);
  });
  it("lowercases, dedupes, and strips trailing dots", () => {
    expect(extractEmails("USER@X.COM\nuser@x.com.")).toEqual(["user@x.com"]);
  });
  it("ignores text with no address in it", () => {
    expect(extractEmails("hello world\nno emails here")).toEqual([]);
    expect(extractEmails("")).toEqual([]);
  });
});

describe("matchUsersByEmails", () => {
  const USERS = [
    { id: "u1", email: "jane@x.com", upn: "jane.upn@x.com" },
    { id: "u2", email: "John@X.com", upn: "" },
    { id: "u3", email: "", upn: null },              // provisioned rows can miss both — must not match ""
  ];
  it("matches by email or UPN, case-insensitive", () => {
    const r = matchUsersByEmails(USERS, ["jane.upn@x.com", "john@x.com"]);
    expect(r.matchedIds).toEqual(["u1", "u2"]);
    expect(r.missing).toEqual([]);
  });
  it("unmatched tokens come back verbatim", () => {
    const r = matchUsersByEmails(USERS, ["ghost@x.com", "jane@x.com"]);
    expect(r.matchedIds).toEqual(["u1"]);
    expect(r.missing).toEqual(["ghost@x.com"]);
  });
  it("duplicate tokens and email/UPN aliases of one user count once, never as missing", () => {
    const r = matchUsersByEmails(USERS, ["jane@x.com", "jane@x.com", "jane.upn@x.com"]);
    expect(r.matchedIds).toEqual(["u1"]);
    expect(r.missing).toEqual([]);
  });
  it("empty inputs are safe", () => {
    expect(matchUsersByEmails([], ["a@x.com"]).missing).toEqual(["a@x.com"]);
    expect(matchUsersByEmails(USERS, [])).toEqual({ matchedIds: [], missing: [] });
  });
});
