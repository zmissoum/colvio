# LinkedIn plan — Colvio's features in video

**Goal:** show Colvio's features in video — nothing else. Posts 1–25 (`linkedin-posts.md`) already introduced Colvio and announced each release; none showed the features in motion. So here: no release news, no "what's new", no behind-the-scenes. One post = one video + what it shows.

**Language:** English only — posts, comments and videos (the `_en.mp4` files).

**21 posts, 21 videos:** the tour (2 min 54, 20 modules), then one deep-dive video per module (52 s to 1 min 54) — every module except System Ops. Captions burned in, demo data only.

**Start:** J = the first Tuesday after the Chrome Web Store shows **v1.11.176** (or later). The videos show Teams, Storage, Bulk settings, the current Login History and the enriched demos, which older store versions don't have.

## Posting rules

- **Colvio** page, "we / Colvio" voice (never "I").
- Upload the **MP4 natively** to LinkedIn (no YouTube link: native video reaches far more people). Captions are burned in, so the video works muted.
- **Link in the first comment**, never in the post: `🔗 Chrome Web Store: https://chromewebstore.google.com/detail/edieednbdaclheikneelkjfbckibhdgl · Source: https://github.com/zmissoum/colvio`
- Reply to **every comment within the first hour**.
- Every claim in the texts is visible in the video or in its chapter captions (`tools/video/deep/<module>.mjs`).

## Calendar

Two posts a week for the first month (Tuesday 8:30, Thursday 17:30), then one a week on Tuesdays. The dates are an example if v1.11.176 is live on Monday, October 12, with a break over the holidays. Tick "Posted" as you go.

| Post | Week | Slot | Date (example) | Topic | Video (`tools/video/out/…`) | Length | Posted |
|---|---|---|---|---|---|---|---|
| 26 | 1 | Tue 8:30 | Oct 13 | Colvio in a few minutes (tour) | `video/colvio_tour_en.mp4` | 2 min 54 | ☐ |
| 27 | 1 | Thu 17:30 | Oct 15 | Data Explorer | `deep/colvio_explorer_en.mp4` | 94 s | ☐ |
| 28 | 2 | Tue 8:30 | Oct 20 | Data Loader | `deep/colvio_loader_en.mp4` | 95 s | ☐ |
| 29 | 2 | Thu 17:30 | Oct 22 | Security Audit | `deep/colvio_security_en.mp4` | 90 s | ☐ |
| 30 | 3 | Tue 8:30 | Oct 27 | Adoption | `deep/colvio_adoption_en.mp4` | 87 s | ☐ |
| 31 | 3 | Thu 17:30 | Oct 29 | Storage | `deep/colvio_storage_en.mp4` | 62 s | ☐ |
| 32 | 4 | Tue 8:30 | Nov 3 | Users & Licenses + Bulk settings | `deep/colvio_licenses_en.mp4` | 1 min 53 | ☐ |
| 33 | 4 | Thu 17:30 | Nov 5 | Show All Data | `deep/colvio_showalldata_en.mp4` | 67 s | ☐ |
| 34 | 5 | Tue 8:30 | Nov 10 | Apps | `deep/colvio_apps_en.mp4` | 68 s | ☐ |
| 35 | 6 | Tue 8:30 | Nov 17 | API Tester | `deep/colvio_apitester_en.mp4` | 1 min 54 | ☐ |
| 36 | 7 | Tue 8:30 | Nov 24 | Recycle Bin | `deep/colvio_recyclebin_en.mp4` | 79 s | ☐ |
| 37 | 8 | Tue 8:30 | Dec 1 | Business Units | `deep/colvio_bu_en.mp4` | 81 s | ☐ |
| 38 | 9 | Tue 8:30 | Dec 8 | Solutions | `deep/colvio_solutions_en.mp4` | 70 s | ☐ |
| 39 | 10 | Tue 8:30 | Dec 15 | Environment Variables | `deep/colvio_envvars_en.mp4` | 75 s | ☐ |
| 40 | 11 | Tue 8:30 | Jan 5 | Automation | `deep/colvio_automation_en.mp4` | 72 s | ☐ |
| 41 | 12 | Tue 8:30 | Jan 12 | Metadata | `deep/colvio_metadata_en.mp4` | 83 s | ☐ |
| 42 | 13 | Tue 8:30 | Jan 19 | Schema | `deep/colvio_schema_en.mp4` | 76 s | ☐ |
| 43 | 14 | Tue 8:30 | Jan 26 | Relationships | `deep/colvio_relationships_en.mp4` | 59 s | ☐ |
| 44 | 15 | Tue 8:30 | Feb 2 | Teams | `deep/colvio_teams_en.mp4` | 73 s | ☐ |
| 45 | 16 | Tue 8:30 | Feb 9 | Translations | `deep/colvio_translations_en.mp4` | 64 s | ☐ |
| 46 | 17 | Tue 8:30 | Feb 16 | Login History | `deep/colvio_logins_en.mp4` | 52 s | ☐ |

