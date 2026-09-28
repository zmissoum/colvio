import { describe, it, expect } from "vitest";
import { TEAM_TYPES, normalizeTeam, normalizeMember, filterTeams, sortTeams } from "../teamUtils.js";

const FMT = "@OData.Community.Display.V1.FormattedValue";

const rawTeam = (over = {}) => ({
  teamid: "t1", name: "Sales Managers", description: "Own the pipeline", teamtype: 0, isdefault: false,
  azureactivedirectoryobjectid: null, createdon: "2026-01-15T10:00:00Z",
  ["_businessunitid_value" + FMT]: "Sales EU", ["_administratorid_value" + FMT]: "Alice Martin",
  ...over,
});

describe("normalizeTeam", () => {
  it("maps the four documented teamtypes to their kind, label and badge color", () => {
    expect(normalizeTeam(rawTeam())).toMatchObject({ typeKey: "owner", typeLabel: "Owner", typeColor: "vi" });
    expect(normalizeTeam(rawTeam({ teamtype: 1 }))).toMatchObject({ typeKey: "access" });
    expect(normalizeTeam(rawTeam({ teamtype: 2 }))).toMatchObject({ typeKey: "entra", typeColor: "cy" });
    expect(normalizeTeam(rawTeam({ teamtype: 3 }))).toMatchObject({ typeKey: "entra" });
  });
  it("an UNKNOWN teamtype surfaces the platform's formatted label instead of breaking", () => {
    const t = normalizeTeam(rawTeam({ teamtype: 9, ["teamtype" + FMT]: "Future Kind" }));
    expect(t.typeKey).toBe("other");
    expect(t.typeLabel).toBe("Future Kind");
  });
  it("extracts BU and administrator from formatted-value annotations, flags BU-default teams", () => {
    const t = normalizeTeam(rawTeam({ isdefault: true }));
    expect(t.buName).toBe("Sales EU");
    expect(t.adminName).toBe("Alice Martin");
    expect(t.isDefault).toBe(true);
  });
  it("keeps the Entra group object id when present", () => {
    expect(normalizeTeam(rawTeam({ teamtype: 2, azureactivedirectoryobjectid: "aad-123" })).aadId).toBe("aad-123");
    expect(normalizeTeam(rawTeam()).aadId).toBeNull();
  });
});

describe("normalizeMember", () => {
  it("prefers email over UPN and reads access/CAL labels from annotations", () => {
    const m = normalizeMember({ systemuserid: "u1", fullname: "Jane", internalemailaddress: "jane@x.com", domainname: "jane@upn.com", isdisabled: false, ["accessmode" + FMT]: "Read-Write", ["caltype" + FMT]: "Full" });
    expect(m).toMatchObject({ email: "jane@x.com", accessModeLabel: "Read-Write", calTypeLabel: "Full", disabled: false });
    expect(normalizeMember({ systemuserid: "u2", fullname: "Svc", domainname: "svc@upn.com" }).email).toBe("svc@upn.com");
  });
});

describe("filterTeams", () => {
  const teams = [
    normalizeTeam(rawTeam()),                                                    // owner
    normalizeTeam(rawTeam({ teamid: "t2", name: "SG-D365-PROD", teamtype: 2 })), // entra
    normalizeTeam(rawTeam({ teamid: "t3", name: "Opp #42 access", teamtype: 1 })), // access
  ];
  it("'all' shows every loaded team EXCEPT access teams (per-record noise)", () => {
    expect(filterTeams(teams, { chip: "all" }).map(t => t.id)).toEqual(["t1", "t2"]);
  });
  it("the access chip shows ONLY access teams", () => {
    expect(filterTeams(teams, { chip: "access" }).map(t => t.id)).toEqual(["t3"]);
  });
  it("search matches name, BU and administrator, case-insensitively", () => {
    expect(filterTeams(teams, { chip: "all", search: "sg-d365" }).map(t => t.id)).toEqual(["t2"]);
    expect(filterTeams(teams, { chip: "all", search: "alice" }).length).toBe(2); // admin annotation
    expect(filterTeams(teams, { chip: "all", search: "sales eu" }).length).toBe(2); // BU annotation
    expect(filterTeams(teams, { chip: "all", search: "zzz" })).toEqual([]);
  });
});

describe("sortTeams", () => {
  it("alphabetical, but each BU's auto-created default team sinks to the end", () => {
    const t = [
      normalizeTeam(rawTeam({ teamid: "d1", name: "Contoso", isdefault: true })),
      normalizeTeam(rawTeam({ teamid: "t2", name: "Zebra Ops" })),
      normalizeTeam(rawTeam({ teamid: "t1", name: "Alpha Squad" })),
    ];
    expect(sortTeams(t).map(x => x.id)).toEqual(["t1", "t2", "d1"]);
  });
});

describe("TEAM_TYPES", () => {
  it("covers exactly the four documented teamtype values", () => {
    expect(Object.keys(TEAM_TYPES).map(Number).sort()).toEqual([0, 1, 2, 3]);
  });
});
