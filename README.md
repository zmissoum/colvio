# Colvio for Dynamics 365

> Free, open-source data explorer for Microsoft Dynamics 365 / Dataverse — directly in the browser.

<div align="center">
  <img src="icons/icon128.png" alt="Colvio" width="80"/>
</div>

Colvio is a **free and open-source** Chrome extension that lets consultants, admins, and developers explore, query, and manage data from any Dynamics 365 / Dataverse environment — directly from the browser, with zero configuration.

**No API keys. No app registration. No subscription.** Just click the icon on any D365 page and start working.

## Why Colvio?

D365 has always lacked a free, fast, in-browser tool for data exploration and debugging. **Now it has one.**

Colvio brings the same philosophy to the Microsoft ecosystem:
- **Free forever** — no freemium, no paywalls, no "Pro" tier
- **Zero config** — uses your existing D365 browser session
- **Privacy first** — no data leaves your browser, no telemetry, no accounts
- **Open source** — audit the code, contribute, fork it

## Features

### Data Explorer
- **Query tabs** — open several queries at once like browser tabs; each tab is fully independent (its own table, mode, filters, results), so you run them one at a time and switch to compare; rename inline (double-click), close with ✕
- **Query Builder** — visual SELECT, WHERE (AND/OR groups, 14 operators), EXPAND (parent + child), LIMIT (defaults to **All** — lower it for a quick preview)
- **FetchXML mode** — textarea with 3 templates (simple, inner join, aggregation) + paging cookie pagination
- **OData mode** — raw OData URL editing
- **Column sorting** — click any header to sort ASC/DESC
- **Inline edit** — double-click any cell to PATCH the value directly in D365
- **Virtual scrolling** — 60fps on 10,000+ records (only ~35 rows rendered)
- **Auto-pagination** with live timer and Stop button
- **Saved queries** — persist across sessions (20 max)
- **Query History** — auto-save last 20 queries, 1-click reload
- **Query Templates** — 5 pre-built queries for common consultant tasks
- **Bulk Update** — select records and PATCH a field on all
- **Bulk Delete** — select and delete with typed confirmation + CanBeDeleted pre-check
- **Clickable lookups** — opens target record in D365
- **Copy OData URL** — one-click copy for Postman/browser

### API Tester
- **Postman-style client for the Dataverse Web API** — authenticated by your active D365 session (no OAuth setup, no client secret)
- GET / POST / PATCH / PUT / DELETE on relative paths or full same-org URLs (host re-validated)
- Header autocomplete for common Dataverse headers (`Prefer`, `If-Match`, `MSCRM.*` bypass headers)
- JSON body editor with line numbers and live validation pointing at the exact parse-error line
- Response panel: status, elapsed time, body size, pretty JSON, headers tab
- Request templates (WhoAmI, CREATE, PATCH, UPSERT by alt-key, DELETE, RetrieveCurrentOrganization)
- History of the last 50 requests (stored locally; secret-bearing headers like `Authorization` are redacted before saving)
- **Copy as cURL**, Ctrl/Cmd+Enter to send, multiple tabs

### Show All Data
- Auto-detect current record from D365 tab
- Responsive **multi-column grid** that fills the screen (even 400+ field records stay readable): Logical Name, label, type, value
- Filter columns, toggle empty/custom-only, clickable lookup links, copy a single field or full JSON

### Metadata Browser
- Browse entities, fields, OptionSets by category
- OptionSet modal viewer with Value, Label, Description, Color
- **Export All OptionSets** — bulk CSV export of all Picklist/State/Status values for an entity
- Entity record counts, field type badges, custom field indicators

### Data Loader
- 5-step wizard: Source > Mapping > Lookups > Preview > Run
- CSV / TSV / TXT drag-drop, **Excel (XLSX/XLS)** support, or paste from clipboard
- **RFC-4180 parser**: quoted cells, embedded commas/newlines, escaped quotes; delimiter auto-detected (`,` / tab / `;`); values trimmed; leading zeros preserved
- **4 import modes**:
  - **CREATE** — every row becomes a new record
  - **UPSERT** — match on GUID or **alternate key**: update if found, create otherwise
  - **UPDATE (existing only)** — strictly update via the native `If-Match: *` header: a missing or empty key **fails the row, never creates**; optional parallelized existence pre-check for orgs that don't honor `If-Match` on alt-keys
  - **DELETE** — remove records matched on GUID or alternate key, typed confirmation required
