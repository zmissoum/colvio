import { describe, it, expect } from "vitest";
import { parseAccessRights, privilegeRight, depthFromMask, buTree, reaches, depthNeeded, diagnoseAccess, rowVerdict, accessExportRows, ACCESS_HEADERS } from "../accessDiagnosis.js";
import { demoAccessContext, DEMO_ACCESS_USERS } from "../accessDemo.js";

const [ALEX, JEANNE, SAM] = DEMO_ACCESS_USERS.map(u => u.id);
const byRight = (d) => Object.fromEntries(d.rows.map(r => [r.right, r]));

describe("parsing", () => {
  it("reads Dataverse's access rights and privilege types", () => {
    expect([...parseAccessRights("ReadAccess, WriteAccess, AppendToAccess")]).toEqual(["Read", "Write", "AppendTo"]);
    expect(parseAccessRights("None").size).toBe(0);
    expect(privilegeRight({ PrivilegeType: "AppendTo" })).toBe("AppendTo");
    expect(privilegeRight({ PrivilegeType: 3 })).toBe("Write");
    expect(privilegeRight({ Name: "prvAppendToAccount" })).toBe("AppendTo");
    expect(privilegeRight({ Name: "prvAppendAccount" })).toBe("Append");
    expect(depthFromMask(4)).toBe(4);
    expect(depthFromMask(0)).toBe(0);
  });
});

describe("business unit reach", () => {
  const tree = buTree([{ id: "R", parentId: "" }, { id: "E", parentId: "R" }, { id: "F", parentId: "E" }, { id: "S", parentId: "E" }]);
  const rec = { buId: "F" };
  it("walks the tree", () => {
    expect(tree.within("F", "E")).toBe(true);
    expect(tree.within("F", "S")).toBe(false);
    expect(tree.within("F", "F")).toBe(true);
  });
  it("matches each depth", () => {
    expect(reaches(8, "S", rec, false, tree)).toBe(true);
    expect(reaches(4, "E", rec, false, tree)).toBe(true);
    expect(reaches(4, "S", rec, false, tree)).toBe(false);
    expect(reaches(2, "F", rec, false, tree)).toBe(true);
    expect(reaches(2, "E", rec, false, tree)).toBe(false);
    expect(reaches(1, "F", rec, false, tree)).toBe(false);
    expect(reaches(1, "F", rec, true, tree)).toBe(true);
  });
  it("levels are cumulative: an owned record is reached at every depth, whatever the privilege's BU", () => {
    // a role from another business unit (S) at BU / Parent-Child depth on a record the user owns in F
    expect(reaches(2, "S", rec, true, tree)).toBe(true);
    expect(reaches(4, "S", rec, true, tree)).toBe(true);
    expect(reaches(2, "S", rec, false, tree)).toBe(false);
    expect(reaches(4, "S", rec, false, tree)).toBe(false);
    // Parent: Child includes the BU itself; Organization needs nothing
    expect(reaches(4, "F", rec, false, tree)).toBe(true);
    expect(reaches(8, "S", { buId: "" }, false, tree)).toBe(true);
    expect(reaches(0, "F", rec, true, tree)).toBe(false);
  });
  it("needs the narrowest depth that reaches the record from the user's BU", () => {
    const ctx = (u, r) => ({ entity: { ownership: "UserOwned" }, user: u, record: r });
    expect(depthNeeded(ctx({ id: "u", buId: "S" }, { ownerId: "u", buId: "F" }), tree)).toBe(1);
    expect(depthNeeded(ctx({ id: "u", buId: "F" }, { ownerId: "x", buId: "F" }), tree)).toBe(2);
    expect(depthNeeded(ctx({ id: "u", buId: "E" }, { ownerId: "x", buId: "F" }), tree)).toBe(4);
    expect(depthNeeded(ctx({ id: "u", buId: "S" }, { ownerId: "x", buId: "F" }), tree)).toBe(8);
  });
});