To re-render a video after a UI change: `node make-deep.mjs --module=<module> --lang=en` or `node make-video.mjs --lang=en --no-clips` in `tools/video` (see its README).

## The 21 posts

### Post 26 — Colvio in a few minutes (tour) (2 min 54)

🎬 2 min 54, 20 modules, zero setup.

We keep getting the same question: "OK, but what does Colvio actually DO?"

Here's the answer, in motion: 20 modules on demo data, back to back.

🔎 Data: query any table (Builder, OData, FetchXML or SQL), load a spreadsheet, restore deleted records, inspect every field of a record
🛠 Develop: API tester, metadata, automation, apps, relationships, data model diagram, solutions, environment variables, translations
🛡 Admin: users & licenses, business units, security roles, teams, adoption, login history, storage

What you won't see in the video: a sign-up screen, an API key, an app registration. Colvio runs in your browser on the Dynamics 365 session you already have, and talks to nothing but your own org.

Over the next weeks we'll take them one by one, each in its own video.

Which module would you open first? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #OpenSource

---

### Post 27 — Data Explorer (`explorer`, 94 s)

⏱ 94 seconds inside Colvio's Data Explorer.

One table, one query, and everything you can do with it in eight steps:

1. Pick a table and its columns (every table shows its row count)
2. Filter visually, with operators that fit each column type
3. Run it (no 5,000-row cap), then sort and narrow down the results
4. See the same query in OData or FetchXML, or write SQL: run natively by Dataverse, or converted to FetchXML
5. Double-click a cell to edit it: the value is checked against the column's type before anything is sent
6. Tick records, pick a column and a value: one bulk update, confirmation first
7. Find duplicates on the columns YOU choose, with the extras pre-selected for cleanup
8. Query tabs, a history with filter values redacted, and Excel / CSV / JSON exports

All on demo data. No real org on screen.

Which of the eight do you still do by hand today? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #DataManagement

---

### Post 28 — Data Loader (`loader`, 95 s)

📥 From a spreadsheet to Dataverse, without a single blind click.

▶️ 95 seconds in Colvio's Data Loader:

→ Paste rows straight from Excel: the delimiter is detected, the headers come along
→ Pick the target table: columns named after a field map themselves
→ Four modes: CREATE, UPSERT on an alternate key, UPDATE that never creates, DELETE with a typed confirmation, and Delta skips rows that wouldn't change
→ Checked before anything is sent: the exact record that will be written, and pre-flight warnings
→ One transform per column: option-set labels to values, HTML to plain text
→ A dry run that writes nothing, then the real load: every row lands in a live log, and any row shows the exact request sent
→ Rollback: type ROLLBACK and the records this run created are deleted again

Demo data in the video. Free and open source.

What's the biggest file you've ever had to load into Dataverse? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #DataMigration

---

### Post 29 — Security Audit (`security`, 90 s)

🛡 "Who can delete accounts in this org?"

The question every audit asks, and the one the role editor makes you answer role by role.

▶️ 90 seconds in Colvio's Security Audit:

→ Every role in plain words: Org-level grants and sensitive privileges (deletes, exports, user and role admin, customization) counted and flagged
→ The matrix view: each table × the 8 access rights, depth drawn as a filling circle
→ Who really holds the role: members across every business-unit copy, and the teams that pass it on without it ever showing on the user
→ Assigning the role to a list of people: paste their emails, Colvio picks each user's own business-unit copy of the role
→ Org-wide in one scan: pick a right and a minimum depth ("Delete" at Organization), then flip it by table, exportable to CSV or Excel

Demo data in the video. Free and open source.

When did you last review who can delete what? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #SecurityAudit

---

