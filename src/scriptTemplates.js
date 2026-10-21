// Script Console templates — starting points, each a complete script. Names are i18n keys
// (script.tpl.<id>); the code is plain JavaScript run by the sandbox. Every template runs against
// the demo org (scriptDemo.test.js runs them all in dry run). sampleInput = the input file the
// template expects, used by the tests and offered in demo mode.

const PROPAGATE = `// Fill a lookup from a pivot table that shares another lookup with the row.
// Example: each user's sales code = the sales code whose sales organization is the user's.
// Only logical names below — entity sets and navigation properties are read from the metadata.
const TARGET = "systemuser";                 // table to update
const TARGET_SHARED = "new_salesorganizationid"; // lookup the row already has
const TARGET_LOOKUP = "new_salescodeid";     // lookup to fill
const PIVOT = "new_salescode";               // table holding the value to copy
const PIVOT_SHARED = "new_salesorganizationid";  // its lookup to the same table as TARGET_SHARED
const ONLY_EMPTY = true;                     // false = also overwrite a lookup already set
const CHUNK = 100;                           // writes per $batch

const target = await dv.entity(TARGET), pivot = await dv.entity(PIVOT);
const rels = await dv.get(\`EntityDefinitions(LogicalName='\${TARGET}')/ManyToOneRelationships?$select=ReferencingAttribute,ReferencingEntityNavigationPropertyName\`);
const nav = rels.value.find(r => r.ReferencingAttribute === TARGET_LOOKUP)?.ReferencingEntityNavigationPropertyName;
if (!nav) throw new Error(\`\${TARGET_LOOKUP} is not a lookup of \${TARGET}\`);

// pivot: shared value → pivot rows
const byShared = new Map();
for (const p of await dv.getAll(\`\${pivot.EntitySetName}?$select=\${pivot.PrimaryIdAttribute},_\${PIVOT_SHARED}_value\`)) {
  const k = p[\`_\${PIVOT_SHARED}_value\`];
  if (k) byShared.set(k, [...(byShared.get(k) || []), p[pivot.PrimaryIdAttribute]]);
}

const rows = await dv.getAll(\`\${target.EntitySetName}?$select=\${target.PrimaryIdAttribute},\${target.PrimaryNameAttribute},_\${TARGET_SHARED}_value,_\${TARGET_LOOKUP}_value\`);
const report = [], writes = [];
for (const r of rows) {
  const id = r[target.PrimaryIdAttribute], shared = r[\`_\${TARGET_SHARED}_value\`], current = r[\`_\${TARGET_LOOKUP}_value\`];
  const match = shared ? byShared.get(shared) || [] : [];
  const line = { id, name: r[target.PrimaryNameAttribute], status: "" };
  if (!shared) line.status = "skipped: no " + TARGET_SHARED;
  else if (!match.length) line.status = "skipped: no " + PIVOT + " for it";
  else if (match.length > 1) line.status = \`skipped: ambiguous (\${match.length} \${PIVOT})\`;
  else if (current === match[0]) line.status = "already right";
  else if (current && ONLY_EMPTY) line.status = "kept: already filled";
  else {
    line.status = "to update";
    writes.push({ line, op: { method: "PATCH", path: \`\${target.EntitySetName}(\${id})\`, headers: { "If-Match": "*" },
      body: { [\`\${nav}@odata.bind\`]: \`/\${pivot.EntitySetName}(\${match[0]})\` } } });
  }
  report.push(line);
}

for (let i = 0; i < writes.length; i += CHUNK) {
  const chunk = writes.slice(i, i + CHUNK);
  const res = await dv.batch(chunk.map(w => w.op), { atomic: false, continueOnError: true, throwOnError: false });
  res.forEach((r, j) => { chunk[j].line.status = r.ok ? (dv.dryRun ? "would update" : "updated") : "failed: " + (r.body?.error?.message || r.status); });
  progress(Math.min(i + CHUNK, writes.length), writes.length, "updates");
}

const count = {};
for (const l of report) { const k = l.status.split(":")[0]; count[k] = (count[k] || 0) + 1; }
log(count);
table(report, "Per row");
`;

