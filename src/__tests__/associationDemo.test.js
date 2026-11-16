import { describe, it, expect } from "vitest";
import { createAssociationDemo, DEMO_TEAM_USERS, DEMO_TEAMS, DEMO_MEMBERSHIPS } from "../associationDemo.js";
import { readPairs, valuesToResolve, buildAssociationItems, summarizeAssociation } from "../associationUtils.js";

const SETS = { set1: "systemusers", nav1: "teammembership_association", set2: "teams" };
// What AssociationLoader does with the lookups: value (lowercased) → id, ambiguous when two match.
const resolve = (demo, table, field, pk, values) => {
  const m = new Map(), n = new Map();
  for (const r of demo.lookup(table, field, values)) { const k = String(r[field]).toLowerCase(); n.set(k, (n.get(k) || 0) + 1); if (!m.has(k)) m.set(k, r[pk]); }
  for (const [k, c] of n) if (c > 1) m.set(k, { ambiguous: c });
  return m;
};

describe("demo N:N association — users by email, teams by name, existing links", () => {
  it("has users with emails and teams with names, two memberships to start with", () => {
    expect(DEMO_TEAM_USERS.every(u => /@contoso\.com$/.test(u.internalemailaddress))).toBe(true);
    expect(DEMO_TEAMS.map(t => t.name)).toContain("Sales Managers");
    const d = createAssociationDemo();
    for (const [u, t] of DEMO_MEMBERSHIPS) expect(d.isLinked(u, t)).toBe(true);
  });
  it("looks values up like the server: any case, unknown values left out", () => {
    const d = createAssociationDemo();
    expect(d.lookup("systemuser", "internalemailaddress", ["MARIE@contoso.com", "nobody@contoso.com"])).toEqual([{ internalemailaddress: "marie@contoso.com", systemuserid: DEMO_TEAM_USERS[0].systemuserid }]);
    expect(d.lookup("team", "name", ["key accounts"])).toEqual([{ name: "Key Accounts", teamid: DEMO_TEAMS[1].teamid }]);
    expect(d.lookup("account", "name", ["x"])).toEqual([]);
  });
  it("a file of emails and team names: resolved, associated, already linked, rolled back", () => {
    const d = createAssociationDemo();
    const rows = [
      { user: "marie@contoso.com", team: "Sales Managers" },   // already a member
      { user: "alex@contoso.com", team: "Sales Managers" },
      { user: "sophie@contoso.com", team: "Key Accounts" },     // already a member
      { user: "lucas@contoso.com", team: "" },                  // no team: skipped
      { user: "alex@contoso.com", team: "sales managers" },     // the same pair again: skipped
      { user: "lucas@contoso.com", team: "Support Tier 2" },
      { user: "jean@contoso.com", team: "Key Accounts" },       // not a user of the org
      { user: "marie@contoso.com", team: "Key Accounts" },
    ];
    const { pairs, blank } = readPairs(rows, "user", "team");
    expect(blank).toHaveLength(1);
    const r1 = resolve(d, "systemuser", "internalemailaddress", "systemuserid", valuesToResolve(pairs, 1, true));
    const r2 = resolve(d, "team", "name", "teamid", valuesToResolve(pairs, 2, true));
    const { items, problems } = buildAssociationItems(pairs, r1, r2);
    expect(problems.map(p => p.msg)).toEqual(["duplicate of row 3 in the file — sent once", '"jean@contoso.com" not found']);
    expect(items).toHaveLength(5);
    const run = d.associate(SETS, items.map(it => ({ id1: it.id1, id2: it.id2 })), "add");
    expect({ done: run.done, already: run.already, errors: run.errors.length }).toEqual({ done: 3, already: 2, errors: 0 });
    expect(summarizeAssociation(run.log)).toEqual({ done: 3, already: 2, errors: 0 });
    expect(run.log[0]).toMatchObject({ row: 1, status: "ASSOCIATED", note: "already associated", already: true });
    // a second run of the same file: everything is already there
    expect(d.associate(SETS, items, "add")).toMatchObject({ done: 0, already: 5 });
    // rollback = remove what the first run added; the two older memberships stay
    const added = items.filter((_, i) => !run.log[i].already);
    expect(d.associate(SETS, added, "remove")).toMatchObject({ done: 3, already: 0 });
    for (const [u, t] of DEMO_MEMBERSHIPS) expect(d.isLinked(u, t)).toBe(true);
    expect(d.associate(SETS, added.slice(0, 1), "remove").log[0]).toMatchObject({ status: "DISASSOCIATED", note: "was not associated", already: true });
  });
  it("a GUID that isn't a record of the org is an error, as the live path reports it", () => {
    const d = createAssociationDemo();
    const r = d.associate(SETS, [{ id1: "00000000-0000-4000-8000-000000000001", id2: DEMO_TEAMS[0].teamid }], "add");
    expect(r.errors).toHaveLength(1);
    expect(r.log[0]).toMatchObject({ status: "ERROR", msg: "systemuser With Id = 00000000-0000-4000-8000-000000000001 Does Not Exist" });
  });
});