### Post 30 — Adoption (`adoption`, 87 s)

📈 "How many people actually use the CRM we pay for?"

Management asks. Nobody has the number ready.

▶️ 87 seconds in Colvio's Adoption module:

→ Access events, distinct users, DAU / WAU / MAU, read from Dataverse's own access audit
→ The trend, day by day: logins, distinct users, or both
→ Who uses it most, by active days or most recent access
→ The list nobody has ready: users who never signed in
→ Everyone in scope with license and inactivity: who hasn't been in for 30 days or more
→ Filter by security role or business unit, sub-units included; 7, 30, 90 days or a custom range
→ Compare with the previous period, export to CSV or Excel, or a 5-slide PowerPoint

Honest by design: Dataverse records access at most once per user per interval (4 h by default), so Colvio counts "access events", not logins, and service accounts are left out by default. It needs "Audit user access" turned on, and the screen says so.

If you could know one adoption number for your org today, which would it be? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #Adoption

---

### Post 31 — Storage (`storage`, 62 s)

💾 "We're over our Dataverse capacity. Which tables are filling it?"

The admin center tells you HOW MUCH you use. It doesn't tell you WHERE.

▶️ 62 seconds in Colvio's Storage module:

→ Row counts for every table in the org, in seconds, read from Dataverse's own snapshot (refreshed by the platform, at most 24 h old)
→ The tables that grow silently (audit, system jobs, workflow logs, plug-in traces, emails, import leftovers), each with the cleanup that applies
→ File storage measured in real bytes per table: notes, file and image columns, email attachments
→ Filter by storage class (Database, File, Log) or search any table
→ Refresh on demand

What it won't pretend: the GB you're billed on only live in the Power Platform admin center. Colvio says so on screen and links you there.

What's the biggest table in your org, and would you have guessed it? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #Storage

---

### Post 32 — Users & Licenses (`licenses`, 1 min 53)

🎫 Day one of a Dynamics 365 rollout: hundreds of users who all need the same email tracking, time zone and language.

▶️ 1 min 53 in Colvio's Users & Licenses module:

→ Every user with license (CAL) type, status and last login; disabled and service accounts in one click
→ Open a user: business unit, access mode, license, security roles; org-wide breakdowns; export to CSV or Excel
→ Bulk settings: pick a personal setting (email tracking, time zone, language, currency…) or a mailbox option, with each user's current value in plain words
→ Keep only the people who actually sign in, then see each user's change before anything is written
→ Apply: a confirmation first, 4 writes at a time, and a result per user with the server's reason if one is refused
→ Mailboxes too: server-side sync delivery methods and email approval, with the rights approval needs spelled out

Demo data in the video. Free and open source.

Which setting do you end up changing for everyone at the start of a project? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #CRMAdmin

---

### Post 33 — Show All Data (`showalldata`, 67 s)

👁 The form shows 30 fields. The record has 120.

▶️ 67 seconds in Show All Data:

→ Paste a record URL (or table/GUID): every filled column with its logical name, label and type
→ Type to find a column, by logical name or label
→ Tick "Empty columns" to list every column of the table, filled or not
→ Choice columns show their label, not the stored number
→ "Custom only" keeps your own publishers' columns; Microsoft's msdyn_ and adx_ ones stay out
→ Copy a value, the record's GUID, or the whole record as JSON

On your own org (not shown with demo data): edit a value in place, lookups included, with field security still enforced by Dataverse.

Which field do you always end up hunting for? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #PowerApps

---

### Post 34 — Apps (`apps`, 68 s)

🧩 "Why does this form show up in that app?"

Often because of one checkbox: "include all forms". Left on, it brings every current AND future form of the table into the app, and the maker portal doesn't show that state afterwards.

▶️ 68 seconds in Colvio's Apps module:

→ Each app's tables, forms and views, badged EXPLICIT (hand-picked) or IMPLICIT (brought in by include-all)
→ The modern command-bar buttons the app surfaces
→ A form's subgrids: the child table, the view each one renders, the relationship behind it
→ Open that view: its filters, columns and sort, the answer to "why isn't my row in this subgrid?"
→ Reverse lens: type a form, view or button name and see every app that exposes it
→ One click sends the view's FetchXML to the Data Explorer

Demo data in the video. Free and open source.

Ever had a form appear where nobody added it? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #PowerApps

---

