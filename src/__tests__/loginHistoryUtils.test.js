import { describe, it, expect } from "vitest";
import { ACCESS_CHANNELS, normalizeAccessEvent, sortNewestFirst, accessStats } from "../loginHistoryUtils.js";

const ev = (date, actionCode, extra = {}) => normalizeAccessEvent({ date, actionCode, ...extra });

describe("normalizeAccessEvent", () => {
  it("maps 64 to the app channel and 65 to web services — 65 is NOT a logout", () => {
    expect(ev("2026-10-01T08:00:00Z", 64)).toMatchObject({ channel: "app", label: "App (web)" });
    expect(ev("2026-10-01T08:00:00Z", 65)).toMatchObject({ channel: "api", label: "Web services" });
    expect(Object.values(ACCESS_CHANNELS).map(c => c.label).join(" ")).not.toMatch(/log ?out/i);
  });
  it("keeps the record's own fields", () => {
    expect(ev("2026-10-01T08:00:00Z", 64, { info: "x", operation: "Access" })).toMatchObject({ info: "x", operation: "Access" });
  });
  it("falls back to the server's formatted label, then to the raw code, for unknown actions", () => {
    expect(ev("2026-10-01T08:00:00Z", 112, { accessType: "User Access Audit Started" })).toMatchObject({ channel: "other", label: "User Access Audit Started" });
    expect(ev("2026-10-01T08:00:00Z", 113).label).toBe("Action 113");
  });
});

describe("sortNewestFirst", () => {
  it("orders by date descending without mutating the input", () => {
    const input = [ev("2026-10-01T08:00:00Z", 64), ev("2026-10-03T08:00:00Z", 64), ev("2026-10-02T08:00:00Z", 65)];
    const out = sortNewestFirst(input);
    expect(out.map(e => e.date.slice(0, 10))).toEqual(["2026-10-03", "2026-10-02", "2026-10-01"]);
    expect(input[0].date.slice(0, 10)).toBe("2026-10-01");
  });
});

describe("accessStats", () => {
  it("is null without events", () => {
    expect(accessStats([])).toBeNull();
    expect(accessStats(null)).toBeNull();
  });
  it("counts per channel and takes first/last from the dates, whatever the input order", () => {
    const s = accessStats([
      ev("2026-10-02T09:00:00", 65),
      ev("2026-10-03T09:00:00", 64),
      ev("2026-10-01T09:00:00", 64),
      ev("2026-10-03T15:00:00", 64),
    ]);
    expect(s).toMatchObject({ total: 4, app: 3, api: 1, other: 0, uniqueDays: 3 });
    expect(s.last.toISOString()).toBe(new Date("2026-10-03T15:00:00").toISOString());
    expect(s.first.toISOString()).toBe(new Date("2026-10-01T09:00:00").toISOString());
  });
});
