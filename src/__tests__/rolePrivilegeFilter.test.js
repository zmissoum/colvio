import { describe, it, expect } from "vitest";
import { formatPrivName, depthFromMask, searchPrivileges, rolesHolding, holderExportRows } from "../rolePrivilegeFilter.js";

const CATALOG = [
  { id: "1", name: "prvReadAccount" },
  { id: "2", name: "prvReadAccountTeamMembership" },
  { id: "3", name: "prvExportToExcel" },
  { id: "4", name: "prvBulkDelete" },
  { id: "5", name: "prvWriteAccount" },
  { id: "6", name: "prvReadContact" },
];

const ROLES = [
  { id: "r1", rootId: "r1", name: "System Administrator", isCustom: false },
  { id: "r2", rootId: "r2", name: "Sales Manager", isCustom: false },
  { id: "r3", rootId: "r3", name: "Basic User", isCustom: false },
  { id: "r4", rootId: "r4", name: "Custom CRM Admin", isCustom: true },
];

describe("formatPrivName", () => {
  it("splits the action from the table", () => {
    expect(formatPrivName("prvDeleteAccount")).toBe("Delete · Account");
    expect(formatPrivName("prvAppendToCustomerGroup")).toBe("Append To · CustomerGroup");
    expect(formatPrivName("prvExportToExcel")).toBe("Export To · Excel");
  });
  it("leaves non-prv names alone", () => {
    expect(formatPrivName("ReadAccount")).toBe("ReadAccount");
    expect(formatPrivName("")).toBe("");
  });
});

describe("depthFromMask", () => {
  it("maps the four depths and treats 0 / junk as not granted", () => {
    expect([1, 2, 4, 8].map(depthFromMask)).toEqual([1, 2, 4, 8]);
    expect(depthFromMask(0)).toBe(0);
    expect(depthFromMask(null)).toBe(0);
    expect(depthFromMask("x")).toBe(0);
  });
  it("keeps the widest depth when several bits are set", () => {
    expect(depthFromMask(3)).toBe(2);
    expect(depthFromMask(15)).toBe(8);
  });
});

describe("searchPrivileges", () => {
  it("finds a privilege from the words of its readable name", () => {
    expect(searchPrivileges(CATALOG, "export excel").map(p => p.name)).toEqual(["prvExportToExcel"]);
    expect(searchPrivileges(CATALOG, "bulk").map(p => p.name)).toEqual(["prvBulkDelete"]);
  });
  it("ranks the exact name first, then prefixes, shorter names before longer ones", () => {
    expect(searchPrivileges(CATALOG, "readaccount").map(p => p.name)).toEqual(["prvReadAccount", "prvReadAccountTeamMembership"]);
    expect(searchPrivileges(CATALOG, "prvReadAccount")[0].name).toBe("prvReadAccount");
    expect(searchPrivileges(CATALOG, "read").map(p => p.name)).toEqual(["prvReadAccount", "prvReadContact", "prvReadAccountTeamMembership"]);
  });
  it("is case-insensitive, needs a query and honours the limit", () => {
    expect(searchPrivileges(CATALOG, "WRITE ACCOUNT").map(p => p.name)).toEqual(["prvWriteAccount"]);
    expect(searchPrivileges(CATALOG, "  ")).toEqual([]);
    expect(searchPrivileges(CATALOG, "prv", 2)).toHaveLength(2);
    expect(searchPrivileges(null, "read")).toEqual([]);
  });
});

describe("rolesHolding", () => {
  const GRANTS = [
    { roleId: "R1", mask: 8 },        // case differs from the role id
    { roleId: "r2", mask: 2 },
    { roleId: "r2-bu-copy", mask: 8 }, // another BU's copy — not a listed role
    { roleId: "r4", mask: 4 },
    { roleId: "r3", mask: 0 },        // a row with no depth isn't a grant
  ];
  it("lists the roles holding the privilege, widest depth first", () => {
    expect(rolesHolding(ROLES, GRANTS).map(h => [h.role.name, h.depth])).toEqual([
      ["System Administrator", 8], ["Custom CRM Admin", 4], ["Sales Manager", 2],
    ]);
  });
  it("applies the minimum depth", () => {
    expect(rolesHolding(ROLES, GRANTS, 8).map(h => h.role.name)).toEqual(["System Administrator"]);
    expect(rolesHolding(ROLES, GRANTS, 4).map(h => h.role.name)).toEqual(["System Administrator", "Custom CRM Admin"]);
  });
  it("matches a role through its root id too", () => {
    const roles = [{ id: "copy-in-root-bu", rootId: "root-1", name: "Auditor", isCustom: true }];
    expect(rolesHolding(roles, [{ roleId: "root-1", mask: 1 }]).map(h => h.depth)).toEqual([1]);
  });
  it("returns nothing without grants", () => {
    expect(rolesHolding(ROLES, [])).toEqual([]);
    expect(rolesHolding(ROLES, null)).toEqual([]);
  });
});

describe("holderExportRows", () => {
  it("writes role, kind, privilege, label and depth", () => {
    const holders = rolesHolding(ROLES, [{ roleId: "r4", mask: 8 }]);
    expect(holderExportRows({ name: "prvExportToExcel" }, holders)).toEqual([
      ["Custom CRM Admin", "Custom", "prvExportToExcel", "Export To · Excel", "Organization"],
    ]);
  });
});
