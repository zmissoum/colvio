import { describe, it, expect } from "vitest";
import { isServiceAccount, computeEngagement, weekdayTotals, inactivityDays, buAdoption } from "../adoptionUtils.js";

describe("isServiceAccount", () => {
  it("flags Support / Non-Interactive / Delegated Admin and S2S app users", () => {
    expect(isServiceAccount({ accessMode: 4 })).toBe(true);
    expect(isServiceAccount({ accessMode: 3 })).toBe(true);
    expect(isServiceAccount({ accessMode: 5 })).toBe(true);
    expect(isServiceAccount({ accessMode: 0, isApp: true })).toBe(true);
  });
  it("keeps humans — Read-Write, Admin, Read", () => {
    expect(isServiceAccount({ accessMode: 0 })).toBe(false);
    expect(isServiceAccount({ accessMode: 1 })).toBe(false);
    expect(isServiceAccount({ accessMode: 2 })).toBe(false);
    expect(isServiceAccount(null)).toBe(false);
  });
});

describe("computeEngagement", () => {
  // 30-day window ending 2026-07-30
  const FROM = "2026-07-01T00:00:00Z", TO = "2026-07-31T00:00:00Z";
  it("computes avg DAU over ALL window days (quiet days count as zero)", () => {
    // one user active 15 days, another 15 different days → sum of daily distinct = 30 → /30 = 1
    const a = new Set(), b = new Set();
    for (let d = 1; d <= 15; d++) a.add(`2026-07-${String(d).padStart(2, "0")}`);
    for (let d = 16; d <= 30; d++) b.add(`2026-07-${String(d).padStart(2, "0")}`);
    const e = computeEngagement([a, b], FROM, TO);
    expect(e.dauAvg).toBeCloseTo(1, 5);
    expect(e.mau).toBe(2);                 // both active in the last 30 days
    expect(e.wau).toBe(1);                 // only b active in the last 7 days
    expect(e.stickiness).toBeCloseTo(0.5, 5);
  });
  it("wau/mau are null (not misleading zeros) on windows shorter than 7/30 days", () => {
    const e = computeEngagement([new Set(["2026-07-29"])], "2026-07-28T00:00:00Z", "2026-07-31T00:00:00Z");
    expect(e.wau).toBeNull();
    expect(e.mau).toBeNull();
    expect(e.stickiness).toBeNull();
  });
});

describe("weekdayTotals", () => {
  it("sums events per weekday, Monday-first", () => {
    // 2026-07-20 is a Monday, 2026-07-26 a Sunday
    const t = weekdayTotals([{ "2026-07-20": 3, "2026-07-26": 1 }, { "2026-07-20": 2 }]);
    expect(t[0]).toEqual({ label: "Mon", events: 5 });
    expect(t[6]).toEqual({ label: "Sun", events: 1 });
    expect(t[2].events).toBe(0);
  });
});

describe("inactivityDays", () => {
  const NOW = Date.parse("2026-07-22T12:00:00Z");
  it("whole days since last access; null when no access is known", () => {
    expect(inactivityDays("2026-07-22T09:00:00Z", NOW)).toBe(0);
    expect(inactivityDays("2026-06-22T12:00:00Z", NOW)).toBe(30);
    expect(inactivityDays("", NOW)).toBeNull();
    expect(inactivityDays(null, NOW)).toBeNull();
  });
});

describe("buAdoption", () => {
  it("computes enrolled/active/rate per BU, sorted by enrolled desc", () => {
    const rows = buAdoption([
      { buName: "FR", active: true }, { buName: "FR", active: false }, { buName: "FR", active: true },
      { buName: "UK", active: false },
      { buName: "", active: true },
    ]);
    expect(rows[0]).toEqual({ bu: "FR", enrolled: 3, active: 2, rate: 2 / 3 });
    expect(rows.map(r => r.bu)).toEqual(["FR", "(no BU)", "UK"]);
    expect(rows.find(r => r.bu === "UK").rate).toBe(0);
  });
});
