// Demo-mode table metadata for the Schema (ERD) module: columns, N:1 lookups and N:N per table, in
// the shapes content.js returns live (getFields / getLookups / getManyToManyRelationships). Pure:
// no React, no DOM, no network. A table not listed here has no demo metadata (null columns, no
// relationships) — the Metadata demo's schema diff counts on new_sapcredit staying unknown.
import { FLDS } from "./shared.jsx";

const REF_TYPES = new Set(["Lookup", "Customer", "Owner"]);

// Columns: [logical, display, type, flags] — flags: k = primary id, r = required, c = custom.
// Lookups: [column, target table, relationship schema name, navigation property]. Self-references
// (parent account, manager, parent business unit…) are left out: the ERD draws a self-edge as a
// curve through its own card, which reads as a glitch on the demo canvas.
const TABLES = {
  account: {
    // The demo org's account columns (Explorer, Metadata, Loader…), lookups as _<name>_value there.
    fields: FLDS.map(f => [f.l.replace(/^_(.+)_value$/, "$1"), f.d, f.t, (f.l === "accountid" ? "k" : "") + (f.req ? "r" : "") + (f.cust ? "c" : "")]),
    lookups: [
      ["primarycontactid", "contact", "account_primary_contact", "primarycontactid"],
      ["ownerid", "systemuser", "owner_accounts", "ownerid"],
      ["transactioncurrencyid", "transactioncurrency", "transactioncurrency_account", "transactioncurrencyid"],
    ],
  },
  contact: {
    fields: [
      ["contactid", "Contact", "Uniqueidentifier", "k"],
      ["fullname", "Full Name", "String"],
      ["firstname", "First Name", "String"],
      ["lastname", "Last Name", "String", "r"],
      ["jobtitle", "Job Title", "String"],
      ["emailaddress1", "Email", "String"],
      ["telephone1", "Business Phone", "String"],
      ["preferredcontactmethodcode", "Preferred Method of Contact", "Picklist"],
      ["new_linkedinurl", "LinkedIn Profile", "String", "c"],
      ["parentcustomerid", "Company Name", "Customer"],
      ["ownerid", "Owner", "Owner", "r"],
      ["transactioncurrencyid", "Currency", "Lookup"],
      ["statecode", "Status", "State", "r"],
      ["createdon", "Created On", "DateTime"],
    ],
    lookups: [
      ["parentcustomerid", "account", "contact_customer_accounts", "parentcustomerid_account"],
      ["ownerid", "systemuser", "owner_contacts", "ownerid"],
      ["transactioncurrencyid", "transactioncurrency", "transactioncurrency_contact", "transactioncurrencyid"],
    ],
  },
  opportunity: {
    fields: [
      ["opportunityid", "Opportunity", "Uniqueidentifier", "k"],
      ["name", "Topic", "String", "r"],
      ["customerid", "Potential Customer", "Customer"],
      ["originatingleadid", "Originating Lead", "Lookup"],
      ["ownerid", "Owner", "Owner", "r"],
      ["transactioncurrencyid", "Currency", "Lookup"],
      ["estimatedvalue", "Est. Revenue", "Money"],
      ["estimatedclosedate", "Est. Close Date", "DateTime"],
      ["closeprobability", "Probability", "Integer"],
      ["salesstagecode", "Sales Stage", "Picklist"],
      ["new_partnerinvolved", "Partner Involved", "Boolean", "c"],
      ["statecode", "Status", "State", "r"],
      ["createdon", "Created On", "DateTime"],
    ],
    lookups: [
      ["customerid", "account", "opportunity_customer_accounts", "customerid_account"],
      ["customerid", "contact", "opportunity_customer_contacts", "customerid_contact"],
      ["originatingleadid", "lead", "opportunity_originating_lead", "originatingleadid"],
      ["ownerid", "systemuser", "owner_opportunitys", "ownerid"],
      ["transactioncurrencyid", "transactioncurrency", "transactioncurrency_opportunity", "transactioncurrencyid"],
    ],
  },
  lead: {
    fields: [
      ["leadid", "Lead", "Uniqueidentifier", "k"],
      ["subject", "Topic", "String", "r"],
      ["firstname", "First Name", "String"],
      ["lastname", "Last Name", "String", "r"],
      ["companyname", "Company Name", "String"],
      ["emailaddress1", "Email", "String"],
      ["telephone1", "Business Phone", "String"],
      ["leadsourcecode", "Lead Source", "Picklist"],
      ["estimatedvalue", "Est. Value", "Money"],
      ["parentaccountid", "Existing Account", "Lookup"],
      ["parentcontactid", "Existing Contact", "Lookup"],
      ["qualifyingopportunityid", "Qualifying Opportunity", "Lookup"],
      ["ownerid", "Owner", "Owner", "r"],
      ["statecode", "Status", "State", "r"],
    ],
    lookups: [
      ["parentaccountid", "account", "lead_parent_account", "parentaccountid"],
      ["parentcontactid", "contact", "lead_parent_contact", "parentcontactid"],
      ["qualifyingopportunityid", "opportunity", "lead_qualifying_opportunity", "qualifyingopportunityid"],
      ["ownerid", "systemuser", "owner_leads", "ownerid"],
    ],
  },
  incident: {
    fields: [
      ["incidentid", "Case", "Uniqueidentifier", "k"],
      ["title", "Case Title", "String", "r"],
      ["ticketnumber", "Case Number", "String"],
      ["customerid", "Customer", "Customer", "r"],
      ["primarycontactid", "Contact", "Lookup"],
      ["ownerid", "Owner", "Owner", "r"],
      ["prioritycode", "Priority", "Picklist"],
      ["caseorigincode", "Origin", "Picklist"],
      ["casetypecode", "Case Type", "Picklist"],
      ["description", "Description", "Memo"],
      ["new_slabreached", "SLA Breached", "Boolean", "c"],
      ["statecode", "Status", "State", "r"],
      ["createdon", "Created On", "DateTime"],
    ],
    lookups: [
      ["customerid", "account", "incident_customer_accounts", "customerid_account"],
      ["customerid", "contact", "incident_customer_contacts", "customerid_contact"],
      ["primarycontactid", "contact", "contact_as_primary_contact", "primarycontactid"],
      ["ownerid", "systemuser", "owner_incidents", "ownerid"],
    ],
  },
  systemuser: {
    fields: [
      ["systemuserid", "User", "Uniqueidentifier", "k"],
      ["fullname", "Full Name", "String"],
      ["domainname", "User Name", "String", "r"],
      ["internalemailaddress", "Primary Email", "String"],
      ["title", "Title", "String"],
      ["businessunitid", "Business Unit", "Lookup", "r"],
      ["parentsystemuserid", "Manager", "Lookup"],
      ["accessmode", "Access Mode", "Picklist", "r"],
      ["isdisabled", "Status", "Boolean"],
      ["azureactivedirectoryobjectid", "Entra ID Object ID", "Uniqueidentifier"],
      ["createdon", "Created On", "DateTime"],
    ],
    lookups: [
      ["businessunitid", "businessunit", "business_unit_system_users", "businessunitid"],
    ],
  },
  team: {
    fields: [
      ["teamid", "Team", "Uniqueidentifier", "k"],
      ["name", "Team Name", "String", "r"],
      ["teamtype", "Team Type", "Picklist", "r"],
      ["businessunitid", "Business Unit", "Lookup", "r"],
      ["administratorid", "Administrator", "Lookup", "r"],
      ["azureactivedirectoryobjectid", "Entra ID Object ID", "Uniqueidentifier"],
      ["isdefault", "Is Default", "Boolean"],
      ["createdon", "Created On", "DateTime"],
    ],
    lookups: [
      ["businessunitid", "businessunit", "business_unit_teams", "businessunitid"],
      ["administratorid", "systemuser", "lk_teambase_administratorid", "administratorid"],
    ],
  },
  businessunit: {
    fields: [
      ["businessunitid", "Business Unit", "Uniqueidentifier", "k"],
      ["name", "Name", "String", "r"],
      ["parentbusinessunitid", "Parent Business", "Lookup"],
      ["divisionname", "Division", "String"],
      ["websiteurl", "Website", "String"],
      ["isdisabled", "Is Disabled", "Boolean"],
      ["createdon", "Created On", "DateTime"],
    ],
    lookups: [],
  },
  list: {
    fields: [
      ["listid", "Marketing List", "Uniqueidentifier", "k"],
      ["listname", "Name", "String", "r"],
      ["type", "Type", "Boolean", "r"],
      ["createdfromcode", "Targeted At", "Picklist", "r"],
      ["membercount", "Members Count", "Integer"],
      ["purpose", "Purpose", "Memo"],
      ["lastusedon", "Last Used On", "DateTime"],
      ["ownerid", "Owner", "Owner", "r"],
      ["transactioncurrencyid", "Currency", "Lookup"],
      ["statecode", "Status", "State", "r"],
    ],
    lookups: [
      ["ownerid", "systemuser", "owner_lists", "ownerid"],
      ["transactioncurrencyid", "transactioncurrency", "transactioncurrency_list", "transactioncurrencyid"],
    ],
  },
  transactioncurrency: {
    fields: [
      ["transactioncurrencyid", "Currency", "Uniqueidentifier", "k"],
      ["currencyname", "Currency Name", "String", "r"],
      ["isocurrencycode", "Currency Code", "String", "r"],
      ["currencysymbol", "Currency Symbol", "String", "r"],
      ["exchangerate", "Exchange Rate", "Decimal", "r"],
      ["currencyprecision", "Currency Precision", "Integer", "r"],
      ["statecode", "Status", "State", "r"],
    ],
    lookups: [],
  },
};

