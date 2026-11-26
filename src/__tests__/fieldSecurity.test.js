import { describe, it, expect } from "vitest";
import { permFromRow, tablesWithPermissions, buildFieldGrid, cellText, fieldExportRows } from "../fieldSecurity.js";

const PROFILES = [{ id: "P1", name: "Sales managers" }, { id: "p2", name: "Finance" }, { id: "p3", name: "Unused" }];
const PERMS = [
  { profileId: "P1", entity: "Contact", column: "new_salary", canread: 4, cancreate: 0, canupdate: 0, canreadunmasked: null },
  { profileId: "p2", entity: "contact", column: "new_salary", canread: 4, cancreate: 4, canupdate: 4, canreadunmasked: null },
  { profileId: "p2", entity: "contact", column: "old_col", canread: 4, cancreate: 0, canupdate: 0, canreadunmasked: 3 },
  { profileId: "p2", entity: "account", column: "creditlimit", canread: 0, cancreate: 0, canupdate: 0, canreadunmasked: null },
].map(permFromRow);

describe("field security", () => {
  it("reads the picklists: 4 = allowed, anything else not", () => {
    expect(PERMS[0]).toEqual({ profileId: "p1", entity: "contact", column: "new_salary", read: true, create: false, update: false, unmasked: null });
    expect(PERMS[2].unmasked).toBe(3);
  });
  it("short-lists the tables with permissions, most columns first", () => {
    expect(tablesWithPermissions(PERMS)).toEqual([{ entity: "contact", columns: 2 }, { entity: "account", columns: 1 }]);
  });
  it("crosses secured columns with the profiles naming them; flags unreadable and no-longer-secured columns", () => {
    const g = buildFieldGrid("contact", [{ logical: "new_salary", display: "Salary" }, { logical: "governmentid", display: "Gov ID" }], PERMS, PROFILES);
    expect(g.profiles.map(p => p.name)).toEqual(["Finance", "Sales managers"]);
    expect(g.rows.map(r => [r.column, r.secured, r.readers, r.nobody])).toEqual([
      ["governmentid", true, 0, true],
      ["new_salary", true, 2, false],
      ["old_col", false, 1, false],
    ]);
    expect(g.showUnmasked).toBe(true);
    expect(cellText(g.rows[1].cells.p2)).toBe("R C U");
    expect(cellText(g.rows[1].cells.p1)).toBe("R");
    expect(cellText(undefined)).toBe("");
  });
  it("a profile granting nothing reads as a dash, and exports one row per column × profile", () => {
    const g = buildFieldGrid("account", [{ logical: "creditlimit", display: "Credit Limit" }], PERMS, PROFILES);
    expect(cellText(g.rows[0].cells.p2)).toBe("—");
    expect(g.rows[0].nobody).toBe(true);
    const g2 = buildFieldGrid("contact", [{ logical: "new_salary", display: "Salary" }, { logical: "governmentid", display: "Gov ID" }], PERMS, PROFILES);
    expect(fieldExportRows(g2)).toEqual([
      ["contact", "governmentid", "Gov ID", "Yes", "", "", "", "", ""],
      ["contact", "new_salary", "Salary", "Yes", "Finance", "Yes", "Yes", "Yes", ""],
      ["contact", "new_salary", "Salary", "Yes", "Sales managers", "Yes", "No", "No", ""],
      ["contact", "old_col", "old_col", "No", "Finance", "Yes", "No", "No", "All records"],
    ]);
  });
});
