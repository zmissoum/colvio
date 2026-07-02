# Colvio — LinkedIn Posts

## Post 1 — Origin of the name "Colvio"

People keep asking: what does Colvio mean?

In French, it sounds like "cle de voie" — the key to the path.

That's exactly what it is. You arrive on a new D365 org, thousands of entities, millions of records, and you need a key. One tool to unlock everything.

That's Colvio.

A free, open-source Chrome extension for Dynamics 365. 11 modules. Zero configuration. Just click and explore.

What would YOUR key feature be on a new org? Drop it in the comments.

Link in comments.

#Dynamics365 #Dataverse #Colvio #OpenSource #ChromeExtension #D365 #Free

---

## Post 2 — SF to D365 migration

Switching from Salesforce to Dynamics 365?

Here's what nobody warns you about: the tooling gap.

On Salesforce, you had browser extensions to instantly query data, inspect records, export fields. You didn't even think about it — it was just there.

On D365, you arrive and... nothing. You open XrmToolBox, download 15 plugins, configure connections, deal with desktop dependencies. Just to see what's inside an entity.

That gap was the first thing that hit us during a migration project. So we decided to close it.

Colvio is a free Chrome extension that brings back what you lost:

🔎 Query your data — directly from the browser, no setup
📋 Inspect any record — one click, all fields visible
📥 Import CSV — drag, map, load, done
📊 Browse metadata — entities, fields, OptionSets
🛡 Audit security — roles, privileges, who has access to what

Same speed. Same simplicity. Same philosophy: open the browser and start working.

What tool do you miss the most when switching CRMs?

Link in comments.

#Dynamics365 #Salesforce #Migration #D365 #CRM #DataMigration #PowerPlatform #Free #OpenSource

---

## Post 3 — Launch announcement (to post when Chrome approves)

Colvio is now live on the Chrome Web Store! 🎉

Dynamics 365 has always lacked a simple, free, in-browser tool to explore and manage Dataverse data. Colvio was born from that gap.

100% free, open-source. 11 modules. Zero configuration:

🔎 Data Explorer — SQL, OData & FetchXML
📊 Metadata Browser & OptionSet export
📥 Data Loader — CSV/Excel import with $batch
🔗 Relationship Graph — interactive SVG
🛡 Security Audit — roles & sensitive privileges
👥 Users & Licenses monitoring
📦 Solution Explorer
🌐 Translation Manager
📋 Login History

No data collection. No external servers. No account. No paid license. Everything stays in your browser.

Which feature would you try first? Let us know!

Install link in comments.

#Dynamics365 #Dataverse #CRM #PowerPlatform #OpenSource #ChromeExtension #D365 #Free

---

## Post 4 — "5 things I check first on any new D365 org"

Every consultant has a ritual when they land on a new D365 org. Here's ours:

1️⃣ How many active users are there — and how many actually log in?
2️⃣ Which security roles have Organization-level delete permissions?
3️⃣ What custom entities exist and how are they related?
4️⃣ Are the field labels translated correctly across all languages?
5️⃣ Which solutions are installed and what did they customize?

All 5 answers in under 2 minutes. One tool. Zero setup.

That's what Colvio was built for.

What's YOUR first check on a new D365 org? We're curious.

Link in comments.

#Dynamics365 #D365 #Consulting #CRM #Dataverse #Tips

---

## Post 5 — Security angle

How many security roles in your D365 org have Organization-level delete permissions?

If you can't answer that in 30 seconds, you have a problem.

Most D365 orgs accumulate security roles over time. Custom roles copied from System Administrator "just to get it working." Roles from imported solutions nobody remembers. Deprecated roles that are still assigned.

Colvio's Security Audit scans every role, flags 30+ sensitive privileges, and highlights anything with Organization-level depth.

🔴 Delete on core entities — who can wipe your accounts?
🔴 Assign Role — who can grant themselves more access?
🔴 Export to Excel — who can bulk export your data?
🔴 Delete Audit — who can erase the audit trail?

