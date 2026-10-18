import { describe, it, expect } from "vitest";
import { nextWindow, adaptWindow, mergeFound, remaining, finalize, scanLabel, HOUR, DAY, MIN_WINDOW, MAX_WINDOW, START_WINDOW } from "../lastLoginScan.js";
import { accessRightFromName, matrixFor, matricesFromGrants, catalogIndex } from "../privilegeMatrix.js";

describe("last-login scan planning", () => {
  const now = Date.parse("2026-10-18T12:00:00Z");
  it("walks backwards in windows that never cross the floor", () => {
    const w = nextWindow(now, now - 30 * DAY, START_WINDOW);
    expect(w).toMatchObject({ fromMs: now - 7 * DAY, toMs: now });
    expect(nextWindow(now - 29 * DAY, now - 30 * DAY, START_WINDOW).fromMs).toBe(now - 30 * DAY);
    expect(nextWindow(now - 30 * DAY, now - 30 * DAY, START_WINDOW)).toBeNull();
    expect(nextWindow(now, now - DAY, 1000).fromMs).toBe(now - MIN_WINDOW); // never below an hour
  });
  it("grows quiet windows and shrinks split ones", () => {
    expect(adaptWindow(7 * DAY, 1)).toBe(14 * DAY);
    expect(adaptWindow(MAX_WINDOW, 1)).toBe(MAX_WINDOW);
    expect(adaptWindow(7 * DAY, 2)).toBe(7 * DAY);
    expect(adaptWindow(7 * DAY, 3)).toBe(Math.floor(3.5 * DAY));
    expect(adaptWindow(7 * DAY, 9)).toBe(Math.floor(1.75 * DAY));
    expect(adaptWindow(HOUR, 9)).toBe(MIN_WINDOW);
  });
  it("keeps each user's latest date and tells who is still missing", () => {
    const found = mergeFound(new Map(), { U1: "2026-10-10T00:00:00Z", u2: "2026-10-01T00:00:00Z" });
    mergeFound(found, { u1: "2026-09-01T00:00:00Z", u3: "2026-09-02T00:00:00Z" });
    expect(found.get("u1")).toBe("2026-10-10T00:00:00Z");
    expect(remaining(["u1", "U2", "u3", "u4"], found)).toEqual(["u4"]);
  });
  it("says never only when the audit's first row was reached", () => {
    const found = new Map([["u1", "2026-10-10T00:00:00Z"]]);
    expect(finalize(["u1", "u2"], found, { reachedFloor: true, floorKnown: true }).get("u2")).toEqual({ date: null });
    expect(finalize(["u2"], found, { reachedFloor: false, scannedToMs: now }).get("u2")).toEqual({ date: null, since: "2026-10-18T12:00:00.000Z" });
    expect(finalize(["u2"], found, { reachedFloor: true, floorKnown: false, scannedToMs: now }).get("u2")).toMatchObject({ date: null, since: "2026-10-18T12:00:00.000Z" });
    expect(finalize(["u1"], found, {}).get("u1")).toEqual({ date: "2026-10-10T00:00:00Z" });
  });
  it("labels progress", () => {
    expect(scanLabel({ cursorMs: now, found: 3, total: 10, requests: 2 })).toMatch(/^last logins — 3\/10 found, scanned back to .* \(2 requests\)$/);
  });
});

describe("privilege matrices from one grants read", () => {
  const CAT = catalogIndex([
    { id: "P1", name: "prvReadAccount", accessRight: 1 }, { id: "p2", name: "prvWriteAccount", accessRight: 2 },
    { id: "p3", name: "prvDeleteAccount", accessRight: 65536 }, { id: "p4", name: "prvAppendToAccount", accessRight: 16 },
    { id: "p5", name: "prvReadContact", accessRight: 1 }, { id: "p6", name: "prvExportToExcel", accessRight: 0 }, { id: "p7", name: "prvBulkDelete" },
  ]);
  it("derives the operation from the name when the catalog has none", () => {
    expect(["prvReadAccount", "prvAppendToAccount", "prvAppendAccount", "prvExportToExcel", "prvDelete", "x"].map(accessRightFromName)).toEqual([1, 16, 4, 0, 0, 0]);
    expect(CAT.p7.accessRight).toBe(0);
  });
  it("builds one role's grid, with what is NOT granted", () => {
    const m = matrixFor(new Map([["p1", 8], ["p2", 2], ["p6", 8]]), CAT);
    expect(m.entities).toEqual([
      { entity: "Account", ops: { Read: 8, Write: 2, Delete: 0, AppendTo: 0 } },
      { entity: "Contact", ops: { Read: 0 } },
    ]);
    expect(m.misc.map(x => [x.name, x.depth])).toEqual([["prvBulkDelete", 0], ["prvExportToExcel", 8]]);
  });
  it("builds every role from the grants rows — widest copy wins, empty roles kept", () => {
    const by = matricesFromGrants([
      { roleId: "R1", privilegeId: "P1", mask: 8 }, { roleId: "r1", privilegeId: "p1", mask: 2 }, { roleId: "r1", privilegeId: "p3", mask: 1 },
      { roleId: "r2", privilegeId: "p5", mask: 4 }, { roleId: "", privilegeId: "p5", mask: 4 },
    ], CAT, ["r1", "r2", "r3"]);
    expect(by.get("r1").entities.find(e => e.entity === "Account").ops).toEqual({ Read: 8, Write: 0, Delete: 1, AppendTo: 0 });
    expect(by.get("r2").entities.find(e => e.entity === "Contact").ops).toEqual({ Read: 4 });
    expect(by.get("r3").entities.every(e => Object.values(e.ops).every(v => v === 0))).toBe(true);
    expect(by.has("")).toBe(false);
  });
});
