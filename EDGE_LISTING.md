# Microsoft Edge Add-ons — Submission Guide & Listing Copy

Colvio is fully compatible with Microsoft Edge (Chromium): same Manifest V3 package, every API
we use (`storage`, `unlimitedStorage`, `scripting`, `declarativeContent`, `webRequest`, `alarms`,
the manifest sandbox page of the Script Console, host access to `*.dynamics.com`,
`*.microsoftdynamics.us` and `*.dynamics.cn`) is supported by Edge. **No code changes are required** — our
manifest has no `update_url` and no browser-brand wording, the two usual blockers.

> Why Edge matters for Colvio: most enterprise Dynamics 365 users live in Edge.
> Publishing there is the single biggest distribution win available.

## One-time setup

1. Create a (free) **Microsoft Edge developer account**: Partner Center → Microsoft Edge program,
   sign in with a Microsoft account. No registration fee.
2. **Sideload-test first**: `edge://extensions` → Developer mode → Load unpacked → `dist/`.
   Smoke-test on a D365 org (connect, Explorer query, Loader dry run, API Tester GET).

## Submitting

1. Partner Center → **Microsoft Edge** workspace → *Create new extension*.
2. Upload the **same release zip** used for the Chrome Web Store (`colvio-<version>.zip`).
3. **Availability**: all markets, Public.
4. **Properties**: Category *Developer tools*. Support: https://github.com/zmissoum/colvio/issues
   Website: https://github.com/zmissoum/colvio
5. **Privacy**:
   - Single purpose: explore, load, test and audit Microsoft Dataverse / Dynamics 365 data using
     the user's own session.
   - Permission justifications: see table below.
   - Privacy policy URL (required): https://github.com/zmissoum/colvio/blob/main/PRIVACY.md
6. **Store listing**: use the copy below. Logo 300×300 PNG (1:1). Screenshots must be exactly
   **640×480 or 1280×800** (max 6) — re-export the Chrome screenshots at 1280×800.
7. **Notes for certification** (important — reviewers need a way to test): explain that the
   extension only activates on `*.dynamics.com` and requires a Dynamics 365 / Dataverse
   environment; mention a free Power Apps Developer Plan org can be created at
   https://powerapps.microsoft.com/developerplan/ for testing.
8. Publish → certification takes **up to 7 business days**.

### Permission justifications (paste into Partner Center)

| Permission | Justification |
|---|---|
| Host access to `*.dynamics.com`, `*.microsoftdynamics.us`, `*.dynamics.cn` | Read the Dynamics 365 page context (org URL, session) to call the user's own Dataverse Web API; the extension is inert everywhere else. |
| `scripting` | Inject the bridge that relays panel requests to the Dataverse Web API in the page's session context. |
| `storage` | Local cache of entity metadata, saved queries and user preferences, and (session memory only) the list of saves Record activity shows. Nothing leaves the browser. |
| `unlimitedStorage` | Keep the Script Console's rollback journal (the previous values of the rows a user's script changed, stored locally) whole past the default 10 MB quota: a journal cut by the quota could no longer undo the run. |
| `declarativeContent` | Enable the toolbar action only on Dynamics 365 pages. |
| `webRequest` | Observe, read-only, the Web API writes the user's Dynamics 365 tab sends (form saves), so Record activity can show what each save triggered. Requests are never blocked, modified or sent elsewhere. |
| `alarms` | Set the org's plug-in trace log back to its previous value at the time the user chose after turning on full logging. |

## Updates

Same flow as Chrome: upload the new zip (manifest `version` must increase) → Publish →
re-certification (≤7 business days). Users auto-update. Optionally automate with the
[Edge Add-ons REST API](https://learn.microsoft.com/microsoft-edge/extensions/update/api/using-addons-api)
alongside the existing release workflow.

---

## Listing copy

### Name
Colvio for Dynamics 365

### Short description (≤132 chars, from manifest)
Free, in-browser toolkit for Dynamics 365 / Dataverse. Query, inspect, load, test the API, audit — no setup, no account.

### Detailed description

Colvio — the free in-browser toolkit for Microsoft Dynamics 365 / Dataverse.

Colvio is a free, open-source browser extension that gives D365 consultants, admins and
developers instant access to their Dataverse data and Web API — right from Microsoft Edge,
with zero configuration. No API keys. No app registration. No account. Open a Dynamics 365
page, click the icon, start working.

KEY FEATURES — 24 modules

• Data Explorer — query any table with a visual Builder, OData, FetchXML or SQL (native
  Dataverse ?sql= engine with real JOINs, or the built-in transpiler), SQL completed as you
  type, many-to-many tables included. No 5,000-row cap, virtual scrolling, inline edit typed by
  field metadata, bulk update / delete, SQL UPDATE / DELETE always previewed, duplicate finder,
  exports, and "To file" streaming every row whatever the size.

• Data Loader — CSV / Excel in: CREATE, UPSERT (GUID or alternate key), UPDATE-only (native
  If-Match — never creates) and DELETE, plus N:N tables loaded by association. Dry run with zero
  writes, rollback of what a run created, delta mode, parallel $batch (~3-4k records/second),
  live per-row log.

• Show All Data — every field of the open record, editable in place; Record activity (what a
  save triggered: plug-ins, jobs, flows); Record access (why a user can or can't see or edit
  it, and what would grant a no); field-level change history. Recycle Bin restores deleted rows.

• Develop — Script Console (JavaScript on the Web API with a dry run and a rollback journal,
  run isolated), API Tester, Metadata (fill rate, dependencies, solution layers, choice values,
  columns from a sheet), Automation (plug-in steps on / off, who runs what), Web Resources,
  Apps, Solutions, Environment Variables, Translations, ERD and relationship graph.

• Admin — users & licenses with bulk settings, business units, security audit, teams,
  adoption analytics with a PowerPoint report, login history, storage per table, a health
  check of the environment, and system jobs / plug-in traces.

• One Colvio per environment — DEV and PROD side by side, each in its own tab with its work.

PRIVACY FIRST
Zero data collection. No telemetry, no external servers — every request goes to your own
Dataverse org using your existing session, and your security roles always apply. Open source
(MIT): github.com/zmissoum/colvio

English + French · Dark & light themes · Free forever, no "Pro" tier.