One click. Full visibility. Free.

How often do you audit your D365 security roles? Be honest.

Link in comments.

#Dynamics365 #CyberSecurity #D365 #Security #CRM #DataProtection

---

## Post 6 — The "nobody reads the data" problem

Hot take: most D365 implementations fail not because of bad configuration, but because nobody looks at the data.

Thousands of accounts with no email. Contacts with "test" in the name — in production. Leads created 3 years ago, never touched, cluttering every view.

The first step to fixing a CRM is seeing what's actually inside it.

That's why we built Colvio — a free tool that lets you query, filter, and export any entity in seconds. No setup, no learning curve.

Sometimes the hardest part isn't fixing the data. It's finally looking at it.

What's the worst data mess you've found in a CRM? We've all been there.

Link in comments.

#Dynamics365 #DataQuality #CRM #D365 #Dataverse #Consulting

---

## Post 7 — Technical / dev audience

We built a SQL-to-FetchXML parser. From scratch. In JavaScript.

Why? Because querying Dataverse shouldn't require learning a new language.

Write this:
SELECT fullname, email FROM systemuser WHERE isdisabled = false ORDER BY fullname

Colvio translates it to FetchXML behind the scenes — which means reliable pagination, no 5000-record limits, and proper JOINs via link-entity.

The parser is a recursive descent tokenizer that handles SELECT, FROM, JOIN, WHERE (AND/OR/IN/LIKE/IS NULL), ORDER BY, GROUP BY, TOP, DISTINCT, and aggregates (COUNT, SUM, AVG, MIN, MAX).

~530 lines of code. Zero dependencies. Open source.

Would you use SQL over FetchXML if you could? Curious to hear from fellow D365 devs.

Link in comments.

#JavaScript #SQL #Dynamics365 #OpenSource #Parsing #Dev #React

---

## Post 8 — Quick tip format

D365 tip: you don't need $expand to get a lookup's display name.

Just select the lookup field (_parentcustomerid_value) and Dataverse automatically returns the formatted value with the record name.

No extra API call. No expand. No performance hit.

This is one of the things we built into Colvio — every lookup automatically shows the display name right in the results table. Clickable, too.

Small things that save hours.

What's your favorite D365 API trick? Share it below.

Link in comments.

#Dynamics365 #D365 #Dataverse #OData #Tips #Dev

---

## Post 9 — Community feedback request

We built Colvio for D365 consultants, admins and developers. But we didn't build it alone — we built it by listening.

Now we want to hear from you.

Colvio currently has 11 modules:

🔎 Data Explorer (SQL, OData, FetchXML)
📋 Show All Data
📊 Metadata Browser
📥 Data Loader
🔗 Relationship Graph
📦 Solution Explorer
🌐 Translation Manager
👥 Users & Licenses
🛡 Security Audit
📋 Login History
❓ Help & Onboarding

What's missing? What would make your daily work on D365 easier?

Here are some ideas we're considering:

💡 Environment comparison (diff between DEV and PROD)
💡 Workflow/Power Automate viewer
💡 Data quality dashboard (duplicates, empty fields, orphan records)
💡 Entity dependency map (which entities are used by which solutions)
💡 Scheduled data exports

Vote with emojis or drop your idea in the comments. The most requested feature gets built next.

Colvio is free and open-source. Your feedback shapes the roadmap.

Link in comments.

#Dynamics365 #Dataverse #D365 #CRM #OpenSource #Feedback #PowerPlatform

---

## Post 10 — v1.9.1 Update announcement

Colvio v1.9.1 is out.

One of the most requested features in Colvio is the Translation Manager — edit field labels across multiple languages, directly from the browser.

But saving labels in Dataverse is harder than it sounds.

The Web API doesn't support PATCH on metadata attributes. It doesn't support PUT on individual properties either. And SetLocLabels? Only works for data entities, not metadata.

The solution? A 3-step pattern:

1. GET the full attribute metadata with its typed cast
2. Modify the DisplayName labels in the response
3. PUT the entire object back with MSCRM.MergeLabels: true

