# Microsoft Edge Add-ons — Submission Guide & Listing Copy

Colvio is fully compatible with Microsoft Edge (Chromium): same Manifest V3 package, every API
we use (`storage`, `scripting`, `activeTab`, `declarativeContent`, content scripts on
`https://*.dynamics.com/*`) is supported by Edge. **No code changes are required** — our
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
| `activeTab` / content script on `*.dynamics.com` | Read the Dynamics 365 page context (org URL, session) to call the user's own Dataverse Web API; the extension is inert everywhere else. |
| `scripting` | Inject the bridge that relays panel requests to the Dataverse Web API in the page's session context. |
| `storage` | Local cache of entity metadata, saved queries and user preferences. Nothing leaves the browser. |
| `declarativeContent` | Enable the toolbar action only on Dynamics 365 pages. |

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

KEY FEATURES

• Data Explorer — query any table four ways: visual Builder, OData, FetchXML or SQL
  (auto-translated to FetchXML). No 5,000-row cap, virtual scrolling, inline edit,
  bulk update/delete, CSV/XLSX/JSON exports.

• Data Loader — import CSV/Excel files with four modes: CREATE, UPSERT (GUID or alternate
  key), UPDATE-only (native If-Match — never creates) and DELETE. Dry run simulates the whole
  import with zero writes; Rollback undoes the records a run just created; Delta mode sends
  only the fields that changed. Parallel $batch engine, ~3-4k records/second, live per-row log.

• API Tester — a Postman-style client for the Dataverse Web API, authenticated by your
  session. Header autocomplete, JSON validation, templates, cURL export, request history
  with secrets redacted.

• Recycle Bin — list and restore deleted records (server-side restore via the platform's
  "keep deleted records" feature), with every Microsoft limitation explained in plain words.

• Change history — field-level audit timeline (who changed what, when, old → new) on any record.

• System Ops — system jobs monitor (find and cancel stuck workflows) and plug-in trace viewer.

• Metadata & modeling — metadata browser with data-dictionary exports, interactive ERD,
  relationship graph, schema snapshot & diff between environments.

• Governance — users & licenses (CAL types, last login, unused licenses), security role
  audit (privilege depths, sensitive flags), per-user login history.

PRIVACY FIRST
Zero data collection. No telemetry, no external servers — every request goes to your own
Dataverse org using your existing session, and your security roles always apply. Open source
(MIT): github.com/zmissoum/colvio

English + French · Dark & light themes · Free forever, no "Pro" tier.