- **🔍 Dry run** — simulate the entire import (parsing, transforms, lookups, existence checks) with zero writes; per-row *would create / update / fail / delete* report
- **↩ Rollback** — created GUIDs are captured from the batch responses; one typed confirmation deletes exactly the records a run created
- **Δ Delta mode** — fetch current org values and send only the fields that changed; unchanged rows skipped entirely
- **Team-aware owner lookups** — direct `ownerid` GUIDs are probed user-vs-team and bound to the right entity set
- Smart auto-mapping with metadata-driven lookup detection (auto-skips Lookup-type fields, picks alt-keys over PKs, warns on non-writable fields per mode)
- **Column transforms**: picklist/statecode **label→value** (OptionSet preloaded; unmatched labels reported, never silently dropped), locale-aware dates (`dd/mm/yyyy`, US auto-detect, time + AM/PM), locale-aware numbers (`1,5`, `1.234,56`), booleans EN/FR
- **Mapping templates** — save and reload a full configuration (mappings, lookups, key, mode) per entity
- **Tunable performance**: batch size (1-500) × threads (1-10) — default 200×6 for ~3-4k rec/sec
- Multipart **OData $batch** with **per-record changesets** — errors don't cascade across the chunk
- **429-aware**: Service Protection throttling retried automatically honoring `Retry-After`
- **Alt-key direct bind**: when the lookup target field is a registered alternate key, skips the resolve query (no `?$filter=...` per unique value) and binds via `entity(field='value')` syntax; lookup `@odata.bind` paths use the real `EntitySetName` (irregular plurals, polymorphic targets)
- **Speed boosters** (System Administrators only): per-record `MSCRM.BypassCustomPluginExecution`, `SuppressDuplicateDetection`, `BypassSynchronousLogic` headers
- **Live per-row import log** during the run: every line shown with its CSV columns + `Success`/`Failed` status + Dataverse error detail + the exact request sent (method, URL, headers, body)
- **Cancel mid-import** — stops remaining chunks *and* in-flight 429 retries: no writes are sent after cancel

### Recycle Bin
- **List & restore deleted records** — true server-side restore via Dataverse "keep deleted records" (queried with FetchXML `datasource='bin'`, restored with the platform `Restore` action)
- Detects whether the feature is enabled (retention days shown) and explains how to enable it
- Every Microsoft limitation surfaced in plain words (pre-enablement deletes, virtual/elastic/solution tables, >600-column tables, cascade ordering, key conflicts)
- Shows **who deleted** each record (from the audit log, best-effort) plus **who created / last modified** it; **paginates** through large bins (page size + Prev/Next) and searches deleted records by name server-side

### Record Change History
- In Show All Data: the **audit timeline** of any record (who, when, which action) with click-to-expand **field-level diffs** (old → new, formatted values)
- Reads the audit table directly (the Web API change-history function omits user/date — documented MS limitation)

### System Ops
- **System Jobs monitor** — quick filters for failed / waiting / in-progress jobs, bulk **Cancel** and **Resume** with the documented state transitions (admin-gated)
- **Plugin Trace viewer** — exceptions highlighted, full trace text, duration warnings, CSV export; enablement and the 24h auto-purge documented in-UI
- Both panels **paginate** (page size + Load more, no hard cap) with **server-side filters**: date range on both, name search on jobs, text + minimum-duration on traces

### Schema snapshot & diff
- Export the org schema as JSON, load a snapshot from another environment and get a **ranked diff** (missing tables/columns, type mismatches) with CSV export — deployment prep in two clicks

### Relationship Graph
- Visual SVG graph: N:1 parents, 1:N children, N:N many-to-many
- Depth control (1-2 levels), click nodes to drill down
- Deduplication, edge labels, count badges

