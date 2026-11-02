// Demo org for Solutions › 🚀 Deployments: the raw answer getSolutionHistory gives — the
// solution history rows (a virtual table, purged after 180 days) and the import jobs (with who
// started them, kept longer) — with planted stories: a failed upgrade retried, an import that
// overwrote customizations, a patch, an uninstall, and an import older than the history.
const d = (daysAgo, hour = 10, minutes = 0) => new Date(Date.now() - daysAgo * 86400000 + (hour - 10) * 3600000 + minutes * 60000).toISOString();
const g = (n) => `0000000d-0000-4000-c000-${String(n).padStart(12, "0")}`;

export function demoSolutionHistory() {
  const h = (n, solution, version, publisher, operation, sub, daysAgo, seconds, extra = {}) => ({
    msdyn_solutionhistoryid: g(n), msdyn_name: solution, msdyn_solutionversion: version, msdyn_publishername: publisher,
    msdyn_operation: operation, msdyn_suboperation: sub, msdyn_status: 1, msdyn_result: true,
    msdyn_starttime: d(daysAgo), msdyn_endtime: new Date(Date.parse(d(daysAgo)) + seconds * 1000).toISOString(), msdyn_totaltime: seconds,
    msdyn_ismanaged: true, msdyn_ispatch: false, msdyn_isoverwritecustomizations: false, msdyn_errorcode: "", msdyn_exceptionmessage: "", msdyn_activityid: g(900 + n), msdyn_solutionid: "", msdyn_packagename: "", msdyn_packageversion: "",
    ...extra,
  });
  const history = [
    h(1, "ColvioDemo", "1.0.0.5", "Contoso", 0, 2, 2, 412, { msdyn_ismanaged: true }),
    h(2, "ColvioDemo", "1.0.0.5", "Contoso", 0, 2, 3, 95, { msdyn_result: false, msdyn_errorcode: "0x80048027", msdyn_exceptionmessage: "The import failed: the solution depends on the column new_region on the account table, which is missing in the target environment. Import the solution that contains it first." }),
    h(3, "ColvioDemo", "1.0.0.4", "Contoso", 2, 0, 3, 38, { msdyn_ismanaged: false }),
    h(4, "ColvioDemo", "1.0.0.4", "Contoso", 0, 3, 21, 240, { msdyn_isoverwritecustomizations: true }),
    h(5, "ColvioDemo", "1.0.0.3", "Contoso", 0, 2, 48, 388),
    h(6, "ColvioDemo", "1.0.0.3", "Contoso", 2, 0, 48, 41, { msdyn_ismanaged: false }),
    h(7, "ColvioDemo", "1.0.0.2", "Contoso", 0, 2, 95, 402),
    h(8, "ColvioDemo", "1.0.0.1", "Contoso", 0, 1, 160, 510),
    h(9, "msdynce_ServicePatch", "9.2.24013.10010", "Microsoft Dynamics 365", 0, 3, 30, 1260, { msdyn_ispatch: true }),
    h(10, "SalesEnterprise", "9.2.24014.10032", "Microsoft Dynamics 365", 0, 3, 30, 2715),
    h(11, "SalesEnterprise", "9.2.24014.10032", "Microsoft Dynamics 365", 3, 0, 30, 70),
    h(12, "CustomerInsights", "1.0.0.8", "Microsoft Dynamics 365", 0, 1, 12, 905),
    h(13, "ContosoLegacyReports", "2.1.0.0", "Contoso", 1, 4, 9, 66),
    h(14, "ContosoLegacyReports", "2.1.0.0", "Contoso", 0, 3, 120, 150),
    h(15, "ColvioDemo", "1.0.0.5", "Contoso", 4, 0, 2, 44),
    h(16, "ContosoHotfix", "1.0.0.1", "Contoso", 0, 1, 1, 0, { msdyn_status: 0, msdyn_endtime: null, msdyn_totaltime: null, msdyn_result: null }),
  ];
  const job = (n, solution, daysAgo, seconds, by, byId, progress = 100, minutesOffset = 0) => ({
    importjobid: g(500 + n), solutionname: solution, name: `${solution}_import`, startedon: d(daysAgo, 10, minutesOffset), completedon: seconds == null ? null : new Date(Date.parse(d(daysAgo, 10, minutesOffset)) + seconds * 1000).toISOString(), createdon: d(daysAgo, 10, minutesOffset),
    progress, operationcontext: "Default", importcontext: "Import", _createdby_value: byId, "_createdby_value@OData.Community.Display.V1.FormattedValue": by,
  });
  const zak = "00000000-0000-4000-c000-000000000001", alex = "00000000-0000-4000-c000-000000000002", svc = "00000000-0000-4000-c000-000000000004";
  const jobs = [
    job(1, "ColvioDemo", 2, 412, "Zakaria Missoum", zak),
    job(2, "ColvioDemo", 3, 95, "Zakaria Missoum", zak, 18, 9),
    job(4, "ColvioDemo", 21, 240, "Alex Baker", alex),
    job(5, "ColvioDemo", 48, 388, "svc-integration", svc, 100, 1),
    job(7, "ColvioDemo", 95, 402, "svc-integration", svc),
    job(8, "ColvioDemo", 160, 510, "Zakaria Missoum", zak),
    job(12, "CustomerInsights", 12, 905, "Alex Baker", alex),
    job(14, "ContosoLegacyReports", 120, 150, "Alex Baker", alex),
    job(16, "ContosoHotfix", 1, null, "Zakaria Missoum", zak, 35, 3),
    // older than the history's 180 days: the import job is all that is left of it
    job(20, "ColvioDemo", 230, 470, "Zakaria Missoum", zak),
    job(21, "ColvioDemo", 300, 455, "Zakaria Missoum", zak),
  ];
  return { history, jobs, historyError: "", jobsError: "" };
}

export function demoImportJobLog(id) {
  const failed = String(id || "").endsWith("000000000502");
  return { id, solution: "ColvioDemo", completed: d(failed ? 3 : 2), progress: failed ? 18 : 100, data: `<importexportxml start="${d(3)}" stop="${d(3)}" progress="${failed ? 18 : 100}"><solutionManifests><solutionManifest id="ColvioDemo" LCID="1033"><UniqueName>ColvioDemo</UniqueName><Version>1.0.0.5</Version><result result="${failed ? "failure" : "success"}" errorcode="${failed ? "0x80048027" : "0"}" errortext="${failed ? "The solution depends on the column new_region on the account table, which is missing in the target environment." : ""}" datetime="${d(3)}" /></solutionManifest></solutionManifests><entities><entity id="new_project" LocalizedName="Project"><result result="success" errorcode="0" errortext="" datetime="${d(3)}" /></entity>${failed ? `<entity id="account" LocalizedName="Account"><result result="failure" errorcode="0x80048027" errortext="Attribute new_region not found on entity account" datetime="${d(3)}" /></entity>` : ""}</entities></importexportxml>` };
}
