import { describe, it, expect } from "vitest";
import { demoIsProduction, DEMO_PRODUCTION_KEY } from "../demoProduction.js";
import { demoHealthApi } from "../healthCheckDemo.js";
import { runChecks, tally } from "../healthCheck.js";

const store = (v) => ({ getItem: (k) => (k === DEMO_PRODUCTION_KEY ? v : null) });

describe("demo production flag — opt-in, demo only", () => {
  it("the default demo org is not production", () => {
    expect(demoIsProduction(false, store(null))).toBe(false);
    expect(demoIsProduction(false, null)).toBe(false);
    expect(demoIsProduction(false, store("true"))).toBe(false); // only "1" opts in
  });
  it("the flag makes the demo org production", () => {
    expect(DEMO_PRODUCTION_KEY).toBe("colvio_demo_production");
    expect(demoIsProduction(false, store("1"))).toBe(true);
  });
  it("never inside the extension, flag or not", () => {
    expect(demoIsProduction(true, store("1"))).toBe(false);
  });
  it("unreadable storage = not production", () => {
    expect(demoIsProduction(false, { getItem() { throw new Error("SecurityError"); } })).toBe(false);
  });
});

describe("health check on the demo org presented as production", () => {
  it("flags the unmanaged solutions, and the trace log becomes a warning", async () => {
    const res = await runChecks(demoHealthApi({ isProd: true }));
    expect(res["unmanaged-in-prod"]).toMatchObject({ level: "warn", rows: [["Colvio Demo Solution", "ColvioDemo", "1.0.0.0"], ["Contoso Sales", "ContosoSales", "1.2.0.0"]] });
    expect(res["unmanaged-in-prod"].summary).toMatch(/^2 unmanaged solutions in production/);
    expect(res["trace-log"].level).toBe("warn");
    expect(tally(res)).toMatchObject({ warn: 9, info: 2, ok: 1, skip: 0, failed: 0 });
  });
  it("by default the check doesn't apply", async () => {
    expect((await runChecks(demoHealthApi()))["unmanaged-in-prod"].level).toBe("skip");
  });
});
