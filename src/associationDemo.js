// Demo org for Data Loader › N:N tables (teammembership: systemuser ⟷ team) — PURE, unit-tested.
//
// The users and teams a file's values resolve against — by GUID, or through a text column: a
// user's email (internalemailaddress, domainname) or full name, a team's name — and the
// memberships that already exist, so a run reports "already linked" exactly where the live path
// does. Every pair goes through the live path's own outcome rules (associationUtils.js
// classifyAssociationOutcome) with the answer Dataverse gives: 204 when the link is made, a
// duplicate-key refusal ("A record with matching key values already exists.") for a link that is
// already there, "<table> With Id = <guid> Does Not Exist" for a GUID that isn't a demo record.
// State (the links) lives for the page load: a rollback really removes what the run added.
import { classifyAssociationOutcome, normGuid } from "./associationUtils.js";

export const DEMO_TEAM_USERS = [
  { systemuserid: "6f1c2a10-3b4d-4e5f-8a91-0c2d3e4f5a61", fullname: "Marie Martin", internalemailaddress: "marie@contoso.com", domainname: "marie@contoso.com", title: "Sales Manager" },
  { systemuserid: "7a2d3b21-4c5e-4f60-9ba2-1d3e4f5a6b72", fullname: "Alex Baker", internalemailaddress: "alex@contoso.com", domainname: "alex@contoso.com", title: "Sales Rep" },
  { systemuserid: "8b3e4c32-5d6f-4071-8cb3-2e4f5a6b7c83", fullname: "Sophie Lefevre", internalemailaddress: "sophie@contoso.com", domainname: "sophie@contoso.com", title: "Consultant" },
  { systemuserid: "9c4f5d43-6e70-4182-9dc4-3f5a6b7c8d94", fullname: "Lucas Moreau", internalemailaddress: "lucas@contoso.com", domainname: "lucas@contoso.com", title: "Analyst" },
  { systemuserid: "ad506e54-7f81-4293-aed5-4a6b7c8d9ea5", fullname: "Pierre Bernard", internalemailaddress: "pierre@contoso.com", domainname: "pierre@contoso.com", title: "System Admin" },
  { systemuserid: "be617f65-8092-43a4-bfe6-5b7c8d9eafb6", fullname: "Zakaria Missoum", internalemailaddress: "zakaria@contoso.com", domainname: "zakaria@contoso.com", title: "CRM Admin" },
];
export const DEMO_TEAMS = [
  { teamid: "1e2f3a4b-5c6d-4e7f-8091-a2b3c4d5e6f1", name: "Sales Managers" },
  { teamid: "2f3a4b5c-6d7e-4f80-91a2-b3c4d5e6f7a2", name: "Key Accounts" },
  { teamid: "3a4b5c6d-7e8f-4091-a2b3-c4d5e6f7a8b3", name: "Support Tier 2" },
];
// The memberships the demo org starts with: Marie in Sales Managers, Sophie in Key Accounts.
export const DEMO_MEMBERSHIPS = [
  ["6f1c2a10-3b4d-4e5f-8a91-0c2d3e4f5a61", "1e2f3a4b-5c6d-4e7f-8091-a2b3c4d5e6f1"],
  ["8b3e4c32-5d6f-4071-8cb3-2e4f5a6b7c83", "2f3a4b5c-6d7e-4f80-91a2-b3c4d5e6f7a2"],
];

const TABLES = {
  systemuser: { set: "systemusers", pk: "systemuserid", rows: DEMO_TEAM_USERS },
  team: { set: "teams", pk: "teamid", rows: DEMO_TEAMS },
};
const tableOfSet = (set) => Object.keys(TABLES).find(t => TABLES[t].set === set) || null;

export function createAssociationDemo() {
  const links = new Set(DEMO_MEMBERSHIPS.map(([u, t]) => `${u}|${t}`));
  const exists = (table, id) => !!TABLES[table]?.rows.some(r => r[TABLES[table].pk] === normGuid(id));
  return {
    // The records of `table` whose `field` equals one of `values` (case-insensitive, as Dataverse
    // compares text) — what the live path reads with an OR filter: [{ [field], [pk] }].
    lookup(table, field, values) {
      const t = TABLES[table];
      if (!t) return [];
      const want = new Set((values || []).map(v => String(v).trim().toLowerCase()));
      return t.rows.filter(r => r[field] != null && want.has(String(r[field]).trim().toLowerCase())).map(r => ({ [field]: r[field], [t.pk]: r[t.pk] }));
    },
    // The bridge's batchAssociate on the demo org: same result shape as the live action
    // ({ done, already, errors, log }), rows numbered from 1 in `items`.
    associate({ set1, set2 }, items, mode) {
      const removing = mode === "remove";
      const t1 = tableOfSet(set1), t2 = tableOfSet(set2);
      const out = { done: 0, already: 0, errors: [], log: [] };
      (items || []).forEach((it, i) => {
        const row = i + 1, id1 = normGuid(it.id1), id2 = normGuid(it.id2), key = `${id1}|${id2}`;
        let status, msg = "";
        if (t1 && !exists(t1, id1)) { status = 404; msg = `${t1} With Id = ${id1} Does Not Exist`; }
        else if (t2 && !exists(t2, id2)) { status = 404; msg = `${t2} With Id = ${id2} Does Not Exist`; }
        else if (!removing && links.has(key)) { status = 400; msg = "A record with matching key values already exists."; }
        else if (removing && !links.has(key)) { status = 404; msg = "No association between these records."; }
        else { status = 204; if (removing) links.delete(key); else links.add(key); }
        const c = classifyAssociationOutcome(status, msg, removing);
        if (!c) { out.errors.push({ row, msg, payload: "" }); out.log.push({ row, status: "ERROR", msg }); return; }
        out.log.push({ row, ...c });
        if (c.already) out.already++; else out.done++;
      });
      return out;
    },
    isLinked: (id1, id2) => links.has(`${normGuid(id1)}|${normGuid(id2)}`),
  };
}

// One demo org per page load (the bridge's associations and the Loader's lookups share it).
let demo = null;
export const demoAssociation = () => demo || (demo = createAssociationDemo());
