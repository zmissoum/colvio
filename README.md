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
- **Query Builder** — visual SELECT, WHERE (AND/OR groups, 14 operators), EXPAND (parent + child), LIMIT
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

### Show All Data
- Auto-detect current record from D365 tab
- Card layout: Logical Name, label, type, value
- Clickable lookup links, copy individual fields or full JSON

### Metadata Browser
- Browse entities, fields, OptionSets by category
- OptionSet modal viewer with Value, Label, Description, Color
- **Export All OptionSets** — bulk CSV export of all Picklist/State/Status values for an entity
- Entity record counts, field type badges, custom field indicators

### Data Loader
- 5-step wizard: Source > Mapping > Lookups > Preview > Run
- CSV drag-drop or paste from Excel
- Smart auto-mapping, lookup resolution (GUID + search), transforms
- OData $batch (100/batch), CREATE or UPSERT with alternate key support
- Progress tracking with error log

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
- **13 component types resolved to display names** (Entity, Attribute, OptionSet, Relationship, View, Chart, Web Resource, Plugin Type/Assembly, SDK Step, Security Role, Connection Role, Canvas App)
- Managed/Unmanaged badges, component counts

### Translation Manager
- View and edit field labels across multiple languages inline
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
- **Role-based tab access** — sensitive tabs auto-hidden for non-admin users (zero flash)
- Dark/Light theme (+ system preference detection)
- English/French toggle (i18n)
- Export: XLSX, CSV, JSON — copy or download
- Session expiration detection with Reconnect button
- Error boundaries per tab (graceful crash recovery)
- Rate limiting (10 req/sec)
- Intelligent caching (memory + chrome.storage.local)

## Stats

| Metric | Value |
|--------|-------|
| Lines of code | ~7,100 |
| API actions | 35 |
| React components | 22 |
| Source files | 32 |
| Build size | ~680 KB |
| Languages | EN / FR |
| Price | Free |

## Security

Colvio has been through a full security audit. Results: **0 critical, 0 high, 0 medium open findings**.

### Data Protection
- **Zero data exfiltration** — no external servers, no analytics, no telemetry
- **PII protection** — query history strips filter values before persisting
- **CSV formula injection protection** — exported cells prefixed to prevent spreadsheet formula execution
- **Anti-fingerprinting** — content script marker is non-enumerable

### Input Validation
- **Entity/field name validation** — all names validated with regex in the content script
- **OData injection protection** — numeric filter values validated, Lookup GUIDs format-checked
- **Content Security Policy** — explicit CSP on panel.html

### Write Operation Safeguards
- **Typed confirmation on bulk delete** — you must type the entity name to confirm
- **CanBeDeleted pre-check** — verifies entity metadata before allowing delete
- **Confirm dialog on bulk update** — shows field name, value, and record count
- **Client-side rate limiting** — max 10 requests/second to prevent API abuse
- **Server-side enforcement** — all write operations respect your D365 security roles, Colvio cannot bypass RBAC

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

### From Chrome Web Store
[Install Colvio](https://chromewebstore.google.com/detail/colvio-for-dynamics-365/edieednbdaclheikneelkjfbckibhdgl)

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT License — see [LICENSE](LICENSE) for details.

**[github.com/zmissoum/colvio](https://github.com/zmissoum/colvio)**