It took 5 attempts to get it right. Now it works on every attribute type — String, Picklist, Boolean, Money, DateTime, you name it.

If you've ever tried to bulk-translate D365 field labels without exporting/importing a full translation file — this is for you.

Update available now on the Chrome Web Store.

Have you ever struggled with D365 translations? What was your approach?

#Dynamics365 #Dataverse #D365 #Translations #i18n #CRM #OpenSource #ChromeExtension

---

## Post 11 — v1.11 roundup: from data explorer to 14-module toolkit

> Publish once v1.11.11 is approved on the Chrome Web Store (the store is still on the 1.10.x line). The "coming to Edge" line works as a teaser. Link to the Chrome Web Store goes in the FIRST COMMENT, not the body.

🚀 Colvio went from a data explorer to a 14-module toolkit for Dynamics 365 — here's everything that shipped.

A few weeks ago, Colvio was a free, in-browser data explorer for Dynamics 365 / Dataverse.

Since then it kept growing. A lot. Same philosophy: free forever, zero data collection, open source. No API keys, no app registration, no account — open a D365 page, click the icon, work.

Here's what's new. 👇

🧪 API Tester — a Postman for Dataverse, built in.
Run GET / POST / PATCH / PUT / DELETE against your org, authenticated by your active session. No OAuth dance. No client secret. Header autocomplete, JSON validation that points at the exact error line, templates (WhoAmI, CREATE, UPSERT by alt-key…), request history with secrets redacted, and "Copy as cURL." Two-step confirmation on DELETE, because there's no recycle bin in Dataverse… or is there?

♻️ Recycle Bin — restore deleted records.
A true server-side restore via the platform's "keep deleted records" feature. Pick a table, see what's in the bin, restore. Every Microsoft limitation surfaced in plain words (retention window, cascade ordering, key conflicts, unsupported tables) — so you know exactly what's recoverable before you click.

📜 Change History — who changed what, when.
On any record: the full audit timeline with a click-to-expand field-level diff (old value → new value, formatted for lookups and option sets).

⚡ System Ops — find the stuck stuff.
System Jobs monitor: filter to failed / waiting / in-progress jobs, bulk cancel or resume. Plug-in Trace viewer: exceptions highlighted, full trace text, duration warnings, CSV export. The two things admins usually open XrmToolBox for.

⇄ Schema snapshot & diff — deployment prep in two clicks.
Export an environment's schema as JSON, diff it against another org. Missing tables, missing columns, type mismatches — ranked, with CSV export. DEV → UAT → PROD, de-risked.

📥 And the Data Loader became the safest bulk loader I know:
• 🔍 Dry run — simulate the entire import with zero writes
• ↩️ Rollback — undo exactly the records a run created
• Δ Delta mode — send only the fields that actually changed
• UPDATE-only that genuinely never creates (native If-Match)
• ~3-4k records/sec, live per-row log, cancel that actually stops everything

Plus the quality-of-life layer: a ⌘K / Ctrl+K command palette, a "what's new" popup, saved-query sharing, dark/light, EN/FR.

14 modules. Still 100% local — every request goes to your own org with your own session, your security roles always apply. Still open source (MIT). And coming to Microsoft Edge next.

The free in-browser toolkit Dynamics 365 has been missing — now does a lot more.

Which one would you actually use first? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #CRM #OpenSource #PowerApps #MSDyn365

---

## Post 12 — Security visibility, one click away (+ the polish wave)

> Publish once the latest build (1.11.24) is approved on the Chrome Web Store. Link to the store in the FIRST COMMENT, not the body. HONEST framing — positions on convenience (zero-setup, in-browser, all-in-one), NOT on "nobody else does this". Seeing role members is already common (Power Platform admin center Membership page, XrmToolBox plugins, Level Up, FetchXML, PowerShell), and the native admin center already handles business units via the "parent security roles only" toggle. Do NOT claim Colvio uniquely solves the BU case — that was a Colvio bug fixed to reach parity. Pairs well with Post 5.

