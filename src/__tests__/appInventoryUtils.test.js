import { describe, it, expect } from "vitest";
import { buildAppInventory, buildReverseIndex, deriveAppDependencies } from "../appInventoryUtils.js";

// Fixture mirrors the documented reference scenario: Sales Hub explicitly registers ONE Account
// form (⇒ NOT include-all forms) but no Account view (⇒ include-all views); Service Hub registers
// the Account entity + ONE Account view (⇒ include-all forms, NOT include-all views).
const APPS = [
  { id: "app1", uid: "uidS", name: "Sales Hub", uniqueName: "sales" },
  { id: "app2", uid: "uidV", name: "Service Hub", uniqueName: "service" },
  { id: "app3", uid: "uidX", name: "  ", uniqueName: "internal" }, // blank display name → dropped
];
const ENTITIES = [{ metadataId: "meta-account", logical: "account", display: "Account" }];
const FORMS = [
  { id: "f-main", name: "Account Main", entity: "account", type: 2 },
  { id: "f-qc", name: "Account Quick Create", entity: "account", type: 7 },
];
const VIEWS = [
  { id: "v-active", name: "Active Accounts", entity: "account" },
  { id: "v-my", name: "My Accounts", entity: "account" },
];
const COMPONENTS = [
  { objectId: "meta-account", componentType: 1, appUid: "uidS" },
  { objectId: "f-main", componentType: 60, appUid: "uidS" },       // Sales Hub: explicit form
  { objectId: "meta-account", componentType: 1, appUid: "uidV" },
  { objectId: "v-active", componentType: 26, appUid: "uidV" },      // Service Hub: explicit view
  { objectId: "meta-account", componentType: 1, appUid: "uidX" },   // nameless app — must be ignored
];
const ACTIONS = [
  { id: "a-recalc", name: "recalc", label: "Recalculate", contextValue: "account", appId: "app1" },  // app-specific
  { id: "a-mail", name: "mail", label: "Send Email", contextValue: "account", appId: "" },           // entity-global
  { id: "a-new", name: "new", label: "New", contextValue: "", appId: "" },                            // table-generic template
];

const inv = () => buildAppInventory({ apps: APPS, components: COMPONENTS, forms: FORMS, views: VIEWS, entities: ENTITIES, actions: ACTIONS });

describe("buildAppInventory — include-all inference", () => {
  it("drops apps with blank display names (and their components)", () => {
    const r = inv();
    expect(r.apps.map(a => a.uid)).toEqual(["uidS", "uidV"]);
    expect(r.byApp.uidX).toBeUndefined();
  });

  it("explicit form registration disables include-all FORMS for that app only", () => {
    const r = inv();
    const sales = r.byApp.uidS.tables.find(t => t.entity === "account");
    expect(sales.includeAllForms).toBe(false);
    expect(sales.forms.map(f => f.name)).toEqual(["Account Main"]);
    expect(sales.forms[0].inclusion).toBe("EXPLICIT");
    const service = r.byApp.uidV.tables.find(t => t.entity === "account");
    expect(service.includeAllForms).toBe(true);
    expect(service.forms.map(f => f.name).sort()).toEqual(["Account Main", "Account Quick Create"]);
    expect(service.forms.every(f => f.inclusion === "IMPLICIT")).toBe(true);
  });

  it("forms and views are gated INDEPENDENTLY", () => {
    const r = inv();
    const sales = r.byApp.uidS.tables.find(t => t.entity === "account");
    expect(sales.includeAllViews).toBe(true);   // explicit form but NO explicit view
    expect(sales.views.map(v => v.name).sort()).toEqual(["Active Accounts", "My Accounts"]);
    const service = r.byApp.uidV.tables.find(t => t.entity === "account");
    expect(service.includeAllViews).toBe(false);
    expect(service.views.map(v => v.name)).toEqual(["Active Accounts"]);
    expect(service.views[0].inclusion).toBe("EXPLICIT");
  });

  it("classifies the three appaction scopes per the reference table", () => {
    const r = inv();
    const salesActs = r.byApp.uidS.actions.map(a => `${a.label}:${a.inclusion}`).sort();
    const serviceActs = r.byApp.uidV.actions.map(a => `${a.label}:${a.inclusion}`).sort();
    expect(salesActs).toEqual(["New:IMPLICIT", "Recalculate:EXPLICIT", "Send Email:IMPLICIT"]);
    expect(serviceActs).toEqual(["New:IMPLICIT", "Send Email:IMPLICIT"]); // Recalculate is app1-only
  });

  it("flat rows carry one Entity row per table+app and the exact doc scenario", () => {
    const r = inv();
    const ent = r.rows.filter(x => x.componentType === "Entity");
    expect(ent).toHaveLength(2); // account × 2 real apps
    const mainRows = r.rows.filter(x => x.objectId === "f-main");
    expect(mainRows.map(x => `${x.appName}:${x.inclusion}`).sort())
      .toEqual(["Sales Hub:EXPLICIT", "Service Hub:IMPLICIT"]);
  });
});

describe("buildReverseIndex", () => {
  it("answers 'which apps expose this component?'", () => {
    const idx = buildReverseIndex(inv().rows);
    const main = idx.get("f-main");
    expect(main.apps.map(a => a.appName).sort()).toEqual(["Sales Hub", "Service Hub"]);
    const recalc = idx.get("a-recalc");
    expect(recalc.apps.map(a => a.appName)).toEqual(["Sales Hub"]);
  });
});

describe("deriveAppDependencies", () => {
  const EDGES = [
    { requiredId: "attr-currency", requiredType: 2, dependentId: "f-main", dependentType: 60 },
    { requiredId: "attr-currency", requiredType: 2, dependentId: "f-qc", dependentType: 60 },
    { requiredId: "os-status", requiredType: 9, dependentId: "v-active", dependentType: 26 },
    { requiredId: "meta-account", requiredType: 1, dependentId: "f-main", dependentType: 60 }, // entity → skipped (inventoried directly)
    { requiredId: "attr-foreign", requiredType: 2, dependentId: "f-unknown", dependentType: 60 }, // form not in this app → skipped
  ];

  it("unions dependencies over the app's in-scope forms/views and skips direct types", () => {
    const r = inv();
    const names = new Map([["attr-currency", { logical: "transactioncurrencyid", entity: "account" }]]);
    const dService = deriveAppDependencies(EDGES, r.byApp.uidV, names);
    // Service Hub is include-all forms (both forms in scope) + explicit Active Accounts view
    expect(dService.attributes).toHaveLength(1);
    expect(dService.attributes[0].logical).toBe("transactioncurrencyid");
    expect(dService.attributes[0].via).toEqual(["Account Main (form)", "Account Quick Create (form)"]);
    expect(dService.optionSets).toHaveLength(1);
    expect(dService.optionSets[0].via).toEqual(["Active Accounts (view)"]);
    expect(dService.relationships).toHaveLength(0);
  });

  it("a view outside the app's scope contributes nothing", () => {
    const r = inv();
    const dSales = deriveAppDependencies([{ requiredId: "os-x", requiredType: 9, dependentId: "v-nope", dependentType: 26 }], r.byApp.uidS);
    expect(dSales.optionSets).toHaveLength(0);
  });
});