### Schema (ERD)
- Interactive Entity Relationship Diagram — multi-entity canvas
- Entity cards with fields, type indicators, FK badges on lookups
- Bezier curves connecting lookup fields to target entity cards
- **Drag** cards to rearrange, **scroll** to zoom, **drag canvas** to pan
- **Expand/collapse** individual cards or all at once (Tables/Fields toggle)
- **"Add Related"** button (+) to auto-add connected entities
- **Export**: PNG (2x retina), SVG (vector), Mermaid (.mmd)
- Toolbar: zoom +/-, Fit All, Auto Layout, Clear

### Solution Explorer
- Browse solutions and components grouped by type
- **40+ component types resolved to display names** against Microsoft's official enumeration (Entity, Attribute, OptionSet, View, Web Resource, Security Role, Email Template, Model-driven App, Environment Variable, SLA, Routing/Convert Rule, Plugin Type/Assembly, SDK Step, Canvas App…); each component's name resolved per type instead of a raw GUID
- Managed/Unmanaged badges, component counts

### Translation Manager
- View and edit field labels across multiple languages inline — each language shown with its proper name (full Dataverse language coverage, no raw LCID codes)
- Non-renameable fields locked as read-only (🔒 icon)
- Export/Import CSV for bulk translation workflows
- Save changes + auto-publish entity

### User & License Monitor
- Load **all** D365 users with full pagination (no limit)
- Filter: Active / Disabled / Non-Interactive, local search by name, email, BU
- Sort by Name, Status, CAL Type, Access Mode
- User detail: Access Mode, CAL Type, Business Unit, title, creation date
- **Last login** date from audit logs (with "X days ago" indicator)
- **Security Roles** list per user
- Access Mode + CAL Type **breakdown stats** across all users
- **CSV export** of full user list (formula injection protected)
- Identify unused licenses: disabled users, users who never logged in

### Security Audit
- Browse all D365 security roles (filter: Custom / Managed)
- **Privilege viewer** with readable labels (e.g. `prvDeleteAccount` → `Delete · Account`)
- **Depth badges**: User, Business Unit, Parent: Child BU, Organization
- **Org-level flags** — highlight privileges with Organization depth (red)
- **Sensitive privilege detection** — 30+ critical privileges flagged (delete, assign role, export, audit, publish)
- Filter by: All / Org-level only / Sensitive only
- User count per role, CSV export
- **Users sub-tab** — lists exactly who holds the role (name, email, business unit, status), aggregated across **every business-unit copy** of the role and deduplicated so members in child BUs are never missed, with service-account flags; CSV export on both privileges and members

### Business Units
- **BU hierarchy** as an indented tree (search), each with its **direct user count** and a disabled badge
- Pick a BU to list its **direct members** — name, email, access mode / CAL type, enabled/disabled — with a filter
- **CSV export with scope choice**: just this BU's members, or **this BU + every sub-BU beneath it** (the export keeps a Business Unit column); even works when the BU itself has no direct members
- Reuses the all-users fetch grouped by `_businessunitid_value`; admin-gated, read-only

### Login History
- User search, login/logout audit timeline
- Session duration calculation, access type breakdown, CSV export

### Help & Onboarding
- Built-in Help tab with feature guide
- First-launch onboarding tour (5 steps)
- Keyboard shortcuts panel (Ctrl+/)
- Contextual tooltips on key features

### SQL Query Mode
- Write familiar SQL: `SELECT`, `FROM`, `JOIN`, `WHERE`, `ORDER BY`, `TOP`, `DISTINCT`
- Automatically translated to FetchXML (reliable pagination, no limits)
- `JOIN` → `link-entity` (no `$expand` limitations)
- Aggregates: `COUNT(*)`, `SUM`, `AVG`, `MIN`, `MAX`, `GROUP BY`
- "View FetchXML" toggle to see the generated XML
- 3 template queries to get started

