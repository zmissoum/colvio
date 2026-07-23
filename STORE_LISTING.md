# Chrome Web Store Listing — Colvio

## Short Description (132 chars max)
Free, in-browser toolkit for Dynamics 365 / Dataverse. Query, inspect, load, test the API, audit — no setup, no account.

## Detailed Description

Colvio — The Free In-Browser Toolkit for Microsoft Dynamics 365 / Dataverse

Colvio is a free, open-source Chrome extension that gives D365 consultants, admins, and developers instant access to their Dataverse data and Web API — directly from the browser, with zero configuration.

No API keys. No app registration. No subscription. No account. Just click the icon on any D365 page and start exploring.

The free, in-browser toolkit that Dynamics 365 has been missing.

KEY FEATURES

Data Explorer — 4 Query Modes
Query any entity with a visual query builder (Builder), raw OData URLs, FetchXML, or SQL. Yes, SQL — Colvio includes a built-in SQL-to-FetchXML translator. Smart field picker with type filtering. Multi-filter WHERE with AND/OR groups. Expand parent AND child relationships, with per-expand $filter on collection (1:N) expands. Auto-pagination with no 5000-record cap, virtual scrolling (60fps on 10k+ records), inline cell editing, bulk update and delete. Browser-style query tabs keep several queries open side by side — each tab is fully independent (its own table, query mode, filters and results), so you run them one at a time and switch between tabs to compare; tabs rename inline (double-click). The result limit defaults to All (everything, auto-paginated) — lower it for a quick preview. Relational filters bring Advanced-Find power to the Builder: filter the root rows by their RELATED records — a condition on a parent's fields ("accounts whose primary contact's email contains @gmail") or a has-at-least-one / has-none children test ("accounts with NO open opportunity") — Colvio generates the OData nav-path or any() lambda for you and shows it in the query preview.

API Tester
A Postman-equivalent for Dataverse, built right in. Run ad-hoc Web API requests (GET, POST, PATCH, PUT, DELETE) without leaving Colvio. Auth is automatic via your active D365 session — no OAuth dance, no client secret, no token refresh, no environment variables per org. Headers autocomplete for common Dataverse headers (Prefer, MSCRM.SuppressDuplicateDetection, MSCRM.BypassCustomPluginExecution, If-Match, etc.). JSON body editor with line-numbers gutter and live validation that points to the exact line on parse errors. Response panel with status, elapsed time, body size, pretty-printed JSON, and headers tab. Templates for common operations (WhoAmI, CREATE, PATCH, UPSERT by alt-key, DELETE, RetrieveCurrentOrganization). History of your last 50 requests stored locally — secret-bearing headers (Authorization, Cookie, API keys) are redacted before saving. Copy as cURL for sharing in tickets or chat. Ctrl/Cmd+Enter to send. Multiple tabs.

Show All Data
Auto-detects the record open in your D365 tab. One click to inspect every field with logical name, type, and value. Fields render in a responsive multi-column grid that fills the screen, so even 400+ field records stay readable with minimal scrolling. Copy individual fields or full JSON. Writable fields have an inline edit pencil — change a value straight through the API, even when the form marks the field read-only (text, numbers, yes/no, dates, option sets; field-level security and write privileges still enforced server-side, with a confirmation on production).

Business Process Flow manager (System Administrators)
When a sysadmin inspects a record, Colvio lists every BPF instance on it — including finished ones the form has locked — and lets you reopen a finished/aborted flow, move it to any stage, or finish/abort it. Colvio resolves the flow's real underlying table for the update (trickier than it looks) and asks for confirmation on production environments.

Metadata Browser
Browse entities, fields, and OptionSet values with codes, labels, and descriptions. Export all fields of any entity as CSV (logical name, OData column name, type, required flag, custom flag) — instant data dictionary, ready to paste into a $select clause. Export all OptionSets as CSV for offline documentation.

Data Loader — fully rewritten
Import CSV, TSV, or Excel files (XLSX/XLS) directly — drag-drop or paste from any spreadsheet. Proper RFC-4180 parsing: quoted cells, embedded commas and line breaks, auto-detected delimiter (comma, tab, semicolon). Four import modes: CREATE, UPSERT (match on GUID or alternate key), UPDATE existing-only (native If-Match — a missing key fails the row, nothing is ever created), and DELETE by key with typed confirmation. Multipart OData $batch parallelized across concurrent workers with one changeset per record, so a single bad row doesn't roll back the entire batch. Tunable performance: batch size (1-500) and parallel threads (1-10), defaults 200×6 for ~3-4k records/second; automatic retry on Dataverse 429 throttling. Live per-row import log shown in real time during the run, with every CSV column visible, Success/Failed status, the exact Dataverse error message, and the exact request sent. Column transforms convert option-set labels to values ("Hot" → 1, with unmatched labels reported), parse EU/US dates with times, handle decimal commas, and strip HTML tags to plain text (for rich-text exports landing in plain-text columns). Alt-key direct binding skips the GUID resolution query when the lookup target field is a registered alternate key (auto-detected from metadata). Smart upsert key dropdown with alt-keys highlighted at the top. Mapping templates save your full configuration per entity. Auto-skip of Lookup-type fields in the mapping step. Speed boosters for admins, using Microsoft's documented bypass headers: skip custom synchronous logic (sync plug-ins + real-time workflows), custom asynchronous logic (async plug-ins + background workflows — no more system-job floods after a bulk load), and duplicate detection — applied per record, on imports AND bulk deletes. Cancel mid-import stops everything — no writes after cancel.

