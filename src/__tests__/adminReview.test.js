// Review pass of the admin modules (Adoption, Bulk settings, Users & Licenses, Security): the
// pure parts of the fixes — what the screen SAYS in each state, and the shapes the panel reads.
import { describe, it, expect } from "vitest";
import { ACCESS_SCOPE_NOTE, neverSignedInView } from "../adoptionUtils.js";
import { LL_NOTE, scanIncompleteNote } from "../userSettingsCatalog.js";
import { EMPTY_USER_ROLES, normalizeUserRoles, userRolesLabel, noRolesSentence, holdersCountLabel } from "../userRolesUtils.js";

describe("Adoption — what 'access' means, and the never-signed-in states", () => {
  it("the scope note names both audit actions, as the slice reader now counts them", () => {
    expect(ACCESS_SCOPE_NOTE).toMatch(/64 and 65/);
    expect(ACCESS_SCOPE_NOTE).toMatch(/web-service \(API\)/);
  });
  it("neverSignedInView: user list unavailable → no number, no export — and it wins over a loading role", () => {
    expect(neverSignedInView({ usersFailed: true, count: 0 })).toEqual({ kind: "unavailable", text: "user list unavailable", exportable: false });
    expect(neverSignedInView({ usersFailed: true, loadingMembers: true, count: 12 }).kind).toBe("unavailable");
  });
  it("neverSignedInView: role members loading → wait, no export", () => {
    expect(neverSignedInView({ loadingMembers: true, count: 0 })).toEqual({ kind: "loading", text: "reading the role's members…", exportable: false });
  });
  it("neverSignedInView: otherwise the real count, exportable — 0 included, that IS the all-clear", () => {
    expect(neverSignedInView({ count: 3 })).toEqual({ kind: "ok", text: "3", exportable: true });
    expect(neverSignedInView({ count: 0 })).toEqual({ kind: "ok", text: "0", exportable: true });
    expect(neverSignedInView()).toEqual({ kind: "ok", text: "0", exportable: true });
  });
});

describe("Bulk settings — the last-login note and the incomplete-scan guard", () => {
  it("LL_NOTE says what the reader counts: both access actions, not 'opened an app (action 64)'", () => {
    expect(LL_NOTE).toMatch(/actions 64 and 65/);
    expect(LL_NOTE).toMatch(/web-service \(API\)/);
    expect(LL_NOTE).not.toMatch(/opened a model-driven app/);
    expect(LL_NOTE).toMatch(/never one request per user/);
  });
  it("scanIncompleteNote: silent with 'Any login', or once every date is read", () => {
    expect(scanIncompleteNote("any", 5, 10)).toBe("");
    expect(scanIncompleteNote("yes", 0, 10)).toBe("");
    expect(scanIncompleteNote("never", 0, 0)).toBe("");
  });
  it("scanIncompleteNote: names read/total while a Signed-in filter is on and the scan runs", () => {
    expect(scanIncompleteNote("yes", 4, 10)).toBe("list incomplete until the last-login scan ends (6 of 10 read)");
    expect(scanIncompleteNote("never", 10, 10)).toBe("list incomplete until the last-login scan ends (0 of 10 read)");
  });
});

describe("User roles — direct and through teams", () => {
  const direct = [{ id: "r1", name: "Salesperson" }];
  const inherited = [{ id: "r2", name: "Basic User", team: { id: "t1", name: "Sales EU" } }];
  it("normalizeUserRoles: a plain array (demo / older answer) = direct only, teams NOT read", () => {
    expect(normalizeUserRoles(direct)).toEqual({ direct, inherited: [], teamsError: "", teamsRead: false });
    expect(normalizeUserRoles(null)).toEqual(EMPTY_USER_ROLES);
    expect(normalizeUserRoles(undefined)).toEqual(EMPTY_USER_ROLES);
  });
  it("normalizeUserRoles: the content script's shape, the team error kept", () => {
    expect(normalizeUserRoles({ direct, inherited, teamsError: "" })).toEqual({ direct, inherited, teamsError: "", teamsRead: true });
    expect(normalizeUserRoles({ direct, teamsError: "403 prvReadTeam" })).toEqual({ direct, inherited: [], teamsError: "403 prvReadTeam", teamsRead: true });
  });
  it("userRolesLabel: counts both; '?' when the team read failed; no team part when teams weren't read", () => {
    expect(userRolesLabel(normalizeUserRoles({ direct, inherited }))).toBe("direct (1) · via teams (1)");
    expect(userRolesLabel(normalizeUserRoles({ direct: [], inherited: [], teamsError: "x" }))).toBe("direct (0) · via teams (?)");
    expect(userRolesLabel(normalizeUserRoles(direct))).toBe("direct (1)");
  });
  it("noRolesSentence: only when BOTH reads answered empty — never over a failed team read", () => {
    expect(noRolesSentence(normalizeUserRoles({ direct: [], inherited: [] }))).toBe("No security roles assigned — neither directly nor through a team");
    expect(noRolesSentence(normalizeUserRoles([]))).toBe("No security roles assigned directly (roles through teams not read)");
    expect(noRolesSentence(normalizeUserRoles({ direct: [], inherited: [], teamsError: "x" }))).toBe("");
    expect(noRolesSentence(normalizeUserRoles({ direct, inherited: [] }))).toBe("");
    expect(noRolesSentence(normalizeUserRoles({ direct: [], inherited }))).toBe("");
  });
});

describe("Security › Has privilege — the holders sentence", () => {
  it("counts EVERY holder, and says how many the filters leave on screen", () => {
    expect(holdersCountLabel(12, 40, 12)).toBe("12 of 40 roles hold it");
    expect(holdersCountLabel(12, 40, 3)).toBe("12 of 40 roles hold it (3 shown with the current filters)");
    expect(holdersCountLabel(12, 40, 12, " (Organization)")).toBe("12 of 40 roles hold it (Organization)");
    expect(holdersCountLabel(12, 40, 0, " (Business Unit or wider)")).toBe("12 of 40 roles hold it (Business Unit or wider) (0 shown with the current filters)");
  });
});
