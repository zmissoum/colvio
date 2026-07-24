import { describe, it, expect } from "vitest";
import { buildReportModel } from "../adoptionPptx.js";

const NOW = Date.parse("2026-07-24T12:00:00Z");
const AGG = {
  total: 1234, unique: 42, scopeCount: 60,
  engagement: { dauAvg: 18.4, wau: 35, mau: 42, stickiness: 0.438 },
  never: [{ calTypeLabel: "Enterprise" }, { calTypeLabel: "Enterprise" }, { calTypeLabel: "Basic" }],
  series: [{ label: "2026-07-20", logins: 100, users: 20 }, { label: "2026-07-21", logins: 50, users: 10 }],
  weekly: false,
  weekday: [{ label: "Mon", events: 5 }],
  buRows: Array.from({ length: 20 }, (_, i) => ({ bu: `BU${i}`, enrolled: 10, active: 5, rate: 0.5 })),
  scopeRows: [
    { last: "2026-07-23T10:00:00Z" },              // 1 day ago — active
    { last: "2026-05-01T10:00:00Z" },              // ~84 days — inactive ≥30/60
    { last: "" },                                   // never in window → counts for every threshold
  ],
  svcRows: [{ logins: 0 }, { logins: 12 }],
};
const WIN = { from: "2026-05-25T00:00:00Z", to: "2026-07-24T00:00:00Z", days: 60 };

describe("buildReportModel", () => {
  const m = buildReportModel({ orgName: "contoso", windowRange: WIN, roleFilter: "", buLabel: "", interval: 4, agg: AGG, failedDays: 1, nowMs: NOW });
  it("KPIs carry the honesty hint and engagement metrics", () => {
    expect(m.kpis.find(k => k.label === "Access events").hint).toContain("4 h");
    expect(m.kpis.map(k => k.label)).toContain("Stickiness (DAU÷MAU)");
    expect(m.honesty).toContain("1 day(s) failed");
  });
  it("never-signed-in is split by license, sorted desc", () => {
    expect(m.findings.neverByLicense[0]).toEqual(["Enterprise", 2]);
    expect(m.findings.neverCount).toBe(3);
  });
  it("inactivity thresholds are gated by window length (60-day window → no ≥90 line)", () => {
    expect(m.findings.inact.map(i => i.th)).toEqual([30, 60]);
    const i30 = m.findings.inact.find(i => i.th === 30);
    expect(i30.n).toBe(2); // the 84-day user + the never-in-window user
  });
  it("BU chart caps at 15 with the remainder counted; silent service accounts counted", () => {
    expect(m.bu.labels).toHaveLength(15);
    expect(m.bu.capped).toBe(5);
    expect(m.findings.svcSilent).toBe(1);
  });
});
