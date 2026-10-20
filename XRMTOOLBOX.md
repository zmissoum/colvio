# Coming from XrmToolBox?

Colvio is a Chrome extension: it runs next to your Dynamics 365 / Dataverse tab, signed in as you, with no install, no connection string and no client-side service account. It works on **one environment at a time — the one open in the tab** — and that is deliberate: multi-environment comparisons and transports stay with XrmToolBox.

Everything below is read-only unless marked **(writes)**; every write is confirmed, and confirmed a second time on a production environment.

## Query and data

| In XrmToolBox you use… | In Colvio |
| --- | --- |
| FetchXML Builder | **Data Explorer** — Builder, FetchXML, OData and SQL modes on the same query; FetchXML pages with the server's paging cookie; results to grid, CSV, Excel, or **To file** (every row streamed, whatever the size); **Save as view** (personal view of the table) |
| SQL 4 CDS | **Data Explorer › SQL** — Dataverse's native `?sql=` engine (joins, aggregates, server-side) or Colvio's transpiler; `UPDATE` / `DELETE` **(writes)** always previewed row by row before Apply |
| Bulk Data Updater | **Data Explorer** bulk update of a selection, or SQL `UPDATE … WHERE` **(writes)** |
| Bulk record deletion | **Data Explorer** selection delete, or SQL `DELETE FROM … WHERE` **(writes)** — with CanBeDeleted and production checks |
| Data Transporter / CSV import | **Data Loader** — CSV / Excel / paste, create / update / upsert / delete by primary or alternate key, typed pre-flight, `$batch` chunks, per-row log **(writes)** |
| Record counter | **Storage** — rows per table from Dataverse's own snapshot, storage class, silent-growth tables, real file bytes per table |
| Recycle bin viewer | **Recycle Bin** — find and restore deleted rows **(writes)** |
| Web API request composer / Rest Builder | **API Tester** — any request against your org, history with redacted values |

## Data model

| In XrmToolBox you use… | In Colvio |
| --- | --- |
| Metadata Browser | **Metadata** — tables, columns, choices, Virtual / Elastic chips; **fill rate** of every column (exact, even on millions of rows) |
| Metadata Document Generator | **Metadata › Data dictionary** — every column of chosen tables streamed to CSV / Excel |
| Attribute Editor / Excel-to-columns tools | **Metadata › Columns from file** — a CSV / Excel sheet describes the columns, every row checked before anything is sent, created in the unmanaged solution you pick, table published once **(writes)** |
| Option Set editors | **Metadata › Values › Edit values** — add, rename, reorder, delete options, published at once; a delete first counts the rows holding the value **(writes)** |
| Dependency Identifier | **Metadata › Dependencies** — what blocks deleting a column or table, or everything that uses it, each named with how to remove the dependency |
| Solution Layers Explorer | **Metadata › Layers** — the solution layers of a column or table; an unmanaged "Active" layer hiding a managed solution is flagged |
| Entity Relation Diagram Creator | **Schema** (ERD) and **Relationships** (entity graph, business relations first) |
| Schema diff | **Metadata › Schema snapshot & diff** — snapshot the model, compare later |

## Automation and code

| In XrmToolBox you use… | In Colvio |
| --- | --- |
| Plugin Registration Tool (steps) | **Automation** — every plug-in step and process; enable / disable one or a selection, edit an Update step's filtering attributes **(writes)**. Registering a new assembly or step stays with the Plugin Registration Tool |
| Plugin Trace Viewer | **Show All Data › Record activity** — save a record and see the plug-ins it ran (order, duration, cascades, exception, full trace), its system jobs and the flows that fired; "Log every plug-in" for 15–60 minutes, reverted by itself |
| Async job / system job viewers | **System Ops** — system jobs and flow runs, failures first |
| Web Resources Manager | **Web Resources** — edit and publish scripts, styles and pages; **search a column name inside every script** (what dependency tracking can't see) **(writes)** |
| Environment Variables Manager | **Env Variables** — definitions, overrides, missing values **(writes)** |
| Easy Translator | **Translation Manager** — export / import labels **(writes)** |
| Solution component viewers | **Solutions** — components, compare two solutions of the same org |
| App module component tools | **Apps** — model-driven app inventory, forms, views, the components an app really depends on |

## Users, security and governance

| In XrmToolBox you use… | In Colvio |
| --- | --- |
| Access Checker | **Show All Data › Record access** — pick a user: Dataverse's own yes / no for each right on the record, why (role, team, depth, share) and what would grant a no |
| Role Updater / Security role explorer | **Security Audit** — roles, privileges, org-level access on sensitive operations, "which roles hold this privilege"; bulk assign a role **(writes)** |
| User Settings Utility | **Users & Licenses › Bulk settings** — time zone, language, formats… for many users at once **(writes)** |
| User / license reports | **Users & Licenses** — access modes, licence types, roles, last login |
| Business Unit changers | **Business Units** — org chart, members, move users **(writes)** |
| Team management | **Teams** — owner and Entra group teams, members, inherited roles |
| Audit history / Login tracker | **Show All Data › Change history**, **Login History**, **Adoption** (usage analytics, PowerPoint export) |
| Solution checker-like reports | **Health check** — failing and suspended jobs, flows owned by disabled users, plug-ins firing on every update, unbound connection references, empty environment variables, users without a role, unmanaged solutions in production, log table sizes — each with what to do |

## What stays with XrmToolBox (by design)

- Anything across **several environments**: solution transport, data migration between orgs, environment comparisons.
- **Solution packaging** (export / import / pack / unpack), ribbon editing, form XML editing, custom API and N:N designers, early-bound code generation.
- Registering **new plug-in assemblies and steps** (Colvio switches existing steps on and off and edits their filtering attributes).

## Why the difference matters

- **No per-item loops**: Colvio reads in sets — aggregates, grouped reads, pages — and shows a real API meter against Dataverse's service-protection quota, slowing down before the limit instead of being refused.
- **All or nothing**: a list is complete or it says why it isn't; exports stream every row or leave no file.
- **Nothing leaves the browser**: Colvio talks only to the Dataverse host open in the tab.