const FROM_FILE = `// Update rows from the input file (CSV / Excel): one line per row.
// The key column finds the row; COLUMNS maps table columns ← file headers.
const TABLE = "account";
const KEY = { column: "accountnumber", header: "Account number" };
const COLUMNS = { telephone1: "Phone", address1_city: "City" };

if (!input.length) throw new Error("Load an input file first (Input file button)");
const t = await dv.entity(TABLE);
const report = [];
let n = 0;
for (const row of input) {
  progress(++n, input.length);
  const key = String(row[KEY.header] ?? "").trim();
  if (!key) { report.push({ key, status: "skipped: empty key" }); continue; }
  const found = await dv.get(\`\${t.EntitySetName}?$select=\${t.PrimaryIdAttribute}&$filter=\${KEY.column} eq '\${key.replace(/'/g, "''")}'&$top=2\`);
  if (found.value.length !== 1) { report.push({ key, status: found.value.length ? "skipped: several rows" : "skipped: not found" }); continue; }
  const data = {};
  for (const [col, header] of Object.entries(COLUMNS)) if (header in row) data[col] = row[header] === "" ? null : row[header];
  try {
    await dv.update(t.EntitySetName, found.value[0][t.PrimaryIdAttribute], data);
    report.push({ key, status: dv.dryRun ? "would update" : "updated" });
  } catch (e) { report.push({ key, status: "failed: " + e.message }); }
}
table(report, "Per line");
`;

const FETCH_DELETE = `// Delete every row a FetchXML returns (dry run first: the plan lists them).
const FETCH = \`
<fetch>
  <entity name="contact">
    <attribute name="fullname" />
    <filter>
      <condition attribute="lastname" operator="eq" value="Ruiz" />
    </filter>
  </entity>
</fetch>\`;

const t = await dv.entity(FETCH.match(/<entity\\s+name="([^"]+)"/)[1]);
const rows = await dv.fetchXml(FETCH);
log(rows.length, "row(s) matched");
table(rows.map(r => ({ id: r[t.PrimaryIdAttribute], name: r[t.PrimaryNameAttribute] })), "Matched");
let n = 0;
for (const r of rows) {
  await dv.delete(t.EntitySetName, r[t.PrimaryIdAttribute]);
  progress(++n, rows.length, "deleted");
}
`;

const BATCH_BYPASS = `// Bulk update through $batch, with headers on every request:
// here custom plug-ins and flows are bypassed (needs the bypass privilege in a real org).
const api = dv.withHeaders({ "MSCRM.BypassBusinessLogicExecution": "CustomSync,CustomAsync" });

const rows = await api.getAll("accounts?$select=accountid,name&$filter=address1_city eq 'Paris'");
const ops = rows.map(r => ({ method: "PATCH", path: \`accounts(\${r.accountid})\`, headers: { "If-Match": "*" }, body: { telephone1: "+33 1 00 00 00 00" } }));
for (let i = 0; i < ops.length; i += 500) {
  await api.batch(ops.slice(i, i + 500), { atomic: true });   // all or nothing per chunk
  progress(Math.min(i + 500, ops.length), ops.length);
}
log(ops.length, dv.dryRun ? "row(s) would be updated" : "row(s) updated");
`;

const LINK_NN = `// Link rows through a many-to-many (N:N) relationship, and unlink.
// NAV = the collection-valued navigation property on the first table.
const NAV = "new_account_contact";
const account = (await dv.getAll("accounts?$select=accountid,name&$filter=name eq 'Contoso Ltd'"))[0];
const contacts = await dv.getAll("contacts?$select=contactid,fullname");
for (const c of contacts) {
  await dv.associate("accounts", account.accountid, NAV, "contacts", c.contactid);
}
log(contacts.length, "contact(s) linked to", account.name);
// to unlink: await dv.disassociate("accounts", account.accountid, NAV, contactId);
`;

const EXPLORE = `// Reads only — who am I, a table's metadata, a page of rows with their labels.
const me = await dv.whoAmI();
log("User id:", me.UserId);

const t = await dv.entity("account");
log("Table:", t.LogicalName, "· entity set:", t.EntitySetName, "· key:", t.PrimaryIdAttribute);

const rows = await dv.getAll("accounts?$select=name,address1_city,revenue", { max: 50, formatted: true });
table(rows.map(r => ({ name: r.name, city: r.address1_city, revenue: r["revenue@OData.Community.Display.V1.FormattedValue"] ?? r.revenue })), "Accounts");

// Anything else the Web API offers goes through dv.request(method, path, { body, headers }).
const res = await dv.request("GET", "accounts?$top=1&$count=true", { throwOnError: false });
log("Raw request status:", res.status);
`;

export const SCRIPT_TEMPLATES = [
  { id: "propagate-lookup", code: PROPAGATE },
  { id: "update-from-file", code: FROM_FILE, sampleInput: [{ "Account number": "ACC-1001", Phone: "+33 1 23 45 67 89", City: "Paris" }, { "Account number": "ACC-9999", Phone: "x", City: "" }] },
  { id: "fetch-delete", code: FETCH_DELETE },
  { id: "batch-bypass", code: BATCH_BYPASS },
  { id: "link-nn", code: LINK_NN },
  { id: "explore", code: EXPLORE },
];