Data Loader — safety net
Dry run simulates the entire import with zero writes and reports row by row what would happen. Rollback captures the GUIDs a run created and deletes exactly those on a typed confirmation. Delta mode fetches current values and sends only the fields that changed — unchanged rows are skipped. Owner lookups probe user-vs-team per GUID. Pre-flight checks warn before you run: values longer than the target field's max length, empty or duplicate match keys, Salesforce-style IDs mapped where a Dataverse GUID is needed, unmapped required fields, non-writable fields for the chosen mode. A date-format toggle (day-first EU vs month-first US/Salesforce) stops 03/04/2024 from silently becoming the wrong date. After a run, retry only the transient failures (timeouts, throttling, 5xx) at gentler concurrency — data errors aren't offered a pointless retry. Migration mode (opt-in, create-only) preserves original createdon/modifiedon/createdby/modifiedby audit values. And to CLEAR a field from a file — including a lookup — put the literal word NULL in the cell: empty cells always leave fields untouched, so a partial file can never wipe data.

Recycle Bin
View and restore deleted Dataverse records — a true server-side restore via the platform's "keep deleted records" feature. Shows who deleted, created, and last modified each record, with retention and every Microsoft limitation explained (cascade ordering, key conflicts, unsupported tables). Restore-enabled tables are pre-filtered, deleted records are searchable by name server-side, and pagination lets you walk through mass deletes of hundreds of thousands of rows without loading them all at once.

Record Change History
Field-level audit timeline on any record: who changed what, when, old → new values with formatted labels.

System Ops
System jobs monitor (find stuck workflows, bulk cancel/resume with the documented state transitions) and plug-in trace viewer (exceptions highlighted, durations, CSV export). Both paginate without a hard cap and add server-side filters — date range, name/text search, and a minimum-duration filter on traces — so nothing stays hidden behind a Top-N limit.

Schema snapshot & diff
Export an environment's schema as JSON and diff it against another org — missing tables, missing columns, type mismatches, ranked and exportable. Deployment prep in two clicks.

Command palette
Ctrl+K jumps to any module or action. A "What's new" popup summarizes each update.

Relationship Graph
Visual SVG graph of entity relationships: N:1 parents, 1:N children, N:N many-to-many. Depth 1-2, click nodes to drill down.

Schema (ERD)
Interactive Entity Relationship Diagram. Add entities to a canvas, see field details with FK badges, bezier curves between lookups and target entities. Drag cards, zoom, pan. Expand/collapse fields or view tables only. Export as PNG, SVG, or Mermaid.

Automation Inventory
The static inventory of everything registered to run in the org — the design-time counterpart to System Ops' runtime jobs. Plug-in steps (class, assembly, message, entity, stage, sync/async, enabled/disabled — internal platform machinery hidden by default, like the Plugin Registration Tool) plus every process definition in category tabs with counts: classic workflows (with mode and triggers), Power Automate cloud flows, business rules, actions, BPFs, dialogs, desktop flows. Honest three-way source classification (Microsoft via publisher-prefix heuristic, Managed, Custom — Dataverse doesn't stamp authorship, and the tooltip says so), state and free-text filters, CSV/Excel export of any view. The map you want before debugging "why did this field change?" or planning a migration that bypasses plug-ins.

App Inventory
What each model-driven app actually EXPOSES — tables, forms, views and modern command-bar buttons, read straight from the runtime tables. The headline: the "include all forms/views" state the maker portal never shows. When a maker leaves it checked, Dataverse stores no flag and creates no component rows — Colvio infers it from the absence of explicit registrations (independently for forms and views) and badges the table ALL FORMS / ALL VIEWS, meaning every current AND FUTURE form/view will surface in that app. Every form and view carries an EXPLICIT (hand-picked) or IMPLICIT (auto-surfaced) badge; modern commands are classified by their three scopes (app-specific, entity-global, table-generic). A reverse search answers the other direction — "which apps expose this form/view/button?" — the impact map to check before editing a shared component. On-demand dependency analysis lists the attributes and option sets an app's forms and views actually pull in. And when a record mysteriously doesn't show in a form's child list, the view inspector answers why: click any view to see its filters decoded to plain language (field, operator, value, AND/OR groups — the usual culprit is the statecode filter hiding inactive rows) and its columns; the subgrids button on a form shows which view each child grid renders and through which relationship; one click loads the view's FetchXML in the Explorer to test exactly why a row matches or not. CSV/Excel export of the full inventory.