### Post 35 — API Tester (`apitester`, 1 min 54)

🧪 Calling the Dataverse Web API shouldn't start with an app registration.

▶️ 1 min 54 in Colvio's API Tester, on the session you're already signed in with:

→ Seven ready-made requests: WhoAmI, create, upsert by alternate key, delete…
→ Any query after /api/data/v9.2/ ($select, $filter, $top) with status, time, size and pretty-printed JSON
→ Add headers (Prefer for formatted values) and read the ones that come back
→ A JSON editor that names the line of a syntax error
→ Create a record: 204 with the new record's URL, or the record itself with return=representation
→ DELETE asks twice, and requests only go to your own org
→ History with filter and body values blanked, tabs, copy as cURL

Demo data in the video. Free and open source.

What's the first request you'd send? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #WebAPI

---

### Post 36 — Recycle Bin (`recyclebin`, 79 s)

🗑 "Someone deleted 140 accounts last night. Can we get them back?"

If the org keeps deleted records for that table, yes, and Colvio shows you what's in the bin.

▶️ 79 seconds in Colvio's Recycle Bin:

→ Only the tables enabled for restore, with the org's retention
→ Each deleted record with who deleted it and when, plus who created and last modified it
→ Page through a mass delete 100 to 1,000 rows at a time, and search by name across the whole bin
→ Export the list before you restore, as evidence
→ Restore with Dataverse's own Restore action: the record comes back and leaves the bin
→ When a restore is refused (here, a live record already uses the same alternate key), the reason and the fix, record by record
→ The platform's limits spelled out under the list

Demo data in the video. Free and open source.

Has a mass delete ever ruined your morning? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #DataRecovery

---

### Post 37 — Business Units (`bu`, 81 s)

🏢 A reorganisation reaches the admin as a spreadsheet of email addresses.

▶️ 81 seconds in Colvio's Business Units module:

→ The whole BU tree with each unit's direct user count, or a real org chart: unfold branches, zoom, export it as PNG
→ Open a BU: direct members, the total including sub-BUs, exports for the BU alone or its whole subtree
→ Members with access mode and license type; disabled accounts stand out
→ Paste the list of emails (Outlook format included): every match is ticked, anyone not in this BU is listed
→ Move them to another BU, with a warning about security roles BEFORE anything is written, then the result user by user

Demo data in the video. Free and open source.

How many business units does your org have? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #CRMAdmin

---

### Post 38 — Solutions (`solutions`, 70 s)

📦 "What's different between DEV and PROD?"

▶️ 70 seconds in Colvio's Solutions module:

→ Every solution with its version and component count, managed or unmanaged
→ What's inside, grouped by type: tables, columns, option sets, views, charts, plug-in assemblies
→ The full component list to CSV or Excel: your deployment checklist
→ Compare two solutions of the org: only here, in both, only there
→ Across orgs: export a compare file on DEV, load it on PROD, read the drift type by type, matched by GUID or by type and name

Demo data in the video. Free and open source.

How do you check a deployment today? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #ALM

---

### Post 39 — Environment Variables (`envvars`, 75 s)

⚙️ An environment variable with no value doesn't fail at import. It fails later, as an empty string in a flow or a plug-in.

▶️ 75 seconds in Colvio's Environment Variables module:

→ Counts and lists the variables with no current value AND no default: the classic post-deployment trap
→ Typed editing: yes/no for booleans, JSON must parse, numbers must be numbers; an invalid value is refused with the reason, before anything is sent
→ Clear an override to fall back to the definition's default
→ See what this environment overrides
→ Secret variables: Colvio shows and edits the Key Vault reference, never the secret
→ Export with default, current value and where the effective value comes from

Demo data in the video. Free and open source.

Ever been caught by an empty variable after a deployment? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #ALM

---

### Post 40 — Automation (`automation`, 72 s)

⚡ "Why did this field change?"

Before opening the Plugin Registration Tool, look at everything registered to run, on one screen.

▶️ 72 seconds in Colvio's Automation module:

→ Every plug-in step: plug-in type, message, table, stage, sync or async, state, source
→ Filter by assembly, table or message in seconds
→ Only the disabled steps: the first check when "my plug-in doesn't fire"
→ Custom, managed or Microsoft (best effort, from publisher prefixes and the managed flag)
→ Classic workflows with their triggers, and a tab per process type: cloud flows, business rules, actions, BPFs, dialogs, desktop flows
→ Export what's on screen for the audit

