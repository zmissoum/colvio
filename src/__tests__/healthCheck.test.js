import { describe, it, expect } from "vitest";
import { fetchAllPages, runChecks, tally, reportRows, reportText, sortedChecks, CHECKS, REPORT_HEADERS } from "../healthCheck.js";
import { demoHealthApi } from "../healthCheckDemo.js";

describe("fetchAllPages", () => {
  it("reads every page with the cookie, falls back to page numbers when refused", async () => {
    const calls = [];
    const pages = [[1, 2], [3, 4], [5]];
    let refused = false;
    const run = async (xml) => {
      calls.push(xml);
      const page = Number(xml.match(/page="(\d+)"/)[1]);
      if (/paging-cookie/.test(xml) && !refused) { refused = true; throw new Error("Paging Cookie And Query Do Not Match"); }
      const cookie = `<cookie pagenumber="${page}" pagingcookie="${encodeURIComponent(encodeURIComponent(`<cookie page="${page}"/>`))}" istracking="False" />`;
      return { records: pages[page - 1].map(id => ({ id })), moreRecords: page < pages.length, pagingCookie: cookie };
    };
    const rows = await fetchAllPages(run, `<fetch><entity name="workflow"/></fetch>`, { pageSize: 2 });
    expect(rows.map(r => r.id)).toEqual([1, 2, 3, 4, 5]);
    expect(calls[0]).toMatch(/<fetch count="2" page="1">/);
    expect(calls.some(c => /paging-cookie/.test(c))).toBe(true);
    expect(calls[calls.length - 1]).not.toMatch(/paging-cookie/);
  });
});

describe("checks on the demo org", () => {
  it("each check answers, worst first", async () => {
    const seen = [];
    const res = await runChecks(demoHealthApi(), { onResult: (id) => seen.push(id) });
    expect(seen).toEqual(CHECKS.map(c => c.id));
    expect(res["trace-log"].level).toBe("info");
    expect(res["failed-jobs"]).toMatchObject({ level: "warn", rows: [["SurveySync: Update of account", 126], ["Recalculate territory", 9]] });
    expect(res["failed-jobs"].summary).toMatch(/^135 failures across 2 job names/);
    expect(res["suspended-jobs"].level).toBe("warn");
    expect(res["flows-disabled-owner"].rows).toEqual([["Push new accounts to SAP", "Paul Durand"], ["Weekly account digest", "Paul Durand"]]);
    expect(res["update-steps-unfiltered"].rows[0]).toEqual(["Contoso.Plugins.AccountAudit: Update of account", "Account", "Post-operation"]);
    expect(res["sync-workflows"].level).toBe("ok");
    expect(res["envvars-empty"].rows).toEqual([["Survey API key", "contoso_SurveyApiKey"]]);
    expect(res["users-no-role"].level).toBe("info");
    expect(res["unmanaged-in-prod"].level).toBe("skip");
    expect(res["log-tables"].summary).toMatch(/asyncoperation 1,240,300 rows/);
    expect(res.audit.level).toBe("info");
    const t = tally(res);
    expect(t).toMatchObject({ warn: 7, info: 3, ok: 1, skip: 1, failed: 0 });
    expect(res[sortedChecks(res)[0].id].level).toBe("warn");
  });

  it("a check that throws is reported, the others still run", async () => {
    const api = demoHealthApi();
    api.odataAll = async () => { throw new Error("Principal user is missing prvReadConnectionReference"); };
    const res = await runChecks(api);
    expect(res["connrefs-unbound"]).toEqual({ level: "failed", summary: "Principal user is missing prvReadConnectionReference" });
    expect(res["log-tables"].level).toBe("warn");
  });

  it("past the aggregate limit, the failed-jobs check says so instead of guessing", async () => {
    const api = demoHealthApi();
    api.fetchAggregate = async () => { throw new Error("AggregateQueryRecordLimit exceeded. Cannot perform this operation."); };
    const res = await runChecks(api, { checks: CHECKS.filter(c => c.id === "failed-jobs") });
    expect(res["failed-jobs"].level).toBe("error");
    expect(res["failed-jobs"].summary).toMatch(/More than 50,000/);
  });

  it("exports one row per item and a pasteable text", async () => {
    const res = await runChecks(demoHealthApi());
    const rows = reportRows(res);
    expect(rows[0]).toHaveLength(REPORT_HEADERS.length);
    expect(rows.filter(r => r[1] === "System jobs failed in the last 7 days")).toHaveLength(2);
    const txt = reportText(res, { org: "contoso", at: new Date("2026-10-20T10:00:00Z") });
    expect(txt.split("\n")[0]).toBe("Colvio health check — contoso — 2026-10-20 10:00 UTC");
    expect(txt).toMatch(/0 problem\(s\), 7 warning\(s\), 3 note\(s\), 1 OK/);
    expect(txt).not.toMatch(/Not applicable/);
  });
});