Environment Variables
Defaults, per-environment overrides, and — surfaced first — the classic post-deployment trap: variables with NO value at all, which flows and plug-ins read as an empty string and fail three screens later. Typed editing of the override (yes/no for Booleans, JSON validated before save, numbers checked), one click to clear it back to the default, confirmation on production. Secret variables hold a Key Vault reference, never the secret itself — the UI says so. Filters, search, CSV/Excel export with each variable's effective source.

Solution Explorer
Browse D365 solutions and their components — with All/Unmanaged/Managed filter counts and a CSV/Excel export of a solution's full component list (resolved type labels). 40+ component types resolved to readable names against Microsoft's official enumeration (Entity, Attribute, Web Resource, Security Role, Email Template, Model-driven App, Environment Variable, Routing/Convert Rule, SLA, and more), with component names resolved per type instead of raw GUIDs. And COMPARE: diff any two solutions of the org (Only in A / In both / Only in B, grouped by type, full CSV/Excel export) with a warning when two unmanaged solutions share components — the classic layering conflict. Cross-org too: export a compare file on DEV, load it on PROD, and see exactly which components drifted between environments (honest two-pass matching, explained on screen).

Translation Manager
View and edit field labels in multiple languages, each shown with its proper language name — full coverage of Dataverse-provisioned languages, no raw LCID codes. Non-renameable fields automatically locked as read-only. Export/import CSV for bulk translation workflows. Auto-publish after save.

User & License Monitor
Monitor ALL D365 users — Access Mode, CAL Type, Business Unit, security roles, last login date. Filter by Active/Disabled/Non-Interactive, identify unused licenses (never logged in, disabled but still allocated). Full CSV export. No limit on user count.

