# LinkedIn plan — Colvio's features in video

**Goal:** show Colvio's features in video — nothing else. Posts 1–25 (`linkedin-posts.md`) already introduced Colvio and announced each release; none showed the features in motion. So here: no release news, no "what's new", no behind-the-scenes. One post = one video + what it shows.

**Language:** English only — posts, comments and videos (the `_en.mp4` files).

**31 posts, 31 videos:** the tour (2 min 54, 20 modules), then one deep-dive video per module (52 s to 1 min 54) — every module except System Ops (Posts 26–46). Then **Posts 48–57**: ten videos on what came after the first series was filmed (1.11.177 → 1.11.219) — three new modules (Health check, Script Console, Web Resources) and the big new capabilities inside the others. Captions burned in, demo data only.

**Start:** J = the first Tuesday after the Chrome Web Store shows **v1.11.176** (or later). The videos show Teams, Storage, Bulk settings, the current Login History and the enriched demos, which older store versions don't have.

**Posts 40–57 need the store at v1.11.220 (or later)** — their videos were rendered from 1.11.220 (Colvio's own confirmation dialog, the latest demo data). Posts 48–57 show Fires on, Deployments, search result columns and multi-select values (1.11.213–1.11.219), N:N loading (1.11.209), SQL completion (1.11.207) and Script Console (1.11.202). If the store is behind on the date, push the batch back, never post a video of a feature users can't install.

## Posting rules

- **Colvio** page, "we / Colvio" voice (never "I").
- Upload the **MP4 natively** to LinkedIn (no YouTube link: native video reaches far more people). Captions are burned in, so the video works muted.
- **Link in the first comment**, never in the post: `🔗 Chrome Web Store: https://chromewebstore.google.com/detail/edieednbdaclheikneelkjfbckibhdgl · Source: https://github.com/zmissoum/colvio`
- Reply to **every comment within the first hour**.
- Every claim in the texts is visible in the video or in its chapter captions (`tools/video/deep/<module>.mjs`).

## Calendar

One post a week on **Tuesday 8:30** until Dec 15, then **two a week from Jan 5 — Tuesday 8:30 and Thursday 17:30** — to the last on **Tuesday, March 2**. Tick "Posted" as each one goes out.

**The videos, on your PC:** `C:\Users\zakar\Documents\Claude\Projects\Colvio\tools\video\out\linkedin` — one file per post, named `post-<number>_<module>.mp4` (the "Video file" column). Upload that file, natively. Any other copy (`tools\video\out\deep\`, `tools\video\out\upload\`, the `colvio-linkedin-videos` folder) is not for LinkedIn: the first is the October series, the second is YouTube's, the third the earlier cloud renders.

**Where each batch stands (November 16, 2026)**
- **Posts 26–34** (Oct 13 → Nov 10): out. Leave them — a published post keeps its video and its thumbnail, and deleting one loses its reach and comments.
- **Posts 35–39** (Nov 17 → Dec 15): scheduled with the October videos, whose first frame — LinkedIn's thumbnail — is the "Connecting to Dataverse…" screen behind the title card. LinkedIn doesn't let a scheduled post's thumbnail be changed, and replacing its video has been reported to create a duplicate instead. So: **delete each of the five scheduled posts, then schedule it again on the same date and time with the same text** and the file in the table — the same video, its first second cut so it opens on the clean title card. Its content matches the version on the store today. **Post 35 goes out on Nov 17 at 8:30: start with it.**
- **Posts 40–53** (Jan 5 → Feb 16, batch 2): schedule now — on Nov 16 LinkedIn's ~3-month window reaches Feb 16.
- **Posts 54–57** (Feb 18 → Mar 2, batch 3): schedule from Dec 2, when the window reaches Mar 2.
- **Store condition:** the videos of Posts 40–57 show Colvio 1.11.220. Publish 1.11.220 on the Chrome Web Store now; it must be live before Jan 5, the first of these posts — if it isn't, move the remaining posts back until it is.

| Post | Date | Topic | Video file (in the folder above) | Length | Batch | What to do | Posted |
|---|---|---|---|---|---|---|---|
| 26 | Tue Oct 13 | Colvio in a few minutes (tour) | — (already out: `out/video/colvio_tour_en.mp4`) | 2 min 54 | 1 | Published — leave it | ☐ |
| 27 | Thu Oct 15 | Data Explorer | — (already out: `out/deep/colvio_explorer_en.mp4`) | 94 s | 1 | Published — leave it | ☐ |
| 28 | Tue Oct 20 | Data Loader | — (already out: `out/deep/colvio_loader_en.mp4`) | 95 s | 1 | Published — leave it | ☐ |
| 29 | Thu Oct 22 | Security Audit | — (already out: `out/deep/colvio_security_en.mp4`) | 90 s | 1 | Published — leave it | ☐ |
| 30 | Tue Oct 27 | Adoption | — (already out: `out/deep/colvio_adoption_en.mp4`) | 87 s | 1 | Published — leave it | ☐ |
| 31 | Thu Oct 29 | Storage | — (already out: `out/deep/colvio_storage_en.mp4`) | 62 s | 1 | Published — leave it | ☐ |
| 32 | Tue Nov 3 | Users & Licenses + Bulk settings | — (already out: `out/deep/colvio_licenses_en.mp4`) | 1 min 53 | 1 | Published — leave it | ☐ |
| 33 | Thu Nov 5 | Show All Data | — (already out: `out/deep/colvio_showalldata_en.mp4`) | 67 s | 1 | Published — leave it | ☐ |
| 34 | Tue Nov 10 | Apps | — (already out: `out/deep/colvio_apps_en.mp4`) | 68 s | 1 | Published — leave it | ☐ |
| 35 | Tue Nov 17 | API Tester | `post-35_apitester.mp4` | 1 min 53 | 1 | Scheduled → delete & reschedule | ☐ |
| 36 | Tue Nov 24 | Recycle Bin | `post-36_recyclebin.mp4` | 78 s | 1 | Scheduled → delete & reschedule | ☐ |
| 37 | Tue Dec 1 | Business Units | `post-37_bu.mp4` | 80 s | 1 | Scheduled → delete & reschedule | ☐ |
| 38 | Tue Dec 8 | Solutions | `post-38_solutions.mp4` | 69 s | 1 | Scheduled → delete & reschedule | ☐ |
| 39 | Tue Dec 15 | Environment Variables | `post-39_envvars.mp4` | 74 s | 1 | Scheduled → delete & reschedule | ☐ |
| 40 | Tue Jan 5 | Automation | `post-40_automation.mp4` | 71 s | 2 | Schedule now | ☐ |
| 41 | Thu Jan 7 | Metadata | `post-41_metadata.mp4` | 83 s | 2 | Schedule now | ☐ |
| 42 | Tue Jan 12 | Schema | `post-42_schema.mp4` | 76 s | 2 | Schedule now | ☐ |
| 43 | Thu Jan 14 | Relationships | `post-43_relationships.mp4` | 58 s | 2 | Schedule now | ☐ |
| 44 | Tue Jan 19 | Teams | `post-44_teams.mp4` | 72 s | 2 | Schedule now | ☐ |
| 45 | Thu Jan 21 | Translations | `post-45_translations.mp4` | 63 s | 2 | Schedule now | ☐ |
| 46 | Tue Jan 26 | Login History | `post-46_logins.mp4` | 52 s | 2 | Schedule now | ☐ |
| 48 | Thu Jan 28 | Record access & Record activity | `post-48_access.mp4` | 99 s | 2 | Schedule now | ☐ |
| 49 | Tue Feb 2 | Health check | `post-49_health.mp4` | 94 s | 2 | Schedule now | ☐ |
| 50 | Thu Feb 4 | Data Explorer: SQL, safe writes, saved views | `post-50_sqlpower.mp4` | 2 min 18 | 2 | Schedule now | ☐ |
| 51 | Tue Feb 9 | Automation: who runs it, what fires | `post-51_whoruns.mp4` | 1 min 48 | 2 | Schedule now | ☐ |
| 52 | Thu Feb 11 | Script Console | `post-52_script.mp4` | 99 s | 2 | Schedule now | ☐ |
| 53 | Tue Feb 16 | Metadata: know your data model | `post-53_datamodel.mp4` | 94 s | 2 | Schedule now | ☐ |
| 54 | Thu Feb 18 | Solutions › Deployments | `post-54_deployments.mp4` | 99 s | 3 | Schedule from Dec 2 | ☐ |
| 55 | Tue Feb 23 | Web Resources | `post-55_webres.mp4` | 1 min 47 | 3 | Schedule from Dec 2 | ☐ |
| 56 | Thu Feb 25 | Change the model without XrmToolBox | `post-56_modelwrites.mp4` | 99 s | 3 | Schedule from Dec 2 | ☐ |
| 57 | Tue Mar 2 | Data Loader: N:N tables by association | `post-57_association.mp4` | 97 s | 3 | Schedule from Dec 2 | ☐ |

Each post's text and first comment are below (the first comment is the same for all: see Posting rules). After a UI change, re-render with `node make-deep.mjs --module=<module> --lang=en --res=1440` then `node youtube-deep.mjs` in `tools/video`, and copy `out/upload/colvio_<module>_en.mp4` to the folder above under the post's name. Post 47 (`linkedin-posts.md`) is the text-only release post of 1.11.182 → 1.11.202.

## The 31 posts

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

### Post 35 — API Tester (`apitester`, 1 min 53)

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

### Post 36 — Recycle Bin (`recyclebin`, 78 s)

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

### Post 37 — Business Units (`bu`, 80 s)

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

### Post 38 — Solutions (`solutions`, 69 s)

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

### Post 39 — Environment Variables (`envvars`, 74 s)

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

### Post 40 — Automation (`automation`, 71 s)

⚡ "Why did this field change?"

Before opening the Plugin Registration Tool, look at everything registered to run, on one screen.

▶️ 71 seconds in Colvio's Automation module:

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

▶️ 77 seconds in Colvio's Schema module:

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

### Post 43 — Relationships (`relationships`, 58 s)

🔗 Your data model, one click at a time.

▶️ 58 seconds in Colvio's Relationships module:

→ Pick a table: parents on top, N:N in the middle, children below, each box naming its lookup or relationship
→ System links (owner, currency, created by) exist on every table, so they start hidden; one click shows them, and your own lookups to those same tables stay in view
→ Click any related table and it becomes the center: walk the model from table to table
→ Depth 2 pulls in the relationships of the related tables, capped at 30 tables to stay readable
→ ↻ clears the metadata cache, so a relationship created minutes ago shows up

Demo data in the video. Free and open source.

Which table has the most relationships in your org? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #DataModel

---

### Post 44 — Teams (`teams`, 72 s)

👥 Some of a user's rights never show on their profile.

In Dataverse, a security role held by a team is inherited by every member, and it doesn't appear in the user's own role list. That's usually where "why can this user do that?" ends.

▶️ 72 seconds in Colvio's Teams module:

→ Every team badged by type (Owner, Entra group, BU default), with one search across name, business unit and administrator
→ An owner team's security roles: the ones its members inherit
→ Entra group teams: the group's Object ID to copy, and the truth about membership: a new group member appears only after their next access
→ Members with access mode, license type and status, exportable
→ Access teams (one per shared record, sometimes thousands) loaded only when you ask

Demo data in the video. Free and open source.

Owner teams or Entra groups: which does your org rely on? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #EntraID

---

### Post 45 — Translations (`translations`, 63 s)

🌍 Fixing one label in four languages shouldn't take an afternoon.

▶️ 63 seconds in Colvio's Translations module:

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

---

### Post 48 — Record access & Record activity (`access`, 99 s)

⏱ 99 seconds inside Colvio's Show All Data: Record access and Record activity.

"Why can't she see this record?" and "What did that save just trigger?" Two questions people bring to admins every week, answered from the record itself.

1. Pick a user by name or email, right from the record
2. Dataverse's own yes / no for each right (read, write, append, append to, delete, assign, share), with the role or team role that grants it, at which depth, and where the record sits
3. For every no, what would fix it: the depth this record needs, a share (they have the privilege, so it would work), or assigning the record to them
4. Their roles, their teams with the teams' roles, and who the record is already shared with
5. Same record, another user: the owner gets every right, and the whole check exports to CSV or Excel
6. Record activity: every save of the record made in this browser, the columns it sent, and the plug-ins it ran, in order, cascades on other tables included
7. A save that failed: the plug-in's exception in red, and its full trace one click away
8. An async job failing every time: its last 6 runs, the step behind it, and what a 401 usually means
9. The cloud flows it triggered, the ones that may trigger, and the ones that won't, with the reason

All on demo data. Read-only, no real org on screen.

Which do you get asked more: "why can't they see it" or "what changed this record"? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #SecurityRoles

---

### Post 49 — Health check (`health`, 94 s)

⏱ 94 seconds inside Colvio's Health check.

Some problems never throw an error. They sit in your environment until something breaks. One click, one report, worst first:

1. 12 checks in one run: jobs, flows, plug-ins, connections, variables, users, solutions, log tables. Read-only.
2. Every check rated (warning, note, OK) and sorted worst first, each finding with what to do
3. System jobs failed in the last 7 days, grouped by job name, and the suspended ones still waiting for a retry
4. Active cloud flows owned by disabled users, and synchronous Update plug-in steps with no filtering attributes
5. Connection references without a connection, environment variables with neither a value nor a default
6. Log tables against a threshold: 1,240,300 system jobs flagged, with the bulk-delete fix
7. On production, unmanaged solutions are flagged: changes made in them drift from your source, and no upgrade removes them
8. Stricter on production: the trace log on "All" becomes a warning; audit kept forever and enabled users without a role stay notes
9. Copy the whole report as plain text for a ticket, or export it to CSV / Excel

All on demo data, the demo org shown as production. No real org on screen.

Which of these would you bet your production org has right now? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #Governance

---

### Post 50 — Data Explorer: SQL, safe writes, saved views (`sqlpower`, 2 min 18)

⏱ 2 min 18 inside Colvio's Data Explorer, past the basics: SQL, safe writes and saved views.

The first Explorer video built a query. This one shows what you can do around it, in eleven steps:

1. Paste a full Web API URL, even one from another environment: its table opens in OData mode, and Colvio says the query runs here
2. ⬇ To file: every row streamed to CSV or Excel, page after page, nothing kept in the browser
3. SQL that completes as you type: after FROM, the tables matching what you typed; Tab inserts
4. In the SELECT list, the FROM table's columns, with display name and type
5. Execute: the grid holds exactly the SELECT's columns, in its order, and an alias names its column
6. UPDATE in SQL: Execute becomes "Preview UPDATE", and a label where an option set needs its number is refused, with the reason
7. The preview: the WHERE runs as a SELECT and lists every row the statement would touch. Nothing written yet
8. Apply asks first, repeating the statement and what each record gets
9. 👁 Save as view: the Builder query (columns, filter, sort) becomes a personal view under My views
10. With related tables: a filter on related records and a lookup's columns become joins of the view, listed in the confirmation with the FetchXML it saves
11. ⭐ Save a query, then 💾 Update overwrites it in one click

All on demo data. The update was never applied: the confirmation was cancelled.

Would you run an UPDATE on Dataverse more often if you saw every row it touches first? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #SQL

---

### Post 51 — Automation: who runs it, what fires (`whoruns`, 1 min 48)

⏱ 1 min 48 inside Colvio's Automation module: who runs it, and what fires when a column changes.

A cloud flow doesn't run as its owner. A person behind your automation leaves, and things stop. Here is how to see it before that happens.

1. Every identity behind a cloud flow, workflow or plug-in step, by kind: person, team, app registration, service account, built-in, and what each one runs
2. Flags first: a disabled user still behind active automation, and people whose flows and workflows break when they leave
3. Every connection reference: its connector, the account it's signed in with, or "no connection: flows using it can't run"
4. Cloud flows: who each one runs as (the account of each connection, or whoever runs it) and who it sends email as
5. Classic workflows too: Runs as (owner or the user who made the change) and the From of each Send Email step
6. 🎯 Fires on: pick a table and a column, and see every step, workflow and flow that runs when it changes
7. Switch steps off: filter on an assembly, tick every step shown, Disable
8. Set a step's filtering attributes: tick the columns it should react to, and save
9. Ask again: the column now fires the flow and the plug-in step, with its stage and who it runs as

All on demo data. No real org on screen.

When someone leaves your team, how do you find what was running under their name? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #PowerAutomate

---

### Post 52 — Script Console (`script`, 99 s)

⏱ 99 seconds inside Colvio's Script Console.

For what no screen does: JavaScript on the Dataverse Web API, with a dry run before anything is written and a rollback after.

1. Start from a template: here, fill each user's sales code from the sales organization they belong to
2. The code runs in an isolated sandbox with no network: it reaches your org only through dv (reads, writes, $batch, actions)
3. Dry run: reads run for real, every write is listed in the Plan and NOT sent (8 lookups here)
4. The script's own report, row by row: would update, already right, or skipped rather than guessed
5. Run for real, confirmed against the dry run's plan, with the rollback journal on: 8 writes, 8 reversible
6. Rollback in one click: inverse operations, last write first, with undone / failed / skipped counts
7. Dry run again: the same 8 writes are planned, so the rows really are back as they were
8. Rows from an input file: update accounts by account number, and a number that matches nothing is reported
9. Saved scripts, a .js download, and the run's journal exported as JSON

All on demo data. No real org on screen.

What's the one data fix you'd script tomorrow if you knew you could undo it? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #JavaScript

---

### Post 53 — Metadata: know your data model (`datamodel`, 94 s)

⏱ 94 seconds inside Colvio's Metadata module: know your data model before you touch it.

"Can we delete this column?" is really three questions: is it used, what depends on it, and who else changed it.

1. Fill rate: for every column, how many rows actually hold a value, the whole table counted in a couple of requests; never-filled columns show in red
2. A data dictionary for many tables at once: every column with its type, required level and description, to CSV or Excel
3. 🧨 What blocks deleting a column: Dataverse's own dependency check, every form, view, business rule, cloud flow, plug-in step and key named, each with how to remove it
4. Everything that uses a table: lookups, forms and views of other tables, apps, flows, charts, with its own parts set apart
5. 📑 Solution layers: an unmanaged "Active" layer sitting on a managed solution is flagged, and the values it overrides are struck through
6. 🔎 What the global search shows and searches, table by table, from each Quick Find view, with rows indexed and last sync
7. Where search falls short: a table with no Quick Find view, one with no Find column, an index sync still running
8. Multi-select choice columns: their values, like any other choice

All on demo data. Dependencies, layers and search columns are read-only.

What's the column in your org that nobody dares to delete? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #DataModel

---

### Post 54 — Solutions › Deployments (`deployments`, 99 s)

⏱ 99 seconds inside Colvio's Solutions › 🚀 Deployments.

"Which version is in this environment, who imported it, and did the last import fail?" One window answers all three:

1. Every solution import, export and uninstall the environment recorded, with the failures and the oldest entry
2. A timeline, newest first: when, how long, which version (managed, patch), new / upgrade / update, the result and who started it
3. Flagged: a failed upgrade with its error, an import that overwrote unmanaged customizations, one that never completed
4. Open a run: error code and message, the activity id for Microsoft support, the import job, then its import log parsed
5. Filter by text, solution, operation, result and period
6. Older than 180 days: Dataverse purges its solution history, but the import jobs still show who imported
7. By solution: each solution's version ladder, its current version, failures and uninstalls
8. From any solution: its deployment history, already filtered, exportable to CSV or Excel

All on demo data. No real org on screen.

How long did it take you to find out why your last solution import failed? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #ALM

---

### Post 55 — Web Resources (`webres`, 1 min 47)

⏱ 1 min 47 inside Colvio's Web Resources.

Before you rename or delete a column: which scripts still use it? Dataverse's dependency tracking doesn't look inside JavaScript.

1. Every web resource by kind; Microsoft's own libraries stay hidden until you ask, and M marks a managed solution
2. Open one in the editor: content decoded, with its kind, display name and size
3. Search a column name inside every script and page: new_sapid turns up 4 lines in 3 resources
4. Click a hit: the resource opens with that line selected
5. Edit in place: a dot marks unsaved changes, Revert brings back the version you opened
6. Save & publish: asked first, with the new size and what a publish means for every user
7. Someone saved it meanwhile: every save is conditional on the version you opened, so Dataverse refuses yours and Colvio says who and when. Nothing is overwritten
8. ↻ Reload opens their version to redo your change on top of it; ⚠ Overwrite would replace it with yours
9. A resource from a managed solution says so: your change is an unmanaged layer the next import may overwrite
10. Download any resource as its file, or open the published version in Dynamics 365

All on demo data. No real org on screen.

Which column would you search for first in your org's scripts? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #PowerApps

---

### Post 56 — Change the model without XrmToolBox (`modelwrites`, 99 s)

⏱ 99 seconds inside Colvio: changing the data model without opening XrmToolBox.

A new choice value or ten new columns shouldn't mean another tool and twenty clicks per column. Every write below asks for confirmation first.

1. Edit a choice column's values, and see what you touch: a global choice changes for every column that uses it
2. Add an option: the value is optional (Dataverse picks one with your publisher's prefix), published right away
3. Rename one (rows keep their value, labels in other languages are kept), reorder them with ↑ ↓
4. Delete one: the rows holding it are counted first, and the confirmation says it can't be undone
5. Columns from a CSV or Excel file, every row checked before anything is sent: a choice without options, a lookup to a table the org doesn't have, a length out of bounds, a duplicate
6. Create them in one go, in the unmanaged solution you pick, one request per column, the table published once, rows with errors skipped
7. A plug-in step's filtering attributes: tick the columns, Save shows the diff before the step is updated

All on demo data. No real org on screen.

Which model change do you still open XrmToolBox for? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #PowerApps

---

### Post 57 — Data Loader: N:N tables by association (`association`, 97 s)

⏱ 97 seconds inside Colvio's Data Loader, on the tables most loaders skip: many-to-many.

Putting users in their teams isn't creating rows. Each line of the file links two records, and Colvio's Data Loader now does exactly that, in ten steps:

1. Paste two columns from Excel: a user's email and a team's name per row
2. Team Membership is in the target list, badged N:N
3. Its rows aren't created: each file row associates one user with one team, and a link that already exists counts as "already", never as an error
4. One file column per end (user → systemuser, team → team)
5. Matched by email and by name: users by their primary email, teams by their name; a value that matches two records is reported, never picked at random
6. A dry run that writes nothing: 5 pairs would be associated; the row without a team and the repeated pair are skipped, each with its reason
7. Associate: 3 associated, 2 already linked, and a log line for every row
8. Rollback removes only the 3 links this run added, after a confirmation, and the log exports to CSV
9. Back on a normal table: an Excel export of accounts read against Contact, and Colvio spots that the file is an Account export
10. One click to Account and every column is matched again: display names like "Main Phone", "(Do Not Modify) Account" as the record id, checksum and modified-on skipped

All on demo data. No real org on screen.

How do you add a hundred users to their teams today? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #DataMigration

---
