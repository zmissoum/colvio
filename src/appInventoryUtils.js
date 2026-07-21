// App-inventory logic — PURE functions, no I/O, fully unit-tested.
//
// The problem this solves: Dataverse stores a model-driven app's components in
// appmodulecomponent, BUT "include all forms/views" does not materialize components and no flag
// says a table is include-all. It must be INFERRED: a registered table (type-1 component) with no
// explicit form components (type 60) in that app includes ALL its forms — same, independently,
// for views (type 26). Modern commands (appaction) scope three ways: app-specific, entity-global,
// or table-generic templates that surface in every app.

// componenttype codes (same enumeration as solutioncomponent)
export const CT_ENTITY = 1, CT_VIEW = 26, CT_FORM = 60;

/**
 * Build the full inventory.
 * @param apps      [{id, uid, name, uniqueName}]           — blank/whitespace names are dropped
 * @param components[{objectId, componentType, appUid}]     — types 1/26/60 only
 * @param forms     [{id, name, entity, type, typeLabel}]
 * @param views     [{id, name, entity}]
 * @param entities  [{metadataId, logical, display}]        — MetadataId ↔ type-1 objectId
 * @param actions   [{id, name, label, contextValue, appId}] — appId = appmoduleid (NOT uid)
 * @returns {apps, byApp: {uid: {app, tables:[...], actions:[...]}}, rows: flat inventory}
 */
export function buildAppInventory({ apps = [], components = [], forms = [], views = [], entities = [], actions = [] }) {
  const realApps = apps.filter(a => a && String(a.name || "").trim() !== "");
  const appByUid = new Map(realApps.map(a => [a.uid, a]));
  const appById = new Map(realApps.map(a => [a.id, a]));

  const formById = new Map(forms.map(f => [f.id, f]));
  const viewById = new Map(views.map(v => [v.id, v]));
  const entityByMeta = new Map(entities.map(e => [e.metadataId, e]));
  const formsByEntity = groupBy(forms, f => f.entity);
  const viewsByEntity = groupBy(views, v => v.entity);

  // Pass 1 — read the explicit registrations per app.
  const tablesByApp = new Map();        // appUid -> Set(entity logical)
  const explicitForms = new Map();      // `${appUid}|${entity}` -> [form]
  const explicitViews = new Map();      // `${appUid}|${entity}` -> [view]
  for (const c of components) {
    if (!appByUid.has(c.appUid)) continue; // component of a nameless/unknown app
    if (c.componentType === CT_ENTITY) {
      const ent = entityByMeta.get(c.objectId);
      if (ent) getSet(tablesByApp, c.appUid).add(ent.logical);
    } else if (c.componentType === CT_FORM) {
      const f = formById.get(c.objectId);
      if (f) { getArr(explicitForms, `${c.appUid}|${f.entity}`).push(f); getSet(tablesByApp, c.appUid).add(f.entity); }
    } else if (c.componentType === CT_VIEW) {
      const v = viewById.get(c.objectId);
      if (v) { getArr(explicitViews, `${c.appUid}|${v.entity}`).push(v); getSet(tablesByApp, c.appUid).add(v.entity); }
    }
  }

  // Pass 2 — resolve include-all per app|table, independently for forms and views.
  const byApp = {};
  const rows = [];
  for (const app of realApps) {
    const tables = [...(tablesByApp.get(app.uid) || [])].sort();
    const tableEntries = tables.map(entity => {
      const exF = explicitForms.get(`${app.uid}|${entity}`) || [];
      const exV = explicitViews.get(`${app.uid}|${entity}`) || [];
      const includeAllForms = exF.length === 0;
      const includeAllViews = exV.length === 0;
      const fList = (includeAllForms ? (formsByEntity.get(entity) || []) : exF)
        .map(f => ({ id: f.id, name: f.name, type: f.type, typeLabel: f.typeLabel || "", inclusion: includeAllForms ? "IMPLICIT" : "EXPLICIT" }));
      const vList = (includeAllViews ? (viewsByEntity.get(entity) || []) : exV)
        .map(v => ({ id: v.id, name: v.name, inclusion: includeAllViews ? "IMPLICIT" : "EXPLICIT" }));
      rows.push({ objectId: entity, componentType: "Entity", name: entity, entity, appName: app.name, appUid: app.uid, inclusion: "EXPLICIT" });
      for (const f of fList) rows.push({ objectId: f.id, componentType: "Form", name: f.name, entity, appName: app.name, appUid: app.uid, inclusion: f.inclusion });
      for (const v of vList) rows.push({ objectId: v.id, componentType: "View", name: v.name, entity, appName: app.name, appUid: app.uid, inclusion: v.inclusion });
      return { entity, includeAllForms, includeAllViews, forms: fList, views: vList };
    });
    byApp[app.uid] = { app, tables: tableEntries, actions: [] };
  }

  // Pass 3 — modern commands, three scopes.
  for (const a of actions) {
    if (a.appId && appById.has(a.appId)) {
      // App-specific: exactly one app.
      const app = appById.get(a.appId);
      byApp[app.uid].actions.push({ ...a, inclusion: "EXPLICIT" });
      rows.push({ objectId: a.id, componentType: "AppAction", name: a.label, entity: a.contextValue, appName: app.name, appUid: app.uid, inclusion: "EXPLICIT" });
    } else if (!a.appId && a.contextValue) {
      // Entity-global: every app that surfaces the context entity.
      for (const app of realApps) {
        if ((tablesByApp.get(app.uid) || new Set()).has(a.contextValue)) {
          byApp[app.uid].actions.push({ ...a, inclusion: "IMPLICIT" });
          rows.push({ objectId: a.id, componentType: "AppAction", name: a.label, entity: a.contextValue, appName: app.name, appUid: app.uid, inclusion: "IMPLICIT" });
        }
      }
    } else if (!a.appId) {
      // Table-generic template ({!EntityLogicalName} — New, Save, Export…): every app, entity blank.
      for (const app of realApps) {
        byApp[app.uid].actions.push({ ...a, inclusion: "IMPLICIT" });
        rows.push({ objectId: a.id, componentType: "AppAction", name: a.label, entity: "", appName: app.name, appUid: app.uid, inclusion: "IMPLICIT" });
      }
    }
    // a.appId referencing an unknown/nameless app: dropped (its app was filtered out).
  }

  return { apps: realApps, byApp, rows };
}