Security Audit
Review all security roles and their privileges. Readable labels (prvDeleteAccount becomes Delete · Account), depth badges (User/BU/Org), sensitive privilege flags (30+ critical privileges highlighted). Filter by Org-level or Sensitive. A Matrix (by table) view shows the full grid like the make.powerapps role editor — every table × Create/Read/Write/Delete/Append/Append To/Assign/Share with a depth pie per cell, including what is NOT granted — and unlike the maker portal, the whole grid exports to CSV/Excel. A Users sub-tab lists exactly who holds each role — name, email, business unit, status — aggregated across every business-unit copy of the role and deduplicated, so members sitting in child business units are never missed. Service / non-interactive accounts are flagged. A Teams sub-tab shows the teams holding the role (type, business unit, administrator, member count) — the answer when a role shows 0 direct users but is very much in use. An org-wide view answers "who can do what" across EVERY role at once: pick an operation (Delete, Write, Assign, Share…) and a minimum depth, Colvio scans all roles and groups the result by role or by table ("which roles can delete Account — and at what depth?"), fully exportable. And it never fakes completeness: if a role fails to load mid-scan you get an explicit INCOMPLETE warning with a retry button, and exports are blocked while the scan runs. Bulk role assignment: paste a list of user emails to assign a role (Colvio automatically matches each user's business-unit copy of the role — the classic trap), or select members and remove the role, with confirmation on production. Filter and CSV export on privileges, members and teams.

Business Units
Browse the org's business-unit hierarchy as an indented tree and see the users in each BU. Pick a BU to list its direct members (name, email, access mode / CAL type, status) with a filter, and export to CSV — either just this BU's members, or this BU plus every sub-BU beneath it (the export keeps a Business Unit column). Each BU shows its direct user count in the tree. Read-only.

Login History
User login/logout audit timeline from D365 audit logs. Session duration, access type stats, CSV export.

Adoption Analytics
Who is actually using the CRM you pay for? Access events, distinct active users, DAU/WAU/MAU and stickiness — over 7/30/90 days or any custom window, with an honest KPI: Dataverse logs access at most once per interval (default 4 h), so Colvio says "access events" (a stable activity proxy) instead of pretending to count logins. Service accounts (non-interactive, S2S application users) are excluded from every number by default — they never sign in by design. A trend chart, an events-by-weekday profile, and an adoption-rate table per business unit (active ÷ enabled, exportable). Compare with the previous period in one click (▲▼ deltas). The per-user table has two modes: active users, or ALL users in scope with license type and days-since-last-access — filter inactive ≥30/60/90 days and export: paid seats that never log in are the finding. And the list nobody has ready when management asks: enabled users who NEVER signed in — export includes email and license type. Filter everything by security role or business unit. Totals are EXACT whatever the audit volume (per-day server-side aggregation, failed days flagged with retry, never silently missing). Requires "Audit user access" enabled; sees what your audit retention keeps — both stated in the UI.

Help & Onboarding
Built-in feature guide, first-launch tour, keyboard shortcuts panel, contextual tooltips.

GLOBAL

Dark/Light theme with system preference detection
English/French interface toggle
Responsive, full-width layout — record inspector on a multi-column grid, data-heavy tabs use the whole screen, less scrolling
Environment badge — reads Microsoft's authoritative OrganizationType (Production / Sandbox / CustomerTest / Trial / Preview / Developer) so you always know which environment you're working in
Export: XLSX, CSV, JSON — copy or download
Keyboard shortcuts (Ctrl+Enter to query, Ctrl+/ for shortcuts, Escape to close)
Session expiration detection with Reconnect button
Query History (last 20 queries) + Saved Queries (20 max)
5 pre-built query templates for common tasks

SECURITY & PRIVACY — Full audit: 0 critical, 0 high findings

Zero data collection — no analytics, no telemetry, no external servers
All requests go directly from your browser to your D365 server — same-origin guard on the API Tester blocks any request not pointing at your active D365 host
Uses your existing Azure AD / Entra ID session — no credentials stored
Input validation on all API parameters (entity names, GUIDs, search terms)
OData injection protection — numeric and GUID values validated before query insertion
CSV export formula injection protection — prevents spreadsheet formula execution
Content Security Policy enforced on extension pages
Bulk operation safeguards — typed confirmation on delete, confirm dialog on bulk update
CanBeDeleted pre-check — verifies entity permissions before allowing delete operations
Client-side rate limiting — capped concurrent requests to prevent API abuse and respect Dataverse Service Protection limits
Role-based tab visibility — sensitive modules auto-hidden for non-admin users
Only 3 runtime dependencies (React, React-DOM, xlsx export-only)
Open source — audit the code yourself on GitHub

BUILT WITH SECURITY IN MIND

Colvio goes beyond what similar tools offer in terms of safety:
Typed confirmation required before any bulk delete (you must type the entity name)
Entity CanBeDeleted metadata check before delete operations are allowed
Confirm dialog on bulk update showing field name, value, and record count
Same-origin URL guard on ad-hoc API requests — Colvio refuses to send requests to any domain other than your current D365 host
Rate limiting prevents accidental API flooding
OData and GUID input validation prevents injection attacks
CSV formula injection protection on all exports
Role-based access control hides admin-only modules from standard users
Content Security Policy blocks unauthorized script execution
PII stripping in query history — filter values are not persisted
All write operations respect your D365 security roles — Colvio cannot bypass server-side permissions

ROLE-BASED ACCESS

Some modules require elevated D365 permissions and are automatically hidden for non-admin users:
Available to all users: Data Explorer, API Tester, Show All Data, Metadata Browser, Data Loader, App Inventory, Relationship Graph, Schema, Help
Requires System Administrator or System Customizer: Solution Explorer, Environment Variables, Automation, Translation Manager, Login History, Adoption, Users & Licenses, Business Units, Security Audit
Colvio detects your permissions at startup and only shows the tabs you can access. No error screens, no confusion.

SUPPORTED REGIONS

Works on all Dynamics 365 / Dataverse environments worldwide:
NA, EMEA, APAC, UK, France, Canada, Australia, Japan, India, UAE, South Africa, and all crm*.dynamics.com domains.

100% FREE & OPEN SOURCE

No freemium. No paywalls. No "Pro" tier. Colvio is free for everyone, forever.
Source code, documentation, and security audit available on GitHub.
github.com/zmissoum/colvio

PERFECT FOR

D365 consultants exploring a new org
Admins troubleshooting data issues
Developers testing API queries and prototyping Web API integrations (without setting up Postman with OAuth)
Data migration teams loading or extracting hundreds of thousands of records
Salesforce consultants transitioning to D365 (Colvio is the equivalent of Salesforce Inspector for Dataverse)
Anyone who needs quick, safe access to Dataverse data and metadata

## Category
Developer Tools

## Language
English, French

## Screenshots Needed (1280x800 or 640x400)
1. Data Explorer — query builder with results table (dark theme)
2. API Tester — request + response panels with templates visible
3. Data Loader — Live import log with per-row Success/Failed status
4. Show All Data — record inspector with field details
5. Schema — interactive ERD with entity cards and bezier lines
6. Security Audit — roles and privileges viewer, with the Users sub-tab showing who holds the role
7. Metadata Browser — entity fields with Export buttons and OptionSet viewer
8. Recycle Bin — deleted records with who-deleted / created / modified columns and restore
9. Adoption — DAU/WAU/MAU, per-BU adoption rates, license & inactivity, and the never-signed-in list