Read-only, so it's safe to explore in production. Demo data in the video. Free and open source.

Plug-ins or flows: where does most of your logic live? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #PowerAutomate

---

### Post 41 — Metadata (`metadata`, 83 s)

📚 A data dictionary in one click.

▶️ 83 seconds in Colvio's Metadata module:

→ Tables filtered by category, with Virtual and Elastic tables singled out
→ Every column with its label and type, required and custom ones marked
→ Option set values, number by number, exportable
→ Click a logical name to copy it, ready for FetchXML, code or Power Automate
→ Export every column of a table (logical name, label, OData name, type, required, custom) or every option set value
→ Schema snapshot: export it as JSON on one org, load it on another, and see missing tables and columns, type and requirement gaps

Demo data in the video. Free and open source.

Do you keep your data dictionary up to date? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #DataModel

---

### Post 42 — Schema (`schema`, 76 s)

🗺 Your Dataverse data model, drawn from the org itself.

▶️ 76 seconds in Colvio's Schema module:

→ Click tables: each lands on the canvas with its columns and types, lookups first
→ Each lookup curves to its target table; hover one to light it up
→ N:N relationships as dashed lines between card headers
→ The + on a card adds the tables its lookups point to
→ Drag the cards, pan, zoom, Fit: every curve follows
→ Every column, or tables only for the big picture
→ Export as PNG, SVG or a Mermaid erDiagram for your docs

Demo data in the video. Free and open source.

How do you document your data model today? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #DataModel

---

### Post 43 — Relationships (`relationships`, 59 s)

🔗 Your data model, one click at a time.

▶️ 59 seconds in Colvio's Relationships module:

→ Pick a table: parents on top, N:N in the middle, children below, each box naming its lookup or relationship
→ System links (owner, currency, created by) exist on every table, so they start hidden; one click shows them, and your own lookups to those same tables stay in view
→ Click any related table and it becomes the center: walk the model from table to table
→ Depth 2 pulls in the relationships of the related tables, capped at 30 tables to stay readable
→ ↻ clears the metadata cache, so a relationship created minutes ago shows up

Demo data in the video. Free and open source.

Which table has the most relationships in your org? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #DataModel

---

### Post 44 — Teams (`teams`, 73 s)

👥 Some of a user's rights never show on their profile.

In Dataverse, a security role held by a team is inherited by every member, and it doesn't appear in the user's own role list. That's usually where "why can this user do that?" ends.

▶️ 73 seconds in Colvio's Teams module:

→ Every team badged by type (Owner, Entra group, BU default), with one search across name, business unit and administrator
→ An owner team's security roles: the ones its members inherit
→ Entra group teams: the group's Object ID to copy, and the truth about membership: a new group member appears only after their next access
→ Members with access mode, license type and status, exportable
→ Access teams (one per shared record, sometimes thousands) loaded only when you ask

Demo data in the video. Free and open source.

Owner teams or Entra groups: which does your org rely on? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #EntraID

---

### Post 45 — Translations (`translations`, 64 s)

🌍 Fixing one label in four languages shouldn't take an afternoon.

▶️ 64 seconds in Colvio's Translations module:

→ Every column label of a table, in every language installed on the org, side by side
→ Hide the languages you don't need (the export follows)
→ Search by logical name or by any label, in any language
→ Type straight into the grid: changed cells are highlighted and counted, and Save writes them and publishes the table
→ Unsaved edits? Switching table asks first
→ Or round-trip: export to CSV, translate in Excel, import it back as pending edits

Demo data in the video. Free and open source.

How many languages does your org run? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #Localization

---

### Post 46 — Login History (`logins`, 52 s)

🕐 Dataverse has no "logout" event.

It records user access at most once per user per interval (4 hours by default), through two channels: the app (audit action 64) and web services, meaning the API (action 65). Any "session duration" built from the audit is a guess.

▶️ 52 seconds in Colvio's Login History, showing what the audit really holds:

→ Find a user as you type
→ Access events, active days, latest and oldest, split between the app and web services
→ A day-by-day timeline with each event's exact time and channel
→ Load from the last 50 up to 500 events
→ Export to CSV or Excel

Demo data in the video. Free and open source.

Did you know Dataverse has no sign-out event? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #Audit
