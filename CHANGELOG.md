# Changelog

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
