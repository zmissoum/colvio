# Chrome Web Store Listing — Colvio

## Short Description (132 chars max)
Free, in-browser toolkit for Dynamics 365 / Dataverse. Query, inspect, load, test the API, audit — no setup, no account.

## Detailed Description

Paste-ready plain text, refreshed for v1.11.210 (one Colvio per environment, Script Console, who runs what, SQL completion and N:N tables, Record activity, Record access, Health check, writes on plug-in steps / choice values / columns from file / web resources, data-model tools, SQL UPDATE / DELETE, Explorer streaming, big-org reads):

- English → `store/description_en.txt` (~9,300 characters)
- French → `store/description_fr.txt` (~11,200 characters) — add French under Store listing → language selector, so French-speaking users get it

The full feature-by-feature reference lives in README.md; the store text stays short enough to be read.

## Privacy practices — permission justifications (Developer Dashboard › Privacy tab)

Paste one per permission. New in v1.11.178: `webRequest`, `alarms`; new in v1.11.202: `unlimitedStorage` (none of them shows an install warning; the host permissions are unchanged).

- **scripting** — Injects Colvio's API proxy script into the user's Dynamics 365 tab, so requests run with the user's own session.
- **storage** — Keeps saved queries, history, templates and a metadata cache locally, and (session memory only) the list of saves Record activity shows.
- **declarativeContent** — Enables the toolbar icon on Dynamics 365 pages only.
- **webRequest** — Observes, read-only, the Web API writes the user's Dynamics 365 tab sends (form saves), so Record activity can show what each save triggered (plug-ins, jobs, flows). Only the record, column names, status and timing are kept, in session memory; requests are never blocked, modified or sent elsewhere.
- **alarms** — Sets the org's plug-in trace log back to its previous value at the time the user chose after turning on full logging.
- **unlimitedStorage** — Keeps the Script Console's rollback journal (the previous values of the rows a user's script changed, stored locally in the browser) whole even past the default 10 MB local quota: a journal cut by the quota could no longer undo the run. Nothing leaves the browser.
- **Host permissions (*.dynamics.com, *.microsoftdynamics.us, *.dynamics.cn)** — Colvio only talks to the user's own Dynamics 365 / Dataverse environment.

Single purpose: a toolkit to explore, inspect, load and audit the user's own Dynamics 365 / Dataverse data. No data collection, no remote code, no third-party server.

## Category
Developer Tools

## Language
English, French

## Graphic assets (generated — `cd tools/video && node store-shots.mjs`)

Screenshots, 1280×800, 24-bit PNG, full bleed — upload in this order (EN listing: `store/en/`, FR listing: `store/fr/`):
1. `01_explorer.png` — Data Explorer: Builder filter + results
2. `02_showalldata.png` — Show All Data: every field of a record
3. `03_security.png` — Security Audit: role privilege matrix
4. `04_adoption.png` — Adoption: DAU / WAU / MAU dashboard
5. `05_storage.png` — Storage: rows & file storage per table

Small promo tile 440×280 (required): `store/promo_small_440x280.png`
Marquee promo tile 1400×560 (optional): `store/marquee_1400x560.png`
Promo video (already on YouTube — the 1080p tour, `tools/video/out/upload/colvio_tour_en.mp4`): paste https://youtu.be/QTexhCTIGWI in "Global promo video".

All from demo mode — no real organization on screen.