Most D365 admins already have ways to see who holds a security role — the Power Platform admin center, an XrmToolBox plugin, a FetchXML query, PowerShell. They all work.

What they share: a detour. Install a desktop tool and set up a connection. Or leave your record, open the admin center, pick the environment, drill into Settings → Users + permissions.

Colvio's bet is simpler: that answer should be one click away, on the org you're already looking at.

Open any security role in Colvio — free, in-browser, zero setup — and you get:

🛡 Its privileges — readable labels, depth, sensitive-privilege flags
👥 Its members — name, email, business unit, status
🌐 Rolled up across every business-unit copy of the role, deduplicated

(Worth knowing: a role is copied per business unit, so members can sit in child BUs. In the admin center you'd switch off "parent security roles only" to see them — Colvio just aggregates them for you.)

And a wave of polish shipped alongside it 👇

♻️ Recycle Bin — who deleted / created / modified each record + pagination through mass deletes
⚡ System Ops — pagination + date & text search on system jobs and plug-in traces
🔎 SQL Explorer — TOP n limits correctly now
📦 Solution Explorer — real component names instead of "Type 150"
🌐 Translation Manager — every Dataverse language resolves now

Free. Open source (MIT). 100% local — your session, your roles, nothing ever leaves the browser.

What's your go-to today for "who can do this?" in D365 — admin center, XrmToolBox, or something else? 👇

#Dynamics365 #Dataverse #Security #D365 #PowerPlatform #CRM #OpenSource

---

## Post 13 — Query tabs: run several Dataverse queries side by side

> Publish once 1.11.27 is approved on the Chrome Web Store. Link in the FIRST COMMENT. HONEST framing — this UX is openly borrowed from Salesforce Inspector (credit it, don't claim invention). Ties to Post 2 (the SF → D365 tooling gap), strong for the ex-Salesforce audience.

If you came to Dynamics 365 from Salesforce, you probably miss one specific thing from Salesforce Inspector: query tabs.

Open several queries at once. Tweak one, run it. Switch to another, run that. Compare. No re-typing, no losing your place.

That workflow just landed in Colvio's Data Explorer — free, in your browser.

🗂 Multiple query tabs — open as many as you want (+ New)
🔀 Each tab fully independent — its own table, filters, and results
✍️ Rename tabs inline (double-click), close with ✕
🧰 Works in all four query modes — Builder, OData, FetchXML, SQL — mix and match across tabs (Tab 1 in SQL, Tab 2 in the visual Builder…)
▶️ Run them one at a time and flip between tabs to compare

Same Colvio principles: no setup, no account, no install. Your D365 session, your security roles, everything stays local.

A small thing that changes how you work — exploring data stops being one-query-at-a-time.

(And the Explorer now returns all rows by default — drop the limit when you just want a quick preview.)

What's the one Salesforce Inspector habit you wish you had on Dynamics 365? 👇

#Dynamics365 #Dataverse #Salesforce #D365 #PowerPlatform #CRM #OpenSource #SalesforceInspector

---

## Post 14 — The bulk-load safety net (Data Loader)

> Publish once approved on the Chrome Web Store. Link in the FIRST COMMENT. HONEST framing — bulk-load tools already exist (native import wizard, XrmToolBox, KingswaySoft, Power Automate). Position on the in-browser + zero-setup + dry-run/rollback/update-only safety-net combo, NOT "nobody else loads data". Strong for the migration / consultant audience; ties to Post 2 (SF migration) and Post 6 (data quality).

Bulk-loading data into Dynamics 365 is one of the most nerve-wracking things a consultant does.

One wrong column mapping. One bad lookup. One UPDATE that quietly creates duplicates instead of updating. And you're explaining to the client why there are 4,000 phantom contacts in production.

So we built Colvio's Data Loader around one idea: see what will happen before it happens — and be able to undo it.

🔍 Dry run — simulate the ENTIRE import (parsing, transforms, lookup resolution, existence checks) with zero writes. Row by row: would create / would update / would fail / would delete. Catch the broken mapping before it ships.

↩️ Rollback — a real run keeps the exact GUIDs it created. One typed confirmation deletes precisely those records — nothing else.

🔒 UPDATE that never creates — strict update via the native If-Match header: a missing key fails the row, it never silently inserts. No more accidental duplicates from a bad key.

Δ Delta mode — fetches current values and sends only the fields that actually changed; unchanged rows are skipped, so re-running a sync doesn't churn modifiedon or the audit trail.

📋 Live per-row log — every row with its status, the exact Dataverse error, and the exact request sent. No guessing why row 2,317 failed.

CSV / Excel, ~3-4k records/sec via multipart $batch, automatic 429 retry, and a Cancel that actually stops everything. Free, in-browser, no setup.

The boring features — dry run, rollback, a log you can trust — are the ones that save your weekend.

What's the worst data-load mistake you've made (or narrowly avoided)? 👇

#Dynamics365 #Dataverse #DataMigration #D365 #PowerPlatform #CRM #OpenSource #ETL

---

## Post 15 — See who's in every business unit

> Publish once approved on the Chrome Web Store. Link in the FIRST COMMENT. HONEST framing — BU + user info is available natively (Power Platform admin center) and via XrmToolBox / PowerShell / FetchXML. Position on the in-browser tree + members + scoped CSV export, NOT "nobody else does this". Governance angle; pairs with Post 12 (Security Audit) and Post 5.

Quick D365 governance question: can you see, right now, who sits in each of your business units — and pull the full member list of a BU plus everything beneath it?

You can in the admin center, one BU at a time, with some clicking. Or a FetchXML query. Or PowerShell.

Colvio just added a Business Units tab that puts it one click away, in your browser:

🌳 The full BU hierarchy as a tree, each with its user count
👥 Click a BU → its members (name, email, access mode, status)
📥 Export to CSV — just that BU, or that BU plus every sub-BU beneath it (with a Business Unit column per user)

It rounds out a governance trio:

🛡 Security Audit — who holds which role (across all BUs)
👤 Users & Licenses — every user, access mode, last login, unused licenses
🌳 Business Units — the org structure and who's where

Free, in-browser, no setup, no account. Your session, your security roles, everything stays local.

Sometimes the hardest governance question isn't "what can they do" — it's "who is actually where."

How do you map your org's business-unit structure today — admin center, a script, or something else? 👇

#Dynamics365 #Dataverse #D365 #PowerPlatform #CRM #Governance #OpenSource #Security

---

## Post 16 — Excel export + richer user data (the "for the business" wave)

> Publish after the next Chrome Web Store resubmission (bundles v1.11.25→48). Link in the FIRST COMMENT. HONEST framing — CSV/Excel export, these user fields and Entra data are all available elsewhere (native exports, XrmToolBox, FetchXML, Microsoft Graph). Position on convenience / in-browser / business-friendly + the listening-to-users angle, NOT "nobody else does this". All three updates came from real user requests this week.

Three updates to Colvio this week. None of them flashy. All three started with the same kind of message: "could it also…?"

1️⃣ Excel, not just CSV.
Every export in Colvio now has an Excel (.xlsx) button right next to the CSV one. CSV is fine for engineers — but the person who actually opens the file is often in finance, ops or HR. They get real typed cells and clean columns instead of a comma puzzle. Same data, friendlier format.

2️⃣ More of the user record.
The user lists now show job title, manager, business phone and mobile — pulled straight from the Dataverse systemuser record, and included in every export. (Being precise here: pure-Entra fields like "department" live in Microsoft Graph, not on systemuser. Colvio reads your Dataverse session, so it shows what Dataverse actually holds — no more, no less.)

3️⃣ A faster, clearer open.
The panel used to sometimes sit on the connect screen for a few seconds while it probed your permissions. Now it shows a clear "Connecting to <your org>…" and no longer blocks the first screen behind those checks. Open it, and you're in.

That's the whole philosophy, really: free, in-browser, no setup — and shaped by whoever takes a minute to ask for the next small thing.

Colvio is now ~13,000 lines of open-source code, 15 modules, still zero configuration and zero cost.

What's the one "could it also…?" you'd send me? 👇

#Dynamics365 #Dataverse #D365 #PowerPlatform #CRM #OpenSource #ChromeExtension #Free

---

## Post 17 — Migration-grade data loading (audit fields + length pre-flight)

> Publish after the next Chrome Web Store resubmission (bundles up to v1.11.51). Link in the FIRST COMMENT. HONEST framing — audit-field override and length validation already exist in SSIS/KingswaySoft, the Configuration Migration tool, dataflows, etc. Position on free / in-browser / zero-setup + the safety net (dry-run, pre-flight), NOT "nobody else does this". Migration mode needs the prvOverrideCreatedOnCreatedBy privilege — say so. Migration angle from v1.11.49 (Migration mode) + v1.11.50 (length pre-flight).

Migrating data into Dynamics 365? Two things that quietly wreck a migration — and what I just shipped for them in Colvio's Data Loader.

1️⃣ You lose the original dates.
Load 50,000 historical records and every one reads "Created on: today, by: you." The real created/modified dates and authors are gone — and every report built on them is now wrong.
→ New opt-in **Migration mode** lets you map createdon, modifiedon, createdby and modifiedby so migrated records keep their original audit values (createdon → overriddencreatedon, the field Dataverse actually allows you to set). It runs on create only, and requires the prvOverrideCreatedOnCreatedBy privilege — no privilege, no override, by design.

2️⃣ Rich text overflows the field.
Migrating HTML into a rich-text column? The markup inflates the length, blows past the field's max, and you get a 400 on row 12,473 — after the run.
→ The Loader now **pre-flights** every mapped column against the field's real MaxLength and warns you before you run: which field, how many rows exceed it, and the longest value found.

Both sit on top of what was already there: a full dry-run that simulates the whole load (create / update / skip / fail, row by row) with zero writes, plus one-click rollback.

None of this is unique — SSIS/KingswaySoft, the Configuration Migration tool and dataflows all do migrations, often with more power. Colvio's bet is different: free, in the browser, zero setup, and a safety net that tells you what will break before it breaks.

What's the worst data-migration surprise you've hit on D365? 👇

#Dynamics365 #Dataverse #D365 #PowerPlatform #CRM #DataMigration #OpenSource #ChromeExtension

---

## Post 18 — New release: submitted to Chrome (in review) + already on GitHub (1.11.52 → 1.11.60)

> Availability-announcement framing: new version JUST submitted to the Chrome Web Store (pending review) and already live on the open-source GitHub repo. Links IN THE BODY this time (user asked) — GitHub (available now) + Chrome (in review). HONEST: "submitted/in review", not "live on Chrome". Content = 1.11.52→60 (Loader resilience + results filter + code audit). Acknowledge alternatives; free/in-browser/zero-setup positioning. Note: body links can dent LinkedIn reach — the user can move them to the first comment if they prefer.

🚀 New Colvio release — just submitted to the Chrome Web Store, and already live on GitHub.

While Chrome reviews it, you can grab it right now from the repo — it's 100% free and open-source.

This batch is mostly one theme: making big, messy bulk loads in Dynamics 365 survive what actually happens — throttling, timeouts, partial failures, the wrong key.

🛡 A Data Loader that doesn't give up
• Retry only the transient failures (timeouts, throttling, 5xx) at gentler concurrency — rollback still covers everything. Data/permission errors aren't offered a pointless retry.
• One slow or timed-out chunk no longer aborts the whole load — its rows become retryable errors and the rest keeps going.
• If a run crashes, you get the exact error on screen (with the stack trace), not a silent spinner.
• The progress bar counts the rows actually sent — so a 91k-row update matching 5k records reads "5k sent, 86k not eligible," not "stuck at 5k."

🔎 Filter results without re-querying
Query results now have a live filter box across every column — and every export (CSV / Excel / JSON) honours the filter + sort. Narrow thousands of rows to the ones you want, then export just those.

🧹 Safer defaults
Switching the target entity now resets the match key & mode, so a stale key from another entity can't quietly 404 every row. And the result card's Created vs Updated counts are now split correctly.

✅ A full code audit
I ran a multi-dimension review of the whole codebase — security, Dataverse limits, React/performance, and Edge compatibility — and fixed what it surfaced (count accuracy, a number-parsing trap, an N+1 query, grid identity under sort+filter, and more).

Free, open-source, in your browser, zero setup. None of this is unique — native admin tools, XrmToolBox, SSIS/KingswaySoft and dataflows overlap — but the bet stays the same: a safety net that tells you what will break before it breaks.

👉 GitHub (available now): https://github.com/zmissoum/colvio
👉 Chrome Web Store (in review): https://chromewebstore.google.com/detail/colvio-for-dynamics-365/edieednbdaclheikneelkjfbckibhdgl

What's the worst bulk-load surprise you've hit on D365? 👇

#Dynamics365 #Dataverse #D365 #PowerPlatform #CRM #DataMigration #OpenSource #ChromeExtension

---

## Post 19 — Do what the form won't let you (BPF manager + inline field edit)

> Release post (Colvio page), covers what's NEW since the published 1.11.66 → i.e. 1.11.67-71: two hero features only — BPF manager (reopen/re-stage a finished Business Process Flow, sysadmin-only) + inline editing of form-locked fields in Show All Data. Theme = "the form locks it, the API doesn't — 2 clicks in your browser." HONEST framing — XrmToolBox / SDK / console apps / direct Web API all do this; position on in-browser + zero-setup + from-the-record + PROD guardrail, NOT "nobody does this." NOTE FOR ZAKARIA: store is published @ 1.11.66; these two features are on GitHub (main, 1.11.71) but NOT yet on Chrome — upload colvio-v1.11.71.zip to put them live. Links: Post 18 used body links; strategy default is first comment — your call.

🔓 New in Colvio — for the moments Dynamics 365 says "no."

You know them. A case is resolved, so its Business Process Flow is locked — you can't reopen it or move it back a stage. A field is read-only on the form, even though it's perfectly writable underneath. The UI protects you… right up until you're the admin who actually needs to change it.

Two new features, one idea: do the legitimate, API-supported thing the form blocks — from the record you're already looking at, in your browser.

⚙️ Business Process Flow manager (System Administrators)
Open a record, see every BPF running on it, and:
• Reopen a finished / locked flow
• Move it to any stage
• Finish or abort it
No console app, no plugin to deploy — and it resolves the right underlying BPF entity for you (they're trickier under the hood than they look).

✎ Edit a field the form locked
Show All Data now puts a pencil on every writable column — text, numbers, yes/no, dates, option sets. Edit, save, done. Field-level security and your write privilege are still enforced by the server; the only thing bypassed is the form's own lock — and there's a production-environment confirmation before you commit.

None of this is unique — XrmToolBox, the SDK, console apps and the raw Web API can all do it. The bet is the same as always: zero setup, in the browser, two clicks from the record, with a guardrail before you touch production. Free and open-source.

👉 GitHub: https://github.com/zmissoum/colvio
👉 Chrome Web Store: https://chromewebstore.google.com/detail/colvio-for-dynamics-365/edieednbdaclheikneelkjfbckibhdgl

What's the one thing the D365 form won't let you do that you wish it would? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #CRM #PowerApps #OpenSource

---

## Post 20 — Roles you can finally read (and export) + clearing fields from a file

> Release post (Colvio page voice — no "I"), covers 1.11.72 → 1.11.78. Two themes: Security Audit upgrades (privilege MATRIX with not-granted cells + full export the maker portal doesn't offer; TEAMS tab solving the "Users (0)" mystery) and the Loader NULL token (clear any field — lookups included — from a file). HONEST framing — the matrix grid exists natively in make.powerapps (Colvio's angle = the EXPORT + not-granted visibility + in-browser); role membership tools exist in XrmToolBox; SSIS/KingswaySoft can clear fields. NOTE FOR ZAKARIA: publish AFTER uploading colvio-v1.11.78.zip to Chrome (store is @ 1.11.66 — none of this is live there yet); links in body like Posts 18-19, or move to first comment per strategy default.

🔍 New in Colvio — security roles you can finally read end-to-end, and one word to empty a field.

🧩 The privilege matrix, exportable
The make.powerapps role editor shows a beautiful grid — every table × Create / Read / Write / Delete / Append / Assign / Share, with those little depth pies. But try answering "can this role delete Contacts?" for an audit… cell by cell, tab by tab. And there's no export.
Colvio's Security Audit now has the same Matrix view — depth pies included — with two twists:
• It shows what a role can NOT do (not-granted cells included). Proving the absence of a privilege is half of every audit.
• One click exports the entire grid to Excel/CSV — every table, all 8 rights, plus the task-based privileges.

👥 The "Users (0)" mystery, solved
A role shows zero users… but it's clearly in use? It's held by TEAMS — users inherit it through membership. A new Teams tab lists every team holding the role (type, business unit, administrator, member count), right next to the Users tab. No more false "this role is unused" conclusions.

🧹 One word to clear a field
In the Data Loader, an empty cell has always meant "leave the field untouched" — by design, so a partial file can never wipe data. But then… how do you empty a field? Now: put the literal word NULL in the cell. Works on regular fields AND on lookups (the proper Web API disassociate under the hood, with the right navigation-property casing even on custom fields — a fun Dataverse gotcha).

Plus quiet hardening: filters on values containing # no longer break (URL fragment trap), and custom-lookup writes use the correctly-cased navigation property.

As always: none of this is exclusive — the maker portal shows the grid, XrmToolBox has role tooling, SSIS/KingswaySoft can clear fields. Colvio's bet is the same: zero setup, in your browser, exportable, free and open-source.

👉 GitHub: https://github.com/zmissoum/colvio
👉 Chrome Web Store: https://chromewebstore.google.com/detail/colvio-for-dynamics-365/edieednbdaclheikneelkjfbckibhdgl

What's the most painful thing about auditing security roles in your org? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #Security #PowerApps #OpenSource

---

## Posting Strategy

Recommended order after Chrome approval:

Week 1:
- Tuesday 8:30 AM: Post 3 (Launch announcement) — the big moment, ends with "Which feature would you try first?"
- Thursday 17:30: Post 1 (Name origin) — storytelling, ends with "What would YOUR key feature be?"

Week 2:
- Tuesday 8:30 AM: Post 2 (SF migration) — target Salesforce audience, ends with "What tool do you miss the most?"
- Thursday 17:30: Post 4 (5 things I check) — practical value, ends with "What's YOUR first check?"

Week 3:
- Tuesday 8:30 AM: Post 5 (Security angle) — target admins/CISO, ends with "How often do you audit?"
- Thursday 17:30: Post 9 (Community feedback) — full engagement post, vote + comment

Week 4:
- Tuesday 8:30 AM: Post 6 (Data quality) — target consultants, ends with "Worst data mess you've found?"
- Thursday 17:30: Post 7 (SQL parser) — target developers, ends with "SQL vs FetchXML?"

Week 5:
- Tuesday 8:30 AM: Post 8 (Quick tip) — lightweight, ends with "What's your favorite D365 API trick?"
- Thursday 17:30: Repost best performer with a different angle

Tips:
- Post between 8-9 AM or 5-6 PM on weekdays (Tuesday + Thursday)
- Put the GitHub/Chrome Web Store link in the FIRST COMMENT (not in the post body)
- Reply to ALL comments within the first hour
- Like every comment on your post
- Repost your best performer after 2 weeks with a different angle
- Every post ends with an open question to encourage comments
