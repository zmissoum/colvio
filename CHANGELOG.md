# Changelog

## [1.9.1] — 2026-03-31
### Fixed
- Translation Manager: fix label save — use GET+PUT pattern with typed cast and MSCRM.MergeLabels header (previous PATCH/SetLocLabels approaches returned HTTP 405/400)
- Translation Manager: show error message in UI on save failure instead of silent fail
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