// [schema name, entity1, entity2, intersect table]
const MANY_TO_MANY = [
  ["accountleads_association", "account", "lead", "accountleads"],
  ["contactleads_association", "contact", "lead", "contactleads"],
  ["listaccount_association", "list", "account", "listaccount"],
  ["listcontact_association", "list", "contact", "listcontact"],
  ["listlead_association", "list", "lead", "listlead"],
  ["teammembership_association", "systemuser", "team", "teammembership"],
];

export const DEMO_SCHEMA_TABLES = Object.keys(TABLES);

export function demoFields(logicalName) {
  const t = TABLES[logicalName];
  if (!t) return null;
  return t.fields.map(([logical, display, type, flags = ""]) => ({
    logical,
    odataName: REF_TYPES.has(type) ? `_${logical}_value` : logical,
    display,
    type,
    isPrimaryId: flags.includes("k"),
    metadataId: null,
    isCustom: flags.includes("c"),
    required: flags.includes("r"),
    validForCreate: true,
    validForUpdate: !flags.includes("k"),
    maxLength: null,
    format: null,
  }));
}

export function demoLookups(logicalName) {
  return (TABLES[logicalName]?.lookups || []).map(([lookupField, targetEntity, schemaName, navProperty]) => ({
    lookupField, navProperty, targetEntity, targetEntitySet: schemaName, schemaName, type: "single",
  }));
}

export function demoManyToMany(logicalName) {
  return MANY_TO_MANY
    .filter(([, e1, e2]) => e1 === logicalName || e2 === logicalName)
    .map(([schemaName, entity1, entity2, intersectEntity]) => ({ schemaName, entity1, entity2, intersectEntity }));
}
