# Colvio for Dynamics 365

> The SF Inspector equivalent for Microsoft Dynamics 365 / Dataverse — free, open-source, in the browser.

<div align="center">
  <img src="icons/icon128.png" alt="Colvio" width="80"/>
</div>

Colvio is a **free and open-source** Chrome extension that lets consultants, admins, and developers explore, query, and manage data from any Dynamics 365 / Dataverse environment — directly from the browser, with zero configuration.

**No API keys. No app registration. No subscription.** Just click the icon on any D365 page and start working.

## Why Colvio?

If you're coming from Salesforce, you know SF Inspector. You know how essential it is to have a free, fast, in-browser tool for data exploration and debugging. **D365 didn't have one. Now it does.**

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

### Solution Explorer
- Browse solutions and components grouped by type
- **13 component types resolved to display names** (Entity, Attribute, OptionSet, Relationship, View, Chart, Web Resource, Plugin Type/Assembly, SDK Step, Security Role, Connection Role, Canvas App)
- Managed/Unmanaged badges, component counts

### Translation Manager
- View and edit field labels across multiple languages inline
- Export/Import CSV for bulk translation workflows
- Save changes + auto-publish entity

### Login History
- User search, login/logout audit timeline
- Session duration calculation, access type breakdown, CSV export

### Help & Onboarding
- Built-in Help tab with feature guide
- First-launch onboarding tour (5 steps)
- Keyboard shortcuts panel (Ctrl+/)
- Contextual tooltips on key features

### Global
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
| Lines of code | 5,112 |
| API actions | 28 |
| React components | 19 |
| Source files | 26 |
| Build size | ~620 KB |
| Languages | EN / FR |
| Price | Free |

## Security

Colvio has been through a full security audit. Results: **0 critical, 0 high, 0 medium open findings**.

- **Zero data exfiltration** — no external servers, no analytics, no telemetry
- **Input validation** — all entity names, field names, and GUIDs validated with regex in the content script
- **OData injection protection** — numeric filter values validated, Lookup GUIDs format-checked
- **CSV formula injection protection** — exported cells prefixed to prevent spreadsheet formula execution
- **Content Security Policy** — explicit CSP on panel.html
- **Anti-fingerprinting** — content script marker is non-enumerable
- **PII protection** — query history strips filter values before persisting
- **Bulk operation safeguards** — confirm dialogs on delete and update, CanBeDeleted pre-check
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
*Coming soon*

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Copyright (c) 2026 Zakaria Missoum. All rights reserved.

**[github.com/zmissoum/colvio](https://github.com/zmissoum/colvio)**