describe("diagnosis", () => {
  it("explains a user from another BU: Read through a team, Write out of reach", () => {
    const d = diagnoseAccess(demoAccessContext(ALEX, { id: "rec", entity: "account" }));
    const r = byRight(d);
    expect(r.Read.granted).toBe(true);
    expect(r.Read.why).toMatchObject({ kind: "team", depth: 4 });
    expect(rowVerdict(r.Read)).toBe("team Key Accounts EU › role Key account reader — Parent: Child BU");
    expect(r.Write.granted).toBe(false);
    expect(r.Write.best).toBe(1);
    expect(r.Write.need).toBe(8);
    expect(rowVerdict(r.Write)).toMatch(/^Best: role Salesperson — User — doesn't reach/);
    expect(r.Write.fixes[0]).toMatch(/widest Write is User; this record needs Organization — or, where the org allows/);
    expect(r.Write.fixes.join(" ")).toMatch(/share the record with the user \(Write\)/);
    expect(r.Read.mismatch).toBeUndefined();
    expect(d.position).toMatch(/outside the user's business unit branch \(Spain\)/);
  });

  it("the owner gets every User-level right", () => {
    const r = byRight(diagnoseAccess(demoAccessContext(JEANNE, { id: "rec", entity: "account" })));
    for (const k of ["Read", "Write", "Append", "Delete", "Assign", "Share"]) expect(r[k].model).toBe(true);
    expect(r.Write.why.label).toBe("role Salesperson");
  });

  it("a System Administrator passes everywhere", () => {
    const d = diagnoseAccess(demoAccessContext(SAM, { id: "rec", entity: "account" }));
    expect(d.rows.every(x => x.granted && x.model)).toBe(true);
    expect(rowVerdict(d.rows[0])).toMatch(/System Administrator/);
  });

  it("a share needs the privilege behind it, and Dataverse's answer wins", () => {
    const ctx = demoAccessContext(ALEX, { id: "rec", entity: "account" });
    ctx.shares = [{ principalId: ALEX, mask: "ReadAccess, WriteAccess, DeleteAccess", name: "" }];
    ctx.grants = ctx.grants.filter(g => !(g.privilegeId === ctx.entity.privileges.find(p => p.PrivilegeType === "Delete").PrivilegeId));
    ctx.effective = "ReadAccess, WriteAccess";
    const r = byRight(diagnoseAccess(ctx));
    expect(r.Write.why.kind).toBe("share");
    expect(r.Delete.model).toBe(false);
    expect(r.Delete.paths.find(p => p.kind === "share").needsPrivilege).toBe(true);
    expect(r.Delete.fixes[0]).toMatch(/No role of the user or their teams has Delete/);
    expect(r.Delete.fixes.join(" ")).toMatch(/A share alone won't do/);
    ctx.effective = "ReadAccess";
    expect(byRight(diagnoseAccess(ctx)).Write.mismatch).toMatch(/Dataverse says no/);
  });

  it("organization-owned tables: a role gives all rows; no assign or share", () => {
    const ctx = { entity: { ownership: "OrganizationOwned", privileges: [{ PrivilegeId: "p1", PrivilegeType: "Read" }] }, user: { id: "u", buId: "b", roles: [{ id: "r", name: "Reader", buId: "b" }] }, teams: [], record: {}, grants: [{ roleId: "r", privilegeId: "p1", mask: 8 }], bus: [], effective: null };
    const r = byRight(diagnoseAccess(ctx));
    expect(r.Read.model).toBe(true);
    expect(r.Read.granted).toBe(null);
    expect(r.Assign.applicable).toBe(false);
    expect(r.Assign.note).toMatch(/nothing to assign or share/);
  });

  it("flags a disabled, read-only user without roles", () => {
    const d = diagnoseAccess({ entity: { privileges: [] }, user: { id: "u", disabled: true, accessMode: 2, roles: [] }, teams: [], record: {}, grants: [], bus: [] });
    expect(d.facts.map(f => f.level)).toEqual(["error", "warn", "error"]);
  });

  it("exports one row per right", () => {
    const d = diagnoseAccess(demoAccessContext(ALEX, { id: "rec", entity: "account" }));
    const rows = accessExportRows(d.rows);
    expect(rows).toHaveLength(7);
    expect(rows[0]).toHaveLength(ACCESS_HEADERS.length);
    expect(rows[0][1]).toBe("Yes");
  });
});

describe("review pass: owner teams", () => {
  it("a record owned by an owner team the user belongs to counts as theirs at the User depth", () => {
    const ctx = demoAccessContext(ALEX, { id: "rec", entity: "account" });
    ctx.record.ownerId = ctx.teams[0].id; ctx.record.ownerType = "team"; ctx.record.ownerName = ctx.teams[0].name;
    ctx.effective = null;
    const r = byRight(diagnoseAccess(ctx));
    expect(r.Write.model).toBe(true);
    expect(r.Write.why).toMatchObject({ kind: "role", depth: 1 });
    expect(r.Write.need).toBe(1);
  });
});
