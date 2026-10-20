// Demo answers of Dataverse's dependency check (Metadata › 🧨 Delete impact / where used), in the
// shape the live content script returns: raw dependency rows + names by "type|id".
import { normalizeDeps } from "./deleteImpact.js";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const TARGET = id(1);
const dep = (type, n, { dt = 2, rt, rn } = {}) => ({
  dependentcomponenttype: type, dependentcomponentobjectid: id(n), dependencytype: dt,
  requiredcomponenttype: rt ?? 2, requiredcomponentobjectid: rn ? id(rn) : TARGET,
});

// new_sapid — a custom column wired into a SAP integration: the rich case
const SAP = {
  deps: [dep(60, 101), dep(26, 102), dep(26, 103), dep(29, 104), dep(29, 105), dep(92, 106), dep(93, 107), dep(47, 108), dep(14, 109)],
  names: {
    [`60|${id(101)}`]: { name: "Account", table: "account", formType: 2 },
    [`26|${id(102)}`]: { name: "Active Accounts", table: "account" },
    [`26|${id(103)}`]: { name: "SAP sync errors", table: "account" },
    [`29|${id(104)}`]: { name: "Lock SAP ID once synced", table: "account", category: 2, detail: "active" },
    [`29|${id(105)}`]: { name: "Push new accounts to SAP", table: "account", category: 5, detail: "active" },
    [`92|${id(106)}`]: { name: "SapConnector.AccountSync: Update of account" },
    [`93|${id(107)}`]: { name: "PreImage", detail: "step SapConnector.AccountSync: Update of account" },
    [`47|${id(108)}`]: { name: "new_sapid → new_sapid" },
    [`14|${id(109)}`]: { name: "SAP ID key", table: "account", detail: "new_sapidkey" },
  },
};

// account — the table: lookups and screens of OTHER tables point at it
const TABLE = {
  deps: [
    dep(10, 201, { rt: 1 }), dep(2, 202, { rt: 1 }), dep(60, 203, { rt: 2, rn: 290 }), dep(26, 204, { rt: 2, rn: 290 }),
    dep(80, 205, { rt: 1 }), dep(62, 206, { rt: 1 }), dep(29, 207, { rt: 1 }), dep(59, 208, { rt: 1, dt: 4 }),
  ],
  names: {
    [`10|${id(201)}`]: { name: "contact_customer_accounts" },
    [`2|${id(202)}`]: { name: "Company Name", table: "contact", detail: "parentcustomerid" },
    [`2|${id(290)}`]: { name: "Account Name", table: "account", detail: "name" },
    [`60|${id(203)}`]: { name: "Contact", table: "contact", formType: 2 },
    [`26|${id(204)}`]: { name: "Contacts with their account", table: "contact" },
    [`80|${id(205)}`]: { name: "Sales Hub" },
    [`62|${id(206)}`]: { name: "Sales Hub" },
    [`29|${id(207)}`]: { name: "Weekly account digest", category: 5, detail: "active" },
    [`59|${id(208)}`]: { name: "Accounts by industry", table: "account" },
  },
};
// what the table's own parts look like in "used" mode (removed with it)
const TABLE_OWN = {
  deps: [dep(60, 301, { rt: 1, dt: 1 }), dep(26, 302, { rt: 1, dt: 1 }), dep(26, 303, { rt: 1, dt: 1 }), dep(2, 304, { rt: 1, dt: 1 })],
  names: {
    [`60|${id(301)}`]: { name: "Account", table: "account", formType: 2 },
    [`26|${id(302)}`]: { name: "Active Accounts", table: "account" },
    [`26|${id(303)}`]: { name: "My Active Accounts", table: "account" },
    [`2|${id(304)}`]: { name: "Account Name", table: "account", detail: "name" },
  },
};

const GENERIC = {
  deps: [dep(60, 401), dep(26, 402)],
  names: {
    [`60|${id(401)}`]: { name: "Account", table: "account", formType: 2 },
    [`26|${id(402)}`]: { name: "Active Accounts", table: "account" },
  },
};

export function demoComponentDependencies({ componentType, mode = "delete", logicalName }) {
  let set;
  if (Number(componentType) === 1) {
    set = mode === "used" ? { deps: [...TABLE.deps, ...TABLE_OWN.deps], names: { ...TABLE.names, ...TABLE_OWN.names } } : TABLE;
  } else if (logicalName === "new_sapid") set = SAP;
  else if (logicalName === "new_siretcode") set = { deps: [], names: {} };
  else set = GENERIC;
  return { deps: normalizeDeps(set.deps), names: set.names, targetId: TARGET };
}
