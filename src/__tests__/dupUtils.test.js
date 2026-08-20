import { describe, it, expect } from "vitest";
import { normalizeKeyPart, findDuplicateGroups } from "../dupUtils.js";

const get = (r, f) => r[f];

describe("normalizeKeyPart", () => {
  it("empties, booleans, numbers, objects", () => {
    expect(normalizeKeyPart(null)).toBe("");
    expect(normalizeKeyPart(undefined)).toBe("");
    expect(normalizeKeyPart(true)).toBe("true");
    expect(normalizeKeyPart(1380.08)).toBe("1380.08");
    expect(normalizeKeyPart({ a: 1 })).toBe('{"a":1}');
  });
  it("strings are trimmed and case-folded", () => {
    expect(normalizeKeyPart("  02 ELEC ")).toBe("02 elec");
    expect(normalizeKeyPart("02 elec")).toBe("02 elec");
  });
  it("dayDates truncates ISO datetimes to the day — plain strings untouched", () => {
    expect(normalizeKeyPart("2026-07-16T09:12:00Z", { dayDates: true })).toBe("2026-07-16");
    expect(normalizeKeyPart("2026-07-16T23:59:00Z", { dayDates: true })).toBe("2026-07-16");
    expect(normalizeKeyPart("2026-07-16T09:12:00Z", {})).toBe("2026-07-16t09:12:00z");
    expect(normalizeKeyPart("not a date", { dayDates: true })).toBe("not a date");
  });
});

describe("findDuplicateGroups", () => {
  // The user's real case: same date + same card (GUID) + same amount = duplicate.
  const ROWS = [
    { id: "a", date: "2026-07-16T00:00:00Z", card: "guid-1", amount: 1380.08 },
    { id: "b", date: "2026-07-16T10:30:00Z", card: "guid-1", amount: 1380.08 },
    { id: "c", date: "2026-07-16T00:00:00Z", card: "guid-2", amount: 1380.08 }, // other card — not a dupe
    { id: "d", date: "2026-07-17T00:00:00Z", card: "guid-1", amount: 1380.08 }, // other day — not a dupe
  ];
  it("groups on the composite key; day truncation merges same-day different-time", () => {
    const r = findDuplicateGroups(ROWS, ["date", "card", "amount"], get, { dayDates: true });
    expect(r.groups).toHaveLength(1);
    expect(r.groups[0].rows.map(x => x.id)).toEqual(["a", "b"]);
    expect(r.excess).toBe(1);
    expect(r.analyzed).toBe(4);
  });
  it("without day truncation the same rows are NOT duplicates", () => {
    const r = findDuplicateGroups(ROWS, ["date", "card", "amount"], get, {});
    expect(r.groups).toHaveLength(0);
    expect(r.excess).toBe(0);
  });
  it("rows whose every key part is empty are skipped, partial-empty keys still group", () => {
    const rows = [
      { id: "x", a: null, b: "" }, { id: "y", a: null, b: "" },        // all-empty → skipped, no group
      { id: "p", a: "k", b: null }, { id: "q", a: "K ", b: null },     // partial-empty → real group
    ];
    const r = findDuplicateGroups(rows, ["a", "b"], get, {});
    expect(r.blankSkipped).toBe(2);
    expect(r.groups).toHaveLength(1);
    expect(r.groups[0].rows.map(x => x.id)).toEqual(["p", "q"]);
  });
  it("separator can't collide: ('a|b','') never equals ('a','b|')", () => {
    const rows = [{ id: "1", a: "a|b", b: "" }, { id: "2", a: "a", b: "b|" }];
    expect(findDuplicateGroups(rows, ["a", "b"], get, {}).groups).toHaveLength(0);
  });
  it("groups come biggest-first", () => {
    const rows = [
      { id: "1", k: "small" }, { id: "2", k: "small" },
      { id: "3", k: "big" }, { id: "4", k: "big" }, { id: "5", k: "big" },
    ];
    const r = findDuplicateGroups(rows, ["k"], get, {});
    expect(r.groups.map(g => g.rows.length)).toEqual([3, 2]);
    expect(r.excess).toBe(3);
  });
});
