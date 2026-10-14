// Demo mode for Record activity: three saves of the demo account and a fake query function that
// answers the REAL loader's requests (traces, jobs, steps, flow registrations, runs) — so the demo
// exercises the same matching code as a live org. Time-based: the asynchronous plug-in and one
// flow finish a few seconds after the panel opens, which shows the auto-refresh at work.

const g = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const DEMO_ACTIVITY_IDS = { c1: g(101), c2: g(102), f1: g(501), f2: g(502), f3: g(503), f4: g(504), f5: g(505) };

export function createActivityDemo({ recordId, entitySet = "accounts", startedAt = Date.now(), clock = () => Date.now() }) {
  const id = String(recordId).toLowerCase();
  const op = (columns) => [{ kind: "update", entitySet, recordId: id, action: null, columns }];
  const s1t0 = startedAt - 40000, s2t0 = startedAt - 180000, s3t0 = startedAt - 25 * 60000;
  const saves = [
    { key: "demo-1", origin: "https://demo.crm4.dynamics.com", tabId: 1, t0: s1t0, t1: s1t0 + 412, batch: false, ops: op(["telephone1", "address1_city", "revenue"]), status: 204, ok: true, error: null, requestIds: [g(301)], serverMs: s1t0 + 412 },
    { key: "demo-2", origin: "https://demo.crm4.dynamics.com", tabId: 1, t0: s2t0, t1: s2t0 + 268, batch: false, ops: op(["revenue"]), status: 400, ok: false, error: null, requestIds: [g(302)], serverMs: s2t0 + 268 },
    { key: "demo-3", origin: "https://demo.crm4.dynamics.com", tabId: 1, t0: s3t0, t1: s3t0 + 190, batch: false, ops: op(["description"]), status: 204, ok: true, error: null, requestIds: [g(303)], serverMs: s3t0 + 190 },
  ];
  const elapsed = () => clock() - startedAt;
  const iso = (ms) => new Date(ms).toISOString();

  const trace = (n, o) => ({ plugintracelogid: g(n), operationtype: 1, mode: 0, depth: 1, messagename: "Update", primaryentity: "account", exceptiondetails: null, requestid: null, ...o });
  const traces = () => {
    const rows = [
      trace(11, { typename: "Contoso.Plugins.AccountValidate", correlationid: g(101), requestid: g(301), pluginstepid: g(201), performanceexecutionduration: 38, performanceexecutionstarttime: iso(s1t0 + 60), createdon: iso(s1t0 + 100) }),
      trace(12, { typename: "Contoso.Plugins.AccountRollup", correlationid: g(101), requestid: g(301), pluginstepid: g(202), performanceexecutionduration: 61, performanceexecutionstarttime: iso(s1t0 + 330), createdon: iso(s1t0 + 395) }),
      ...[0, 1, 2].map(i => trace(13 + i, { typename: "Contoso.Plugins.ContactAddressSync", primaryentity: "contact", depth: 2, correlationid: g(101), pluginstepid: g(203), performanceexecutionduration: 40 + i * 3, performanceexecutionstarttime: iso(s1t0 + 150 + i * 50), createdon: iso(s1t0 + 195 + i * 50) })),
      trace(21, { typename: "Contoso.Plugins.AccountValidate", correlationid: g(102), requestid: g(302), pluginstepid: g(201), performanceexecutionduration: 22, performanceexecutionstarttime: iso(s2t0 + 50), createdon: iso(s2t0 + 80),
        exceptiondetails: "Unhandled exception: \nException type: System.ServiceModel.FaultException`1[Microsoft.Xrm.Sdk.OrganizationServiceFault]\nMessage: Revenue can't drop below the signed contracts total (12,000,000).\nDetail: \n<OrganizationServiceFault>…</OrganizationServiceFault>" }),
    ];
    if (elapsed() > 8000) rows.push(trace(16, { typename: "Contoso.Integration.SyncToErp", mode: 1, correlationid: g(101), pluginstepid: g(204), performanceexecutionduration: 1240, performanceexecutionstarttime: iso(startedAt + 6200), createdon: iso(startedAt + 7500) }));
    return rows;
  };
  const DETAIL = {
    [g(11)]: "Entered Contoso.Plugins.AccountValidate.Execute()\nTarget: account, 3 attributes\nRules checked: credit hold, revenue floor, phone format — all passed (12 ms)\nExiting",
    [g(12)]: "Recomputing the parent rollups\nParent account: none — nothing to roll up\nExiting",
    [g(21)]: "Entered Contoso.Plugins.AccountValidate.Execute()\nRevenue check: new value 9,500,000 < signed contracts 12,000,000 → rejecting the save",
  };
  const jobs = () => [{
    asyncoperationid: g(401), name: "Contoso.Integration.SyncToErp: Update of account", operationtype: 1, correlationid: g(101),
    statecode: elapsed() > 8000 ? 3 : 2, statuscode: elapsed() > 8000 ? 30 : 20,
    createdon: iso(s1t0 + 500), startedon: iso(startedAt + 6000), completedon: elapsed() > 8000 ? iso(startedAt + 7600) : null, friendlymessage: null,
  }];
  const STEPS = { [g(201)]: 10, [g(202)]: 40, [g(203)]: 20, [g(204)]: 40 };
  const REGS = [
    { name: g(501), message: 3, filteringattributes: "revenue", filterexpression: null, scope: 4 },
    { name: g(502) + ":MTA", message: 4, filteringattributes: "address1_line1,address1_city,address1_postalcode", filterexpression: null, scope: 4 },
    { name: g(503), message: 3, filteringattributes: "ownerid", filterexpression: null, scope: 4 },
    { name: g(504), message: 1, filteringattributes: null, filterexpression: null, scope: 4 },
    { name: g(505), message: 3, filteringattributes: null, filterexpression: "customertypecode eq 1", scope: 4 },
  ].map((r, i) => ({ callbackregistrationid: g(600 + i), entityname: "account", sdkmessagename: null, runas: 1, softdeletestatus: 0, ...r }));
  const FLOWS = { [g(501)]: "Notify finance when revenue changes", [g(502)]: "Sync account address to the ERP", [g(503)]: "Owner change alert", [g(504)]: "Welcome pack for new accounts", [g(505)]: "Key account review" };
  const runs = () => [
    { flowrunid: g(701), name: "08584739214003", _workflow_value: g(501), status: "Succeeded", starttime: iso(s1t0 + 3400), endtime: iso(s1t0 + 5500), triggertype: "Automated" },
    { flowrunid: g(702), name: "08584739214007", _workflow_value: g(502), status: elapsed() > 12000 ? "Succeeded" : "Running", starttime: iso(s1t0 + 4100), endtime: elapsed() > 12000 ? iso(startedAt + 11500) : null, triggertype: "Automated" },
  ];

  const timeAfter = (filter, field) => { const m = String(filter || "").match(new RegExp(`${field} ge (\\S+)`)); return m ? Date.parse(m[1]) : NaN; };
  const timeBefore = (filter, field) => { const m = String(filter || "").match(new RegExp(`${field} le (\\S+)`)); return m ? Date.parse(m[1]) : NaN; };
  const inRange = (row, field, filter) => {
    const t = Date.parse(row[field]); const a = timeAfter(filter, field), b = timeBefore(filter, field);
    return (!Number.isFinite(a) || t >= a) && (!Number.isFinite(b) || t <= b);
  };
  const ids = (filter, field) => [...String(filter || "").matchAll(new RegExp(`${field} eq ([0-9a-f-]{36})`, "gi"))].map(m => m[1].toLowerCase());

  async function query(set, opts = {}) {
    const f = opts.filter || "";
    const one = set.match(/^plugintracelogs\(([0-9a-f-]{36})\)$/i);
    if (one) { const r = traces().find(x => x.plugintracelogid === one[1].toLowerCase()); return { records: r ? [{ messageblock: DETAIL[r.plugintracelogid] || "", exceptiondetails: r.exceptiondetails }] : [] }; }
    switch (set) {
      case "plugintracelogs": {
        const cids = ids(f, "correlationid");
        const ent = (f.match(/primaryentity eq '(\w+)'/) || [])[1];
        return { records: traces().filter(r => (cids.length ? cids.includes(r.correlationid) : r.primaryentity === ent) && inRange(r, "createdon", f)) };
      }
      case "asyncoperations": return { records: jobs().filter(j => f.includes(id) && inRange(j, "createdon", f)) };
      case "sdkmessageprocessingsteps": return { records: ids(f, "sdkmessageprocessingstepid").map(s => ({ sdkmessageprocessingstepid: s, stage: STEPS[s], name: "" })) };
      case "callbackregistrations": return { records: /entityname eq 'account'/.test(f) ? REGS : [] };
      case "workflows": return { records: ids(f, "workflowid").filter(w => FLOWS[w]).map(w => ({ workflowid: w, name: FLOWS[w], statecode: 1 })) };
      case "flowruns": return { records: runs().filter(r => inRange(r, "starttime", f)) };
      case "organizations": return { records: [{ organizationid: g(1), plugintracelogsetting: 2 }] };
      default: return { records: [] };
    }
  }

  return { saves, query };
}
