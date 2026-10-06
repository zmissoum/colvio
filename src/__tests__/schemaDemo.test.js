import { describe, it, expect } from "vitest";
import { demoFields, demoLookups, demoManyToMany, DEMO_SCHEMA_TABLES } from "../schemaDemo.js";
import { ENTS, FLDS } from "../shared.jsx";

const REF = new Set(["Lookup", "Customer", "Owner"]);

describe("schemaDemo", () => {
  it("models only tables of the demo table list", () => {
    const known = new Set(ENTS.map(e => e.l));
    for (const t of DEMO_SCHEMA_TABLES) expect(known.has(t)).toBe(true);
  });

  it("returns columns in the live getFields shape, one primary id per table", () => {
    for (const t of DEMO_SCHEMA_TABLES) {
      const fs = demoFields(t);
      expect(fs.length).toBeGreaterThan(5);
      expect(fs.filter(f => f.isPrimaryId).map(f => f.logical)).toEqual([`${t}id`]);
      expect(new Set(fs.map(f => f.logical)).size).toBe(fs.length);
      for (const f of fs) {
        expect(typeof f.display).toBe("string");
        expect(typeof f.required).toBe("boolean");
        expect(typeof f.isCustom).toBe("boolean");
        expect(f.odataName).toBe(REF.has(f.type) ? `_${f.logical}_value` : f.logical);
      }
    }
  });

  it("builds account from the demo org's own columns (FLDS), lookups under their plain name", () => {
    const fs = demoFields("account");
    expect(fs.length).toBe(FLDS.length);
    const owner = fs.find(f => f.logical === "ownerid");
    expect(owner.odataName).toBe("_ownerid_value");
    expect(fs.find(f => f.logical === "name").required).toBe(true);
    expect(fs.find(f => f.logical === "new_sapid").isCustom).toBe(true);
  });

  it("every lookup starts from a reference column and lands on a modeled table", () => {
    const tables = new Set(DEMO_SCHEMA_TABLES);
    for (const t of DEMO_SCHEMA_TABLES) {
      const cols = new Map(demoFields(t).map(f => [f.logical, f]));
      for (const lk of demoLookups(t)) {
        expect(REF.has(cols.get(lk.lookupField)?.type)).toBe(true);
        expect(tables.has(lk.targetEntity)).toBe(true);
        expect(lk.targetEntity).not.toBe(t); // no self-edges on the demo canvas
        expect(lk.type).toBe("single");
      }
    }
  });

  it("links the core sales tables", () => {
    const has = (t, field, target) => demoLookups(t).some(lk => lk.lookupField === field && lk.targetEntity === target);
    expect(has("account", "primarycontactid", "contact")).toBe(true);
    expect(has("contact", "parentcustomerid", "account")).toBe(true);
    expect(has("opportunity", "customerid", "account")).toBe(true);
    expect(has("incident", "customerid", "account")).toBe(true);
    expect(has("account", "ownerid", "systemuser")).toBe(true);
  });

  it("N:N: each table gets only the relationships it belongs to, and both sides see them", () => {
    for (const t of DEMO_SCHEMA_TABLES) {
      for (const r of demoManyToMany(t)) {
        expect([r.entity1, r.entity2]).toContain(t);
        const other = r.entity1 === t ? r.entity2 : r.entity1;
        expect(demoManyToMany(other).map(x => x.schemaName)).toContain(r.schemaName);
      }
    }
    expect(demoManyToMany("account").map(r => r.schemaName)).toContain("accountleads_association");
    expect(demoManyToMany("contact").map(r => r.schemaName)).toContain("listcontact_association");
  });

  it("unknown tables have no demo metadata (the Metadata demo's schema diff relies on it)", () => {
    expect(demoFields("new_sapcredit")).toBeNull();
    expect(demoLookups("new_sapcredit")).toEqual([]);
    expect(demoManyToMany("new_sapcredit")).toEqual([]);
  });

  it("hands out fresh arrays (a caller sorting or mutating them can't corrupt the next call)", () => {
    const a = demoFields("contact"); a[0].logical = "x"; a.reverse();
    expect(demoFields("contact")[0].logical).toBe("contactid");
    const l = demoLookups("account"); l.pop();
    expect(demoLookups("account").length).toBe(3);
  });
});