### Global
- **⌘K / Ctrl+K command palette** — jump to any module or action
- **"What's new" popup** after each update (per-version, EN/FR)
- **Role-based tab access** — sensitive tabs auto-hidden for non-admin users (zero flash)
- **Environment badge** — PROD / SANDBOX / UAT / DEV detected via Microsoft's `OrganizationType` API (URL heuristics as fallback)
- Dark/Light theme (+ system preference detection)
- English/French toggle (i18n) — including a searchable in-app Help
- Export: XLSX, CSV, JSON — standard filenames `<object>_<YYYYMMDD>.<ext>` (run logs add `_HHMMSS`)
- Session expiration detection with Reconnect button
- Error boundaries per tab (graceful crash recovery)
- Rate limiting (30 req/sec client-side) + automatic 429 `Retry-After` back-off
- Intelligent caching (memory + chrome.storage.local, org-scoped keys)
- **Lazy-loaded xlsx** — the ~430 KB spreadsheet library loads only when an Excel file is dropped or exported

## Stats

| Metric | Value |
|--------|-------|
| Lines of code | ~11,400 |
| API actions | 48 |
| React components | 30 |
| Unit tests | 215 |
| Build size | ~490 KB panel (+430 KB xlsx chunk on demand) |
| Languages | EN / FR |
| Price | Free |

## Security

Colvio has been through a full security audit. Results: **0 critical, 0 high, 0 medium open findings**.

### Data Protection
- **Zero data exfiltration** — no external servers, no analytics, no telemetry (every `fetch` targets your own Dataverse org, `same-origin` credentials)
- **PII protection** — query history strips filter values before persisting; API Tester history redacts secret-bearing headers (`Authorization`, `Cookie`, API keys)
- **CSV formula injection protection** — exported CSV cells prefixed to prevent spreadsheet formula execution (XLSX exports keep real typed cells — string cells in .xlsx are inert)
- **Anti-fingerprinting** — content script marker is non-enumerable

### Input Validation
- **Entity/field name validation** — all names validated with regex in the content script
- **OData injection protection** — numeric filter values validated, Lookup GUIDs format-checked, control characters stripped from batch key values (CRLF-injection proof)
- **Same-org enforcement** — API Tester re-validates the final URL host after path assembly
- **Content Security Policy** — explicit CSP on panel.html

### Write Operation Safeguards
- **Typed confirmation on bulk delete** — you must type the entity name to confirm
- **UPDATE mode never creates** — native `If-Match: *` on every PATCH + empty-key rows rejected client-side (optional existence pre-check as a second layer)
- **CanBeDeleted pre-check** — verifies entity metadata before allowing delete
- **Confirm dialog on bulk update** — shows field name, value, and record count
- **Client-side rate limiting** — max 30 requests/second, plus automatic `Retry-After` back-off on 429
- **Cancel is honored end-to-end** — a cancelled import stops pending chunks and in-flight retries; nothing is written after cancel
- **Server-side enforcement** — all write operations respect your D365 security roles, Colvio cannot bypass RBAC (Speed boosters are gated on the `prvBypassCustomPlugins` admin privilege)

### Access Control
- **Role-based tab visibility** — sensitive modules auto-hidden for non-admin users (zero flash)
- **Manifest V3** — minimal permissions (`activeTab`, `scripting`, `storage`, `declarativeContent`)
- **3 runtime dependencies** — React, React-DOM, xlsx (export-only)

See [PRIVACY.md](PRIVACY.md) for the full privacy policy.

## Install

### From source
```bash
git clone https://github.com/zmissoum/colvio.git
cd colvio
npm install
npm run build
```

Chrome > `chrome://extensions` > Developer Mode > Load unpacked > `dist/`

### Microsoft Edge
Colvio is fully Edge-compatible (same package). See [EDGE_LISTING.md](EDGE_LISTING.md) for the Add-ons submission guide — or sideload `dist/` via `edge://extensions`.

### From Chrome Web Store
[Install Colvio](https://chromewebstore.google.com/detail/colvio-for-dynamics-365/edieednbdaclheikneelkjfbckibhdgl)

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT License — see [LICENSE](LICENSE) for details.

**[github.com/zmissoum/colvio](https://github.com/zmissoum/colvio)**
