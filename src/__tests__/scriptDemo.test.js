import { describe, it, expect } from "vitest";
import { scriptDemoOrg } from "../scriptDemo.js";
import { createRuntime, runRollback } from "../scriptRuntime.js";
import { SCRIPT_TEMPLATES } from "../scriptTemplates.js";

const noSleep = async () => {};
const opts = { delayMs: 0 };

describe("Script Console demo org", () => {
  it("the lookup-propagation template: dry run plans, live run writes, rollback restores", async () => {
    const org = scriptDemoOrg(opts);
    const before = new Map([...org.tables.systemusers].map(([k, v]) => [k, v._new_salescodeid_value]));
    const tpl = SCRIPT_TEMPLATES.find(t => t.id === "propagate-lookup");
    const run = async (mode) => {
      const rt = createRuntime({ send: org.send, orgUrl: "https://demo.crm4.dynamics.com", mode, sleep: noSleep });
      const logs = [];
      const dv = Object.fromEntries(rt.methods.map(m => [m, (...a) => rt.invoke(m, a)]));
      dv.dryRun = mode === "dry";
      const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
      await new AsyncFunction("dv", "log", "table", "progress", "sleep", "input", "console", tpl.code)(dv, (...a) => logs.push(a.join(" ")), () => {}, () => {}, noSleep, [], { log: () => {} });
      return { rt, logs };
    };
    const dry = await run("dry");
    expect(dry.rt.plan.length).toBeGreaterThan(0);
    expect(dry.rt.plan.every(p => p.method === "PATCH" && p.table === "systemusers")).toBe(true);
    expect([...org.tables.systemusers].every(([k, v]) => v._new_salescodeid_value === before.get(k))).toBe(true);

    const live = await run("live");
    expect(live.rt.entries).toHaveLength(dry.rt.plan.length);
    for (const u of org.tables.systemusers.values()) {
      if (!u._new_salesorganizationid_value) continue;
      const code = [...org.tables.new_salescodes.values()].find(c => c._new_salesorganizationid_value === u._new_salesorganizationid_value);
      expect(u._new_salescodeid_value).toBe(code.new_salescodeid);
    }
    const r = await runRollback(live.rt.entries, { send: org.send, sleep: noSleep });
    expect(r.failed).toEqual([]);
    expect([...org.tables.systemusers].every(([k, v]) => v._new_salescodeid_value === before.get(k))).toBe(true);
  });

  it("every template runs in dry run against the demo org without throwing", async () => {
    for (const tpl of SCRIPT_TEMPLATES) {
      const org = scriptDemoOrg(opts);
      const rt = createRuntime({ send: org.send, orgUrl: "https://demo.crm4.dynamics.com", mode: "dry", sleep: noSleep });
      const dv = Object.fromEntries(rt.methods.map(m => [m, (...a) => rt.invoke(m, a)]));
      dv.dryRun = true; dv.withHeaders = () => dv;
      const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
      const input = tpl.sampleInput || [];
      let error = null;
      try { await new AsyncFunction("dv", "log", "table", "progress", "sleep", "input", "console", tpl.code)(dv, () => {}, () => {}, () => {}, noSleep, input, { log: () => {} }); }
      catch (e) { error = `${tpl.id}: ${e.message}`; }
      expect(error).toBe(null);
      expect(org.log.filter(l => !l.startsWith("GET")), tpl.id).toEqual([]);
      expect(rt.plan.length, tpl.id).toBeGreaterThanOrEqual(tpl.id === "explore" ? 0 : 1);
    }
  });

  it("$batch changesets are all-or-nothing in the demo too", async () => {
    const org = scriptDemoOrg(opts);
    const rt = createRuntime({ send: org.send, orgUrl: "https://demo.crm4.dynamics.com", sleep: noSleep });
    const acc = [...org.tables.accounts.keys()];
    await expect(rt.invoke("batch", [[
      { method: "PATCH", path: `accounts(${acc[0]})`, body: { telephone1: "1" }, headers: { "If-Match": "*" } },
      { method: "PATCH", path: "accounts(d0000000-0000-4000-8000-999999999999)", body: { telephone1: "2" }, headers: { "If-Match": "*" } },
    ]])).rejects.toThrow(/#1/);
    expect(org.tables.accounts.get(acc[0]).telephone1).toBe(null);
  });
});