/**
 * Reverse lens: which apps expose a given component? Built from the flat rows.
 * @returns Map objectId -> {componentType, name, entity, apps: [{appName, inclusion}]}
 */
export function buildReverseIndex(rows) {
  const idx = new Map();
  for (const r of rows) {
    let e = idx.get(r.objectId);
    if (!e) { e = { objectId: r.objectId, componentType: r.componentType, name: r.name, entity: r.entity, apps: [] }; idx.set(r.objectId, e); }
    e.apps.push({ appName: r.appName, inclusion: r.inclusion });
  }
  return idx;
}

/**
 * Dependency-derived components for ONE app: attributes (2) / option sets (9) / relationships (10)
 * required by the app's in-scope forms and views. Required components that are themselves
 * Form/View/Entity are skipped — they are inventoried directly.
 * @param edges [{requiredId, requiredType, dependentId, dependentType}]
 * @param appEntry byApp[uid] — supplies the app's form/view ids
 * @param attrNameByMetaId Map attributeMetadataId -> {logical, entity} (best-effort resolution)
 * @returns {attributes:[{id,logical,entity,via}], optionSets:[{id,via}], relationships:[{id,via}]}
 */
export function deriveAppDependencies(edges, appEntry, attrNameByMetaId = new Map()) {
  const formIds = new Set(), viewIds = new Set();
  const depName = new Map(); // dependentId -> label for the "via" list
  for (const t of appEntry.tables) {
    for (const f of t.forms) { formIds.add(f.id); depName.set(f.id, `${f.name} (form)`); }
    for (const v of t.views) { viewIds.add(v.id); depName.set(v.id, `${v.name} (view)`); }
  }
  const acc = new Map(); // requiredId -> {requiredType, via:Set}
  for (const e of edges) {
    if (e.requiredType === CT_ENTITY || e.requiredType === CT_VIEW || e.requiredType === CT_FORM) continue;
    if (!(e.dependentType === CT_FORM ? formIds.has(e.dependentId) : e.dependentType === CT_VIEW ? viewIds.has(e.dependentId) : false)) continue;
    let a = acc.get(e.requiredId);
    if (!a) { a = { requiredType: e.requiredType, via: new Set() }; acc.set(e.requiredId, a); }
    a.via.add(depName.get(e.dependentId) || e.dependentId);
  }
  const attributes = [], optionSets = [], relationships = [];
  for (const [id, a] of acc) {
    const via = [...a.via].sort();
    if (a.requiredType === 2) {
      const n = attrNameByMetaId.get(id);
      attributes.push({ id, logical: n?.logical || "", entity: n?.entity || "", via });
    } else if (a.requiredType === 9) optionSets.push({ id, via });
    else if (a.requiredType === 10) relationships.push({ id, via });
  }
  attributes.sort((x, y) => (x.entity + x.logical).localeCompare(y.entity + y.logical));
  return { attributes, optionSets, relationships };
}

const groupBy = (arr, key) => { const m = new Map(); for (const x of arr) { const k = key(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); } return m; };
const getSet = (map, k) => { let s = map.get(k); if (!s) { s = new Set(); map.set(k, s); } return s; };
const getArr = (map, k) => { let a = map.get(k); if (!a) { a = []; map.set(k, a); } return a; };
