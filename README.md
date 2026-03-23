# 🔍 Colvio for Dynamics 365

> Data Explorer, Loader & Inspector for Microsoft Dynamics 365 / Dataverse

<div align="center">
  <img src="icons/icon128.png" alt="Colvio" width="80"/>
</div>

Colvio is a free Chrome extension that lets consultants, admins, and developers explore, query, and manage data from any Dynamics 365 / Dataverse environment — directly from the browser, with zero configuration.

## Features

### Data Explorer
- **Query Builder** — visual SELECT, WHERE (AND/OR groups, 14 operators), EXPAND (parent + child), LIMIT
- **FetchXML mode** — textarea with 3 templates (simple, inner join, aggregation) + paging cookie pagination
- **OData mode** — raw OData URL editing
- **Column sorting** — click any header to sort ASC/DESC with ▲▼ indicators
- **Inline edit** — double-click any cell to PATCH the value directly in D365
- **Virtual scrolling** — 60fps on 10,000+ records (only ~35 rows rendered)
- **Auto-pagination** with live timer, always-visible Stop button
- **Saved queries** — persist across sessions
- **Copy OData URL** — one-click copy for Postman/browser
- **Clickable lookups** — ↗ opens target record in D365 (zero extra API calls)

### Show All Data
- Auto-detect current record from D365 tab
- Card layout: Logical Name, label, type, value — no horizontal scroll
- Clickable lookup links to target record in D365

### Metadata Browser
- Browse entities, fields, OptionSets
- **OptionSet modal viewer** — popup with Value, Label, Description, Color columns
- On-demand fetch from D365 API (cached 1h)
- Entity record counts in sidebar

### Data Loader
- 5-step wizard: Source → Mapping → Lookups → Preview → Run
- $batch OData (100/batch, ~10x faster), Direct GUID lookups, UPSERT primary key
- Transforms: statecode, picklist, boolean, int, float, date_iso

### Login History
- Session duration, access type breakdown, CSV export

### Export
- XLSX (native Excel), CSV, JSON — copy or download

## Stats

| Metric | Value |
|--------|-------|
| Lines of code | 3,598 |
| API actions | 20 |
| Features | 36 |

## Security

No data leaves the browser. No external servers. No analytics. Manifest V3. Input validation on all API params. Open source.

## Install

```bash
git clone https://github.com/zmissoum/colvio.git
cd colvio
npm install
npm run build
```

Chrome → `chrome://extensions` → Developer Mode → Load unpacked → `dist/`

## License

Copyright (c) 2026 Zakaria Missoum. All rights reserved.

**[github.com/zmissoum/colvio](https://github.com/zmissoum/colvio)**
