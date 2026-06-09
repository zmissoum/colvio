# Changelog

## [1.10.15] — 2026-06-09
### Added
- **Data Loader: DELETE mode** (fourth import mode). Bulk-delete records identified by primary key (GUID) or alternate key from a CSV — same parallel `$batch` engine, per-row log, request details, and cancel as the other modes.
  - **Safety rails (destructive, irreversible):** red warning banners; a **typed confirmation** on the Preview step (you must type the target entity's logical name) before the Delete button is enabled; Speed boosters are not applied (server-side logic stays active by default); the red "🗑 Delete records" button replaces "Load".
  - Rows whose key matches no record fail with a 404 (visible per row). Empty key values are skipped.
  - The result panel shows a "Deleted" count; the live log counts "deleted"; per-row request details show the `DELETE /entityset(key)` URL.
  - New `batchDeleteKeyed` action (content.js) + bridge wrapper with the same worker pool as `batchUpsert`.

## [1.10.14] — 2026-06-09
### Added
- **Data Loader: per-row request details in the import log.** Click any row in the live log or the result Import Log to expand the exact Dataverse request that was sent for it — HTTP method (POST/PATCH), the request URL (incl. the alt-key/GUID and `If-Match: *` for UPDATE), and the JSON payload (the mapped D365 attributes with their transformed values and `@odata.bind` lookups).
- **Exported logs now include Method, Request URL, and Payload columns** (both "Export current log" and "Download Log"), so the saved CSV is a full audit of what was sent per row — ideal for diagnosing failures offline.
- Request details are reconstructed on demand from the original CSV row + mapping config (nothing extra stored per row → no memory impact on large imports). Resolve-mode lookup GUIDs aren't retained after the run, so those bind values show `<resolved at runtime>`.

## [1.10.13] — 2026-06-09
### Added
- **Data Loader: UPDATE mode** (third import mode alongside CREATE and UPSERT). UPDATE only modifies records that already exist — rows whose key matches no record **fail instead of being created** (uses the `If-Match: *` header on each PATCH). Useful when you want to enrich/correct existing data without accidentally inserting new rows. The key configuration is shared with UPSERT; the Preview reassurance sentence, mode tile, and live counters reflect the chosen mode. UPDATE is also saved/restored in mapping templates.

## [1.10.12] — 2026-06-09
### Added
- **API Tester: multiple request tabs** (like Salesforce Inspector's multiple query tabs). Open several requests side by side — each tab keeps its own method, URL, headers, body, and response. "+ New" to add a tab, ✕ to close, double-click a tab to rename. Switching tabs preserves every tab's state.
### Changed
- **Data Loader: faster import + snappier cancel.** Each batch chunk is now sent as a single HTTP `$batch` roundtrip instead of being re-split into sequential 100-record sub-batches inside the content script. This means fewer Dataverse roundtrips (faster import) and a much quicker cancel — a worker drains in one roundtrip rather than several before it sees the abort. Batch size now reflects the real `$batch` size (1–500; the previous 1000 max gave no throughput benefit because the content script capped HTTP batches at 100). The default 200 is unchanged but now genuinely sends 200 records per roundtrip.

## [1.10.11] — 2026-06-09
### Added (Data Loader UX — less tedious to fill in, batch 2)
- **Saved mapping templates.** Configure a mapping once, save it as a named template, and reload it next time in one click — column mapping + transforms + parent lookups + upsert key + performance settings are all restored. Stored locally per entity (`chrome.storage.local`), up to 50 templates.
  - "💾 Save this mapping as a template" on the Preview step.
  - "📋 Templates" dropdown on the Mapping step lists templates for the current entity (with column/lookup/mode/date summary and a delete button).
  - Templates apply **only within the same entity** (no metadata reload, no risk to the in-progress config). Mapping is matched by CSV column name; if the file or the entity changed since the template was saved, columns/fields that no longer exist are reported (not silently mis-applied) instead of failing.
  - This goes beyond Salesforce Inspector, which re-derives mapping from headers every time and has no saved templates.

## [1.10.10] — 2026-06-09
### Changed (Data Loader UX — less tedious to fill in, batch 1)
- **Empty Lookups step is now skipped.** When no parent lookups are detected, the Mapping "→" button goes straight to Preview, and the Lookups stepper node is dimmed/labelled "(none)" and not clickable. No more clicking through an empty step.
- **Pre-flight checks on Preview.** A non-blocking warning panel surfaces misconfigurations *before* Run instead of as mass errors at the end: required D365 fields not mapped, lookups with no key field (would silently skip), option-set columns with no transform chosen, UPSERT with no CSV key column. Warnings only — you can still load if it's intentional.
- **Plain-language reassurance sentence on Preview.** Above the technical JSON example, a clear statement of exactly what Load will do: e.g. "Will UPSERT 12,400 records into Account — existing records matched on `fou_sapcustomernumber` are updated, the rest are created." Echoes a booster warning when Speed boosters are active.

## [1.10.9] — 2026-06-09
### Added
- **Data Loader: import start/finish timestamps** — the launch date & time is shown live during the run ("🕐 Started …") and on the result panel ("🕐 Started … 🏁 Finished …"). Both are also written into the exported log CSV summary header.
### Fixed
- **Data Loader: cancel message no longer hardcodes "100 records"** — now reflects the actual in-flight ceiling (batch size × threads).

## [1.10.8] — 2026-06-09
### Fixed (audit pass — security + correctness)
- **CRITICAL (regression in 1.10.7): unbounded live-log memory → tab crash on large imports.** The live import log kept every processed row (with its full CSV row object) in React state and spread-copied the whole growing array on every progress callback — O(n²) churn and ~1GB+ retained on a 600k-record import. Now a lightweight `fullLog` ref records every row (`{csvRowNumber, status, msg}` only, ~a few MB for 600k), while React state holds a bounded 2000-row buffer for the live table. The full log powers "Export current log" and the final "Download Log" (columns reconstructed from the parsed CSV at export time).
- **HIGH (security): HTTP-request/changeset injection via the upsert key value.** In `batchUpsert`, the alt-key / primary-key value flowed into the multipart `$batch` request line with only single-quote escaping. A key column containing `\r\n` (malformed or hostile CSV) could break out of its changeset and inject arbitrary operations. Now control characters are stripped from the key value, and primary-key (GUID) values are reduced to GUID characters only — neutralizing path/CRLF injection without aborting the batch (a bad value yields a clean per-record error instead).
- **HIGH (correctness): final Import Log fabricated row numbers.** The result log was rebuilt from success *counts* (`1..N` synthetic rows) instead of the real per-row results, so "OK" rows didn't map to actual CSV lines. It's now built from the real per-row `fullLog`, with accurate CSV line numbers, capped at 5000 in the table (note shown) — the full set is always available via Download Log.
- **MED (API Tester): URL preview and "Copy as cURL" showed no origin.** `fullUrl` read `orgInfo.clientUrl`, which only exists on the standalone mock; the extension exposes `orgUrl`. Now falls back through both, so the displayed URL and cURL command include the real org host.
- **MED (API Tester): history robustness.** Loading history now validates it's an array (a corrupted/older shape previously crashed the whole tab on render). Saving uses a functional state updater so two quick sends can't drop an entry.
- **LOW (theme): `localStorage` access in the OS-theme listener is now wrapped in try/catch** — no longer throws on every OS theme change in private/blocked-storage contexts.

### Known / accepted (reviewed, low risk)
- OData `$filter`/`$select` in the `query` action are interpolated without operator whitelisting — scoped to the user's own session privileges (no cross-tenant/privilege escalation), acceptable for a developer tool. The Builder mode sanitizes numeric/GUID/string values against injection.
- `$batch` response parsing splits on a `Content-Type: application/http` marker; a Dataverse error message containing that exact literal could mis-number a row in the log (cosmetic, very low probability). Padding logic bounds the impact.

## [1.10.7] — 2026-06-05
### Changed
- **Data Loader: Target entity picker is now searchable**
  - Replaced the dropdown listing all entities alphabetically with an autocomplete-style search input. Type any part of the display name or logical name to filter in real time. Much faster on orgs with 200+ entities.
  - Click outside or press Escape to dismiss without changing the selection. List capped at 200 visible matches with a hint to narrow down further.
- **Data Loader: Live import log keeps the full log in memory (no more 100-row cap)**
  - Previously, only the last 100 processed rows were kept in the live log state — older rows were lost during the import.
  - Now all rows are kept; the rendered DOM portion is capped at 2000 rows for browser perf, but the full log lives in memory.
  - New **Export current log** button in the live log header — downloads a CSV of every row processed so far, with all CSV columns + Success/Failed status + Dataverse error detail. Available mid-import or after completion.

## [1.10.6] — 2026-05-28
### Fixed
- **API Tester: History entries didn't visibly pre-fill the form**
  - Clicking a history (or template) entry now triggers a brief cyan border highlight on the request form for 700ms, so the user sees that the click took effect.
  - Defensive guards added on `loadHistory` and `loadTemplate`: missing or non-string fields in stored entries default to safe values (no more potential `undefined` reaching `setState`).
  - Headers values coerced to strings via `String(value ?? "")`.

## [1.10.5] — 2026-05-28
### Changed
- **Speed boosters: hidden for non-admin users**
  - The MSCRM bypass headers (`BypassCustomPluginExecution`, `SuppressDuplicateDetection`, `BypassSynchronousLogic`) require the `prvBypassCustomPlugins` privilege, granted by the System Administrator role.
  - Colvio now probes the current user's roles at connect time (new `isSystemAdmin` bridge action: `WhoAmI` → `systemusers(<id>)/systemuserroles_association` filtered by `name eq 'System Administrator'`) and sets `permissions.canBypassPlugins`.
  - The Speed boosters block in the Data Loader Preview step is hidden entirely for users without the role — no feature visibility they can't use, no need for Dataverse to return 403 mid-import.
  - Defense in depth: even if the toggles were somehow flipped on, the `doLoad` flow forces them to `false` for non-admin users before sending to the bridge.

## [1.10.4] — 2026-05-21
### Added
- **Data Loader: Speed boosters — server-side bypass headers**
  - New section in the Preview step with three opt-in toggles, each mapping to a Microsoft-documented `MSCRM.*` header injected on every individual request inside the multipart `$batch`:
    - **Bypass custom plugins** → `MSCRM.BypassCustomPluginExecution: true` — skips all custom plugins (sync + async). Typical gain: 100-500ms per record on orgs with active plugins.
    - **Suppress duplicate detection** → `MSCRM.SuppressDuplicateDetection: true` — skips duplicate-detection rules. Typical gain: 50-200ms per record.
    - **Bypass synchronous workflows** → `MSCRM.BypassSynchronousLogic: true` — broader scope, also covers sync workflows.
  - Warning banner appears when any booster is enabled (skipped business logic, requires `prvBypassCustomPlugins` privilege — typically System Administrator).
  - All boosters are off by default for safety.

## [1.10.3] — 2026-05-20
### Changed
- **Environment detection: now uses Microsoft's authoritative `OrganizationType`** instead of URL guessing
  - On connect, Colvio calls the `RetrieveCurrentOrganization` Web API bound function and reads `Detail.OrganizationType` (an enum returned by Dataverse itself)
  - Recognized values: `Production`, `Sandbox`, `CustomerTest` (→ UAT), `Trial`, `Preview`, `Support`, `Developer`, `Default`, `BCS`
  - Falls back to the URL heuristic only if the API call fails (older D365 versions, restricted permissions)
  - The badge tooltip now indicates the detection source: "Detected via Microsoft API (OrganizationType=CustomerTest)" or "Detected via URL pattern matching"
  - The connect call also captures `EnvironmentId`, `TenantId`, `Geo`, friendly name, and version for use across modules
- **`getContext` bridge call** now returns enriched org info — includes the Dataverse-authoritative env metadata in addition to the basic URL/orgName

## [1.10.2] — 2026-05-20
### Fixed
- **PROD/Sandbox detection: stop crying wolf on UAT, TEST, RECETTE, etc.**
  - Previously, the badge logic only checked `sandbox` and `dev` substrings in the URL — any URL like `org-uat.crm4.dynamics.com` was flagged as PROD (false positive).
  - New `detectEnv()` recognizes 14 non-prod indicators (sandbox, dev, test, uat, qa, staging, preprod, recette, demo, training, sit, trial, preview, hotfix) with word-boundary matching (surrounded by `-` or `.` so legit prod names like `interface.org.com` don't false-positive on `int`).
  - **Badge now shows the actual env type**: "UAT", "TEST", "RECETTE", "STAGING" instead of a generic "SANDBOX". Still red+⚠ for true PROD, green for everything else.

## [1.10.1] — 2026-05-20
### Added
- **API Tester: line numbers in the JSON body editor** — left gutter with synced scrolling, font-matched line-height for vertical alignment
- **API Tester: JSON error messages now include line numbers** — `"Unexpected token } at position 47"` becomes `"... (line 5)"`, so the user can jump straight to the issue using the gutter
- **API Tester: line count badge** — "✓ Valid JSON · 14 lines" when the body parses correctly

## [1.10.0] — 2026-05-20
### Added
- **New module: API Tester** — Postman-equivalent for Dataverse, built right into Colvio
  - Method picker (GET / POST / PATCH / PUT / DELETE) with color-coded indicator
  - URL field with the `/api/data/v9.2/` prefix shown as a fixed label (less typing, less typos)
  - Headers builder with autocomplete for common Dataverse headers (`Prefer`, `MSCRM.SuppressDuplicateDetection`, `MSCRM.BypassCustomPluginExecution`, `If-Match`, etc.)
  - JSON body editor with live validation + Format button (auto-indent)
  - Response panel: status code badge (colored by 2xx/3xx/4xx/5xx), elapsed time, body size, JSON-pretty-printed body, response headers table
  - **No auth setup needed** — uses your active D365 session cookies (same as the rest of Colvio); requests are scoped to your current org
  - **Templates** — 7 ready-to-go examples (WhoAmI, sample GET, CREATE, PATCH, UPSERT by alt-key, DELETE, etc.)
  - **History** — last 50 requests stored locally (chrome.storage.local), click any past request to reload it as the current draft
  - **Copy as cURL** for sharing in tickets / Slack / docs
  - Keyboard shortcut: Ctrl/Cmd+Enter in the URL field sends the request
  - **Same-origin guard** in content.js: requests are blocked if the target URL is not your active D365 host (no exfiltration risk)

## [1.9.6] — 2026-05-06
### Fixed
- **Data Explorer: stale FieldPicker state across entity changes**
  - When switching from one entity to another in Builder mode, the FieldPicker (popup that lists columns) kept its local search text, type filter, and "Custom only" toggle from the previous entity. The new entity's fields loaded correctly but appeared filtered/empty because the previous criteria still applied.
  - Fix: keyed the FieldPicker by entity logical name so React re-mounts a fresh instance with cleared filters whenever the user switches entity. Also applied the same pattern to ExpandCard's FieldPicker for safety.

## [1.9.5] — 2026-05-06
### Added
- **Metadata Browser: Export All Fields**
  - New CSV export button next to the existing OptionSets export
  - Columns: Logical Name, Display Name, OData Name (for $select), Type, Required, Custom
  - Available for any selected entity (not just those with picklists)
  - OData Name correctly reflects the `_logicalname_value` convention for Lookup/Customer types — paste directly into a `$select` clause
  - Useful for data dictionaries, documentation, custom field audits, and query-building

## [1.9.4] — 2026-05-03
### Added
- **Data Loader: massive overhaul**
  - Excel (XLSX/XLS) file support — drag-drop or paste, parsed via SheetJS to first sheet → CSV pipeline
  - Multipart `$batch` HTTP with **per-record changesets** for `batchUpsert` (was serial PATCH) and `batchCreate` — errors no longer cascade across the chunk
  - **Parallel worker pool** in bridge (CONCURRENCY=5, default) — ~5× speedup vs sequential
  - **Tunable performance** in Preview step: batch size (1-1000) × threads (1-10), defaults 200 × 6
  - **Live per-row import log** during the run: every line shown with its CSV columns + Success/Failed status + Dataverse error detail (last 100, newest first, content-driven column widths)
  - **Cancel mid-import** with graceful in-flight batch completion, partial-result preserved
  - **Alt-key direct bind** for Parent Lookups: when the lookup key is a registered alternate key on the target entity, skip the resolve query (no `?$filter=...` per unique value) and bind via `entity(field='value')` syntax — eliminates O(N unique values) extra GETs
  - **Smart upsert key dropdown**: alt-keys at top (recommended), primary key, then other fields. Default picks first alt-key over PK
  - **Smart parent lookup field dropdown**: shows all lookup fields on the load target with their target entity (`fou_accountextension → fou_accountextensionaviation`), auto-fills target entity on selection
  - **Auto-skip Lookup-type fields** in the Mapping step — prevents accidental writes to lookup `_value` columns that need `@odata.bind`
  - Auto-detect of dot-notation parent lookups now uses real D365 metadata (`bridge.getLookups`) instead of naive prefix-as-entity heuristic
  - Bridge: chunked IPC payloads (auto-splits batches > 500 records to stay under Chrome's 64 MB sendMessage cap)
  - New bridge action `getEntityKeys` (lists registered alternate keys for an entity)
- **Data Explorer: per-expand $filter**
  - Collection-typed expands (1:N) get a dedicated FILTER section in the ExpandCard with type-aware operators (string/numeric/date/lookup), AND/OR logic, identical UX to main WHERE
  - Single-valued expands (N:1) hide the filter section (Dataverse rejects $filter there)
  - Filters persisted in saved queries

### Fixed
- **Pagination silently capped at 5001 records** when filter expression contained parentheses (e.g. `(_field_value eq null)`). Root cause: `isDirectFetch` regex in `query` action used naive `path.includes("(")` which matched parens in `$filter` clause too — same bug already fixed in `queryRaw`. Tightened to `/^[^?]*\(/` (only matches paren before `?` query string)

## [1.9.1] — 2026-04-03
### Added
- Schema (ERD) tab: interactive Entity Relationship Diagram with multi-entity canvas, drag/zoom/pan, bezier relationship lines, expand/collapse cards, Tables/Fields toggle, Add Related button
- Schema export: PNG (2x retina), SVG (vector), Mermaid (.mmd) with auto-bounding box
- Translation Manager: non-renameable fields shown as read-only with lock icon (IsRenameable check)

### Fixed
- Translation Manager: fix label save — use GET+PUT pattern with typed cast and MSCRM.MergeLabels header (previous PATCH/SetLocLabels approaches returned HTTP 405/400)
- Translation Manager: lock non-renameable fields as read-only (IsRenameable check + lock icon)
- Translation Manager: show error message in UI on save failure
- Theme system: fix toggle regression — setThemeColors called before render, theme prop passed to all 11 tabs for instant re-render
- Theme system: dark mode by default on first launch (no flash)
- Theme audit: 38 findings fixed — Spin component, bt() helper, option elements, error backgrounds, type badges all use C.xxx tokens
- Custom field detection: exclude Microsoft solution prefixes (msdyn_, mspp_, msfp_, adx_, etc.) from "Custom only" filters
- Sidebar logo: use magnifying glass icon instead of lightning emoji
- Icons: all PNGs regenerated from SVG source
- content.js: include PUT in isWrite check for correct timeout handling

## [1.9.0] — 2026-03-27
### Added
- SQL query mode: 4th mode in Explorer (Builder | OData | FetchXML | SQL), recursive descent SQL parser, translates to FetchXML for reliable pagination
- Role-based tab access control: permission probes during connection phase, sensitive tabs hidden for non-admin users (zero flash)
- Help tab updated with 5 new sections (Login History, Users & Licenses, Security Audit, SQL Mode, Tab Visibility)
- Solution Explorer: resolve all 13 component types to display names
- User & License Monitor tab: load all D365 users with full pagination (no limit), display Access Mode, CAL Type, Business Unit, security roles, last login date
- Filter users by Active/Disabled/Non-Interactive, search by name/email/BU, sort by Name/Status/CAL/Access
- User detail panel: security roles list, last login from audit logs with "X days ago" indicator, Access Mode + CAL Type breakdown stats
- CSV export of full user list with formula injection protection
- Security Audit tab: browse all security roles with privilege viewer
- Readable privilege labels (prvDeleteAccount → Delete · Account)
- Org-level and sensitive privilege flags (30+ critical privileges detected)
- Privilege depth badges (User, BU, Parent:Child, Organization)
- Global privilege cache (loaded once, instant on subsequent role clicks)
- RetrieveRolePrivilegesRole OData function for accurate privilege retrieval
- 5 new API actions: getAllUsers, getUserRoles, getUserLastLogin, getAllRoles, getRolePrivileges
- ~25 i18n keys (EN + FR)

### Fixed
- OData mode now executes the raw user-typed OData URL instead of silently using Builder parameters
- FetchXML pagination: auto-fallback to page-number-only mode when paging cookie mismatch (0x80041129)
- getAllUsers: full pagination via @odata.nextLink, orderby=systemuserid for stable paging, 5min timeout

## [1.8.1] — 2026-03-26
### Security
- OData filter injection: validate numeric values (regex) and GUID format for Lookup/Customer types before unquoted insertion; invalid values fall back to quoted strings
- Bulk Update now requires confirm() dialog showing field, value, and record count
- CSV/TSV export: prefix formula-triggering characters (=, +, -, @) with single quote to prevent spreadsheet injection
- Query history strips $filter values before persisting to avoid storing PII
- D365 error messages parsed as JSON to extract user-facing message only (no server internals leaked)
- Content script fingerprint changed to non-enumerable property (anti-fingerprinting)
- Content Security Policy added to panel.html

### Fixed
- OData mode now executes the raw OData URL instead of silently using Builder parameters
- FetchXML pagination: auto-fallback to page-number-only mode when D365 returns paging cookie mismatch error (0x80041129), fixing systemuser and other plugin-affected entities
- 13 cross-feature state bugs fixed:
  - Explorer: race condition on fast entity switch (generation counter)
  - RelationshipGraph: depth-2 fetch loop not cancelled on re-selection
  - History click now restores mode (builder/odata/fetchxml)
  - loadSavedQuery/QueryTemplates: replaced setTimeout(500ms) with onFieldsReady callback
  - Results: sort/selection reset on new query
  - Loader: stale targetFields after entity change (generation counter)
  - TranslationManager: confirm dialog on unsaved edits before entity switch
  - LoginHistory: search timer moved from useState to useRef
  - Sidebar history stores mode and switches tab correctly

## [1.8.0] — 2026-03-26
### Added
- Help tab: built-in feature guide accessible from navigation
- Onboarding tour: 5-step first-launch walkthrough (persisted in localStorage)
- Keyboard shortcuts panel: Ctrl+/ to view all shortcuts
- Contextual tooltips: ? buttons on key features explaining what they do
- Query Templates: 5 pre-built queries for common consultant tasks
- Export feedback: shows row count after CSV/XLSX export
- Solution Explorer: resolve ALL 13 component types to display names (Entity, Attribute, OptionSet, Relationship, View, Chart, Web Resource, Plugin Type/Assembly, SDK Step, Security Role, Connection Role, Canvas App)
- Relationship Graph: section labels repositioned above cards with count badges
- ~60 new i18n keys (EN + FR)

### Fixed
- 30 production audit fixes (console.error removal, stale closures, missing deps, render-time side effects)
- French text remnants ("Tout", "Inspect un record") replaced with English
- RelationshipGraph labels no longer overlap entity cards
- Entity lists no longer capped at 50 in RelationshipGraph and TranslationManager
- Unused imports/exports cleaned across 7 files
- lang="fr" corrected to lang="en" in panel.html

## [1.7.0] — 2026-03-24
### Added
- Component architecture: split monolithic app.jsx into 15 component files
- Error boundaries: graceful crash recovery per tab
- i18n: English/French locale toggle
- Keyboard navigation: arrow keys in results table, Escape closes modals
- Session expired detection with reconnect banner
- Client-side rate limiting (10 req/sec max)
- System theme detection (prefers-color-scheme)
- Relationship Graph: N:N relationships + depth control (1-2 levels)
- Solution Explorer: component count badges
- Bulk delete safety: CanBeDeleted pre-check + typed confirmation

### Security
- OData injection: sanitizeSearchTerm for search inputs
- Input validation on all new API endpoints
- Rate limiting prevents API abuse

## [1.6.0] — 2026-03-24
### Added
- Relationship Graph tab: visual SVG entity relationship viewer
- Solution Explorer tab: browse D365 solutions and components
- Translation Manager tab: view/edit field labels, CSV export/import
- 6 new API endpoints (getSolutions, getSolutionComponents, getOrgLanguages, getAttributeLabels, updateAttributeLabel, publishEntity)
- Fix isExtension detection (chrome.runtime.id check)

## [1.5.0] — 2026-03-23
### Added
- Dark/Light theme toggle with localStorage persistence
- Query History: auto-save last 20 queries
- Bulk Update: select records and PATCH a field on all
- Bulk Delete: select and delete records with confirmation
- Export All OptionSets: bulk CSV export of Picklist/State/Status values

## [1.0.0] — 2026-03-15
### Added
- Data Explorer: query builder with SELECT, WHERE, EXPAND, LIMIT
- FetchXML mode with templates
- OData URL mode
- Virtual scrolling (60fps on 10,000+ records)
- Show All Data: record inspector
- Metadata Browser: entities, fields, OptionSets
- Login History: audit timeline with CSV export
- Data Loader: 5-step wizard with $batch OData
- XLSX, CSV, JSON export
- Saved queries (chrome.storage)
- Chrome Extension Manifest V3
