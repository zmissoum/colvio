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

## Post 21 — Assign a role to 30 users in one paste (+ strip HTML on import)

> Release post (Colvio page voice), covers 1.11.79 → 1.11.80. Hero = bulk role assign/remove with the BU-copy gotcha story; secondary = strip-HTML Loader transform. HONEST framing — PPAC manages roles per user, XrmToolBox has Role Updater, SSIS tools transform HTML; Colvio's angle = in-browser + paste-emails + automatic BU-copy resolution + per-user report. NOTE FOR ZAKARIA: publish AFTER the next zip upload (store still @ 1.11.66); Posts 19 & 20 are also pending — space them out Tue/Thu. Links in body like recent posts, or first comment per strategy default.

👥 New in Colvio — assign a security role to 30 users in one paste.

The task every D365 admin knows: "give the new LNG.BASIC role to these 30 people." The admin center does it user by user. Click, search, tick, save — thirty times.

And if you script it instead, you hit THE classic trap: a security role isn't one record. It's one copy per business unit, and you must assign the copy that lives in each user's own BU. Assign the root copy to a user in a child BU → error.

Colvio's Security Audit now does the whole thing:
• Open the role → Users tab → paste a list of emails (one per line, commas fine)
• Colvio matches each user, picks the role copy from their business unit automatically, and assigns
• Per-user ✓/✗ report — unmatched emails listed, "already assigned" counted as OK, so you can safely re-run the same list
• Removal works the same way: tick members (filter to "Disabled" first, if that's your cleanup), one click removes the role
• Production asks for confirmation; the server still enforces your assign-role privilege — Colvio grants nothing you can't

🏷 Also new: the "strip HTML" import transform
Migrating rich text (hello, Salesforce exports) into a plain-text column? The new Data Loader transform removes the markup and keeps readable text — line breaks preserved, lists become bullets, entities decoded — and the pre-flight length check measures the cleaned text, not the raw HTML.

Honest as always: the admin center manages roles per user, XrmToolBox's Role Updater does bulk, SSIS tools transform HTML. Colvio's bet: zero setup, in your browser, BU-copies handled for you, with a per-user report. Free and open-source.

👉 GitHub: https://github.com/zmissoum/colvio
👉 Chrome Web Store: https://chromewebstore.google.com/detail/colvio-for-dynamics-365/edieednbdaclheikneelkjfbckibhdgl

How do you handle bulk role assignments today — admin center, XrmToolBox, scripts? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #Security #PowerApps #OpenSource

---

## Post 22 — A bulk loader that never lies to you

> Release post (Colvio page voice), covers 1.11.82 → 1.11.85 — the reliability wave, all born from ONE real 243k-row migration run: (1) timeout can no longer silently drop rows (honest totals + retry the unsent rows), (2) pre-flight example applies transforms (shows exactly what will be sent), (3) file-lines vs parsed-records transparency + unclosed-quote detection. Engineering-honesty angle — admitting the bug IS the story, plays well with a technical audience. NOTE FOR ZAKARIA: publish after the next store upload; Posts 19-21 also pending — this one works well LAST in the sequence (it's the "we fix our own bugs in the open" trust-builder). Links in body or first comment per preference.

🛡 New in Colvio — a bulk loader that never lies to you.

A user ran a 243,000-row update. One chunk hit a timeout… and the progress bar sprinted to the end. Result screen: "done". Reality: 228,000 rows were never sent — and nothing said so.

That bug is fixed, and it turned into a principle. Three releases, one theme: the loader must always tell you the truth.

1️⃣ A timeout can't eat your file anymore
When a chunk times out, the run now stops honestly: every unsent row becomes an explicit, retryable error. The totals add up to your file size — always. One click retries exactly the unsent rows, at gentler concurrency (which is what a throttled org needs anyway).

2️⃣ The preview shows what will actually be sent
The pre-flight "record example" used to display your raw CSV values — a "No" mapped through the boolean transform previewed as the string "No", so a correct mapping and a broken one looked identical. It now applies your transforms: booleans as true/false, dates as ISO, HTML stripped, NULL as null. What you see is what Dataverse gets.

3️⃣ Your file's row count, explained
"My 200k-line file only imported 14,800 rows??" — Because cells with quoted line breaks (hello, multiline HTML) span several file lines each. The Mapping step now says so, with both numbers. And if a stray unclosed quote swallowed the tail of your file into one giant cell, Colvio flags the exact record where it happened — before you run.

Bulk tools all fail sometimes — orgs throttle, files are messy. The difference is whether the tool tells you. Free, open-source, in your browser.

👉 GitHub: https://github.com/zmissoum/colvio
👉 Chrome Web Store: https://chromewebstore.google.com/detail/colvio-for-dynamics-365/edieednbdaclheikneelkjfbckibhdgl

What's the worst "it said done but it wasn't" you've hit with a data tool? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #DataMigration #OpenSource

---

## Post 23 — Two questions every D365 admin dreads (Adoption + org-wide privileges)

> Release post (Colvio page voice), covers 1.11.87 → 1.11.93. DUAL HERO structure (rewritten per Zakaria's ask — the org-wide privilege view deserved full billing, not one paragraph): Hero 1 = Adoption module (1.11.89 + 1.11.90-93 polish); Hero 2 = org-wide "who can do what" view (1.11.87 + the 1.11.93 honesty hardening: failed roles flagged, no partial exports). Closer = the bypass-header fix (1.11.88) — continues the engineering-honesty thread from Post 22. HONESTY NOTES kept: Adoption is built on Dataverse's own login audit (needs "Audit user access" enabled, limited to audit retention — the post says so); the admin center has usage analytics and make.powerapps shows per-role privileges — our angle is the CROSS-role sweep + role/BU filters + exports, not "nobody else does this". NOTE FOR ZAKARIA: publish after the next store upload, AFTER Posts 19-22 (keep 22 → 23 back-to-back: 22 admits a loader bug, 23 admits a bypass bug — the trust thread reads well in sequence). Link in first comment per preference.

Two questions every Dynamics 365 admin gets asked — and dreads:

1️⃣ "Who's actually USING the CRM we pay for?"
2️⃣ "Who can DELETE accounts in this org?"

Both used to mean hours of clicking. Colvio now answers each in one screen.

📈 Question 1 → the new Adoption module

Dataverse's own login audit, turned into answers:
📊 Total logins, distinct active users, average per user — 7/30/90 days or any custom window
👥 Filter by security role or business unit: "are the people we licensed for Sales actually signing in?"
📉 A trend chart you can switch between total logins, distinct users, or both
🚨 And the list nobody has ready when asked: enabled users who NEVER signed in during the window — one click to export it

Fair print: it needs "Audit user access" enabled in your org, and it sees what your audit retention keeps — Colvio tells you both, in the UI.

🌐 Question 2 → Security Audit went org-wide

Until now you could open ONE role and read its privilege matrix. The new org-wide view scans EVERY security role in the org and answers the question auditors actually ask:

🔎 Pick an operation (Delete, Write, Assign, Share…) and a minimum depth (org-wide only → any depth granted)
📋 Group by ROLE ("what can this role touch?") or flip it by TABLE ("which roles can delete Account — and at what depth?")
📤 Export the whole thing to CSV/Excel — the deliverable your security review wants
🛡 And it never lies: if a role fails to load mid-scan, you get a red "INCOMPLETE" banner and a retry button — not a clean-looking report with silent holes. Exports are blocked while the scan runs, so a partial file can't masquerade as a complete one.

🛠 One more fix we'd rather own in public than bury in a changelog: the Loader's "bypass asynchronous logic" checkbox was sending a header that… doesn't exist in the Dataverse API. Dataverse silently ignored it — the box did nothing. We verified every bypass header against Microsoft's docs; they're all correct now, and they now apply to bulk DELETE too (they didn't before). If you relied on that checkbox: it works now, and we're sorry it didn't before.

Free, open-source, runs in your browser on your own session — nothing leaves your org.

Which one hits closer to home — proving adoption, or proving who can delete what? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #CRM #SecurityAudit #Adoption #OpenSource

---

## Post 24 — "Accounts with no open opportunity" in two clicks (+ a chart that refused to lie)

> Release post (Colvio page voice), covers 1.11.94 → 1.11.98. Hero = Builder relational filters (1.11.94 — the Advanced-Find-style "filter by related records" gap, closed). Second = the Adoption exactness saga told as a detective story (1.11.95 server-side aggregation kills the 100k cap → 1.11.96 a user spots bars flat-lining at EXACTLY 500 → root cause: the audit table is an elastic table paging at 500 — great technical-audience content, continues the trust thread from Posts 22/23). Quick mentions: sidebar sections + slimmer permissions (1.11.97-98). HONESTY kept: Advanced Find / view designer already do relational filters INSIDE D365 — our angle is having it in the Builder next to no-cap export, plus the "not any()" existence filter that's painful to write by hand. NOTE FOR ZAKARIA: publish after Post 23, Tue/Thu cadence. Link in first comment.

🔍 "Give me every account with NO open opportunity."

Simple ask. In OData, it's this:

not opportunity_customer_accounts/any(o:o/statecode eq 0)

Nobody remembers that syntax. Colvio's query Builder now writes it for you.

New: relational filters — filter the ROOT rows by their RELATED records, Advanced-Find style:

↑ Condition on a parent: "contacts whose parent account is in Healthcare"
↓ Condition on children: "accounts with at least one active contact" — or the classic auditors ask: "accounts with NO open opportunity"

Pick the relation, pick the condition, Colvio generates the OData (and shows it, so you learn the syntax for free). Combines with your other filters, exports the full result — no 5,000-row ceiling, ever.

📊 Also this week: a user made our Adoption chart confess.

He noticed the distinct-users bars flat-lining at EXACTLY 500 on busy days. Not 498. Not 503. 500.

That's never chance. Root cause, two layers down: Dataverse's audit table is an ELASTIC table (Cosmos-backed) — and elastic tables page query results at 500 rows, not the 5,000 you get everywhere else. Our per-day aggregate was silently reading page one and calling it a day.

Fixed properly: the aggregation now detects ANY truncation signal and falls back to an exact scan — and when a day's data can't load at all, you get a red "INCOMPLETE" banner with a retry button, never a clean-looking chart with silent holes. His "total logins" jumped from a capped 100,000 to the real 644,000+.

A chart that can't lie is worth more than a chart that loads fast. We keep choosing the former.

🧹 And some housekeeping: the sidebar is now organized into Data / Develop / Admin sections (Loader finally sits next to Explorer), and the extension asks for FEWER Chrome permissions than before — we removed everything we didn't strictly need.

Free, open-source, runs in your browser on your own session.

What's the related-records query you always end up writing by hand? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #OData #OpenSource

---

## Post 25 — Dataverse just learned SQL. And the roles you never see.

> Release post (Colvio page voice), covers the 1.11.158 → 1.11.170 arc. Hero = NATIVE SQL (Microsoft's new Web API ?sql= option — timely, the community is actively posting about it; we credit Microsoft and position Colvio as the fastest way to use it, with the honest Native/Transpiled split). Second = Teams module (the "invisible roles" story — strong admin hook). Third = the "Secondary" badge confession (continues the trust thread from Posts 22/23/24 — we found OUR OWN badge mislabeling production and say so plainly). HONESTY kept: native SQL is Microsoft's feature, not ours; the transpiler remains for HAVING/TOP; native doesn't cover virtual tables. NOTE FOR ZAKARIA: publish after Post 24, Tue/Thu cadence, link in first comment.

⚡ Microsoft quietly shipped one of the most-requested Dataverse features: SQL in the Web API. Pass a SELECT through the new ?sql= query option and the SERVER executes it — real joins included.

Colvio's SQL mode now has two engines:

→ Native: your SELECT goes straight to Dataverse. Multi-table INNER/LEFT JOINs with aliases, self-joins, DISTINCT, server-side GROUP BY:

SELECT a.name, c.fullname FROM account AS a
INNER JOIN contact AS c ON a.primarycontactid = c.contactid

→ Transpiled: our SQL→FetchXML converter — still the only engine with HAVING and TOP, and the fallback on environments that don't have ?sql= yet (Colvio detects it on first run and switches for you).

Either way: results land in a sortable table, auto-paginated past every row cap, exportable to CSV/Excel.

👥 Also new: a Teams module. Here's the thing about Dataverse security — a role carried by a team is inherited by every member and NEVER appears in the user's own role list. "Why does this user have that right?" finally has a screen: pick a team, see its security roles, its members, and for Entra group teams the group Object ID — plus the truth the docs bury: group membership materializes only after a user's next access.

🛡 And a confession, because we keep choosing charts (and badges) that can't lie: our environment badge was labeling a PRODUCTION org "SECONDARY" — in green. Root cause: Microsoft's OrganizationType enum has no "Production" member. Real production orgs report "Customer" or "Secondary" (yes, really). We rebuilt detection on the documented enum, fail-closed: anything unknown is treated as production, so bulk operations confirm exactly where they must.

20 modules, 314 automated tests, free and open source, runs in your browser on your own session.

What's the first SQL query you'll throw at Dataverse? 👇

#Dynamics365 #Dataverse #PowerPlatform #SQL #D365

---

## Campaign — "Colvio in video" (Posts 26 → 31, 3 weeks)

> Built on the generated videos and store graphics (`tools/video`). START GATE: J = the first Tuesday after the Chrome Web Store shows **v1.11.172** (or later) — the tour shows Teams and Storage, which the store build doesn't have before that. If Post 25 (native SQL + Teams) isn't out yet, publish it the week before J: it's the release news, this campaign is the show-and-tell that follows.
>
> Rules (unchanged): Colvio page voice ("we", "Colvio") except Post 31 (Zakaria's personal profile, first person) · upload the video NATIVELY to LinkedIn (no YouTube link: native video reaches far more people) · link in the FIRST COMMENT · reply to every comment within the first hour · FR version for the French audience — either a separate post the same day at 12:15 or LinkedIn's "add a translation" if available.
>
> First comment, every post: `🔗 Chrome Web Store: https://chromewebstore.google.com/detail/edieednbdaclheikneelkjfbckibhdgl · Source: https://github.com/zmissoum/colvio`

| Slot | Post | Asset (EN / FR) |
|---|---|---|
| J · Tue 8:30 | 26 — 2 minutes, 16 modules | `tools/video/out/video/colvio_tour_en.mp4` / `_fr.mp4` |
| J+2 · Thu 17:30 | 27 — 94 seconds inside the Data Explorer | `tools/video/out/deep/colvio_explorer_en.mp4` / `_fr.mp4` |
| J+7 · Tue 8:30 | 28 — 5 questions, 5 screens (carousel) | `tools/video/out/linkedin/colvio_5_screens_en.pdf` / `_fr.pdf` (document post) |
| J+9 · Thu 17:30 | 29 — What's filling your capacity? | `tools/video/out/deep/colvio_storage_en.mp4` / `_fr.mp4` (still image: `store/en/05_storage.png`) |
| J+14 · Tue 8:30 | 30 — Who uses the CRM you pay for? | `tools/video/out/deep/colvio_adoption_en.mp4` / `_fr.mp4` (still image: `store/en/04_adoption.png`) |
| J+16 · Thu 17:30 | 31 — A script recorded our videos (personal profile; Colvio page reshares J+17) | `colvio_tour_en.mp4` |

Example: v1.11.172 live by Monday 12 October → 13, 15, 20, 22, 27 and 29 October.

### Post 26 — 2 minutes, 16 modules, zero setup

**EN**

🎬 2 minutes, 16 modules, zero setup.

We keep getting the same question: "OK, but what does Colvio actually DO?"

Here's the answer, in motion: 16 modules on demo data, back to back.

🔎 Data: query any table (Builder, OData, FetchXML or SQL), inspect every field of a record
🛠 Develop: metadata, relationships, solutions, apps, automation, environment variables, translations
🛡 Admin: users & licenses, business units, security roles, teams, adoption, login history, storage

What you won't see in the video: a sign-up screen, an API key, an app registration. Colvio runs in your browser on the Dynamics 365 session you already have, and talks to nothing but your own org.

Free, open source, 21 modules in total, 347 automated tests.

Which module would you open first? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #OpenSource

**FR**

🎬 2 minutes, 16 modules, zéro configuration.

On nous pose souvent la même question : « OK, mais concrètement, Colvio fait quoi ? »

La réponse, en vidéo : 16 modules sur des données de démo, l'un après l'autre.

🔎 Données : interroger n'importe quelle table (Builder, OData, FetchXML ou SQL), inspecter chaque champ d'un enregistrement
🛠 Développement : métadonnées, relations, solutions, apps, automatisations, variables d'environnement, traductions
🛡 Administration : utilisateurs et licences, business units, rôles de sécurité, teams, adoption, historique de connexion, stockage

Ce que vous ne verrez pas dans la vidéo : un écran d'inscription, une clé d'API, une app registration. Colvio tourne dans votre navigateur, sur la session Dynamics 365 que vous avez déjà, et ne parle qu'à votre propre org.

Gratuit, open source, 21 modules au total, 347 tests automatisés.

Quel module ouvririez-vous en premier ? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #OpenSource

---

### Post 27 — 94 seconds inside the Data Explorer

**EN**

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

**FR**

⏱ 94 secondes dans le Data Explorer de Colvio.

Une table, une requête, et tout ce qu'on peut en faire, en huit étapes :

1. Choisir une table et ses colonnes (chaque table affiche son volume)
2. Filtrer visuellement, avec les opérateurs adaptés au type de chaque colonne
3. Exécuter (sans plafond à 5 000 lignes), puis trier et affiner les résultats
4. Voir la même requête en OData ou en FetchXML, ou écrire du SQL : exécuté nativement par Dataverse, ou converti en FetchXML
5. Double-cliquer une cellule pour la modifier : la valeur est vérifiée selon le type de la colonne avant tout envoi
6. Cocher des enregistrements, choisir une colonne et une valeur : une mise à jour en masse, après confirmation
7. Trouver les doublons sur les colonnes que VOUS choisissez, l'excédent présélectionné pour le nettoyage
8. Des onglets de requêtes, un historique sans les valeurs de filtre, et les exports Excel / CSV / JSON

Tout sur des données de démo. Aucune vraie org à l'écran.

Laquelle de ces huit étapes faites-vous encore à la main aujourd'hui ? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #DataManagement

---

### Post 28 — 5 questions, 5 screens (carousel)

**EN**

5 questions you get asked about a Dynamics 365 org, and the Colvio screen that answers each. Swipe 👉

1️⃣ "Can you pull these records for me?" → Data Explorer: any table, any filter, no 5,000-row cap, export in one click
2️⃣ "What's actually stored on this record?" → Show All Data: every field with its logical name and type, editable in place
3️⃣ "What can this role really do?" → Security Audit: the privilege matrix, table by table, sensitive rights flagged
4️⃣ "Is anyone actually using the CRM?" → Adoption: DAU / WAU / MAU, adoption per business unit, paid seats that never sign in
5️⃣ "Why is our storage so full?" → Storage: row counts for every table in seconds, and the cleanup that applies

Five answers, one browser side panel, the session you already have. Free and open source.

Which question lands on your desk most often? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #CRM

**FR**

5 questions qu'on vous pose sur une org Dynamics 365, et l'écran Colvio qui répond à chacune. Faites défiler 👉

1️⃣ « Tu peux m'extraire ces enregistrements ? » → Data Explorer : n'importe quelle table, n'importe quel filtre, sans plafond à 5 000 lignes, export en un clic
2️⃣ « Qu'est-ce qu'il y a vraiment sur cette fiche ? » → Show All Data : chaque champ avec son nom logique et son type, modifiable sur place
3️⃣ « Ce rôle, il permet quoi exactement ? » → Audit de sécurité : la matrice des privilèges, table par table, droits sensibles signalés
4️⃣ « Est-ce que quelqu'un utilise vraiment le CRM ? » → Adoption : DAU / WAU / MAU, adoption par business unit, licences payées jamais utilisées
5️⃣ « Pourquoi notre stockage est-il plein ? » → Stockage : le volume de chaque table en quelques secondes, et le nettoyage adapté

Cinq réponses, un panneau latéral dans le navigateur, la session que vous avez déjà. Gratuit et open source.

Quelle question atterrit le plus souvent sur votre bureau ? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #CRM

---

### Post 29 — What's filling your Dataverse capacity?

**EN**

💾 "We're over our Dataverse capacity. Which tables are filling it?"

The admin center tells you HOW MUCH you use. It doesn't tell you WHERE.

Colvio's Storage module does:

📊 Row counts for every table in the org, in seconds, read from Dataverse's own snapshot (refreshed by the platform, at most 24 h old) instead of a slow scan
🏷 Each table tagged Database, File or Log, following Microsoft's capacity split
🐘 The tables that grow silently (audit, system jobs, workflow logs, plug-in traces, emails, import leftovers), each with the cleanup that applies
📎 File storage measured in real bytes per table (notes, file and image columns, email attachments), in the background
📤 Everything exportable

What it won't pretend: the GB you're billed on only live in the Power Platform admin center. Colvio says so on screen and links you there. Use it to find WHICH tables to clean, then check the bill.

What's the biggest table in your org, and would you have guessed it? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #Storage

**FR**

💾 « On a dépassé notre capacité Dataverse. Quelles tables la remplissent ? »

Le centre d'administration vous dit COMBIEN vous consommez. Pas OÙ.

Le module Stockage de Colvio, si :

📊 Le volume de chaque table de l'org en quelques secondes, lu dans le snapshot de Dataverse lui-même (rafraîchi par la plateforme, 24 h maximum) plutôt qu'un scan interminable
🏷 Chaque table classée Base de données, Fichier ou Journal, selon le découpage de capacité de Microsoft
🐘 Les tables qui grossissent en silence (audit, travaux système, journaux de workflow, traces de plug-ins, emails, restes d'imports), chacune avec le nettoyage adapté
📎 Le stockage fichier mesuré en octets réels par table (notes, colonnes fichier et image, pièces jointes d'emails), en arrière-plan
📤 Tout est exportable

Ce qu'il ne prétend pas : les Go qui vous sont facturés ne se lisent que dans le centre d'administration Power Platform. Colvio le dit à l'écran et vous y emmène. Servez-vous-en pour trouver QUELLES tables nettoyer, puis vérifiez la facture.

Quelle est la plus grosse table de votre org, et l'auriez-vous devinée ? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #Stockage

---

### Post 30 — Who actually uses the CRM you pay for?

**EN**

📈 "How many people actually use the CRM we pay for?"

Management asks. Nobody has the number ready.

Colvio's Adoption module turns Dataverse's own access audit into the answer:

👥 Distinct active users, DAU / WAU / MAU and stickiness, over 7, 30 or 90 days or any custom window
🏢 Adoption rate per business unit (active ÷ enabled), filterable by security role
💸 Paid seats that never sign in, with license type and days since last access, ready to export
🔁 Comparison with the previous period in one click
📊 And the deck for the meeting: a 5-slide PowerPoint with native, editable charts

Honest by design: Dataverse records access at most once per interval (4 h by default), so Colvio counts "access events", not logins. Service and application users are left out, since they never sign in by design. It needs "Audit user access" turned on and sees what your audit retention keeps, and the screen says both.

If you could know one adoption number for your org today, which would it be? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #Adoption

**FR**

📈 « Combien de personnes utilisent vraiment le CRM qu'on paie ? »

La direction pose la question. Personne n'a le chiffre sous la main.

Le module Adoption de Colvio transforme l'audit d'accès de Dataverse en réponse :

👥 Utilisateurs actifs distincts, DAU / WAU / MAU et fidélité, sur 7, 30 ou 90 jours ou n'importe quelle période
🏢 Taux d'adoption par business unit (actifs ÷ activés), filtrable par rôle de sécurité
💸 Les licences payées jamais utilisées, avec le type de licence et les jours depuis le dernier accès, prêtes à exporter
🔁 La comparaison avec la période précédente en un clic
📊 Et le support pour la réunion : un PowerPoint de 5 diapositives avec de vrais graphiques modifiables

Honnête par conception : Dataverse enregistre au plus un accès par intervalle (4 h par défaut), donc Colvio compte des « événements d'accès », pas des connexions. Les comptes de service et d'application sont exclus : ils ne se connectent jamais, par nature. Il faut que l'audit de l'accès utilisateur (« Audit user access ») soit activé, et Colvio ne voit que ce que votre rétention d'audit conserve ; l'écran le dit.

Si vous pouviez connaître un seul chiffre d'adoption de votre org aujourd'hui, ce serait lequel ? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #Adoption

---

### Post 31 — A script recorded our videos (Zakaria's personal profile, first person)

**EN**

I didn't record a single one of Colvio's demo videos. A script did.

Product videos made by hand never survived the release pace: every UI change put the last recording out of date. So I automated the recording instead:

▶️ Playwright opens the built extension in demo mode, exactly what users install
🎥 The Chrome DevTools screencast captures every frame
💬 An overlay injected into the page draws captions, an animated cursor, click ripples and title cards
🎞 ffmpeg puts the frames back together at their real timing, as a 1080p MP4

One command gives the full tour in English and French, plus one clip per module.

The part I like most: each render replays every scene, and a failed click or a single console error fails the run. The video pipeline doubles as an end-to-end test of the whole UI.

It now also renders one deep-dive video per module, chapter by chapter: 16 of them, in two languages.

Demo data only. No client org ever goes on camera.

Would you trust a demo video more, or less, knowing a script recorded it? 👇

#Dynamics365 #Playwright #OpenSource #TestAutomation #DevTools

**FR**

Je n'ai enregistré aucune des vidéos de démo de Colvio. Un script s'en est chargé.

Les vidéos produit faites à la main ne tenaient jamais le rythme des versions : chaque changement d'interface rendait le dernier enregistrement obsolète. Alors j'ai automatisé l'enregistrement :

▶️ Playwright ouvre l'extension compilée en mode démo, exactement ce que les utilisateurs installent
🎥 Le screencast des Chrome DevTools capture chaque image
💬 Une surcouche injectée dans la page dessine les légendes, un curseur animé, les clics et les cartons de titre
🎞 ffmpeg remonte les images à leur vrai rythme, en MP4 1080p

Une commande donne la visite complète en anglais et en français, plus un clip par module.

Ce que je préfère : chaque rendu rejoue toutes les scènes, et un clic raté ou une seule erreur de console fait échouer le rendu. La chaîne vidéo sert aussi de test de bout en bout de toute l'interface.

Elle produit aussi une vidéo détaillée par module, chapitre par chapitre : 16 vidéos, en deux langues.

Uniquement des données de démo. Aucune org client ne passe jamais à l'écran.

Une vidéo de démo enregistrée par un script, ça vous inspire plus ou moins confiance ? 👇

#Dynamics365 #Playwright #OpenSource #TestAutomation #DevTools

---

### After the campaign — "One module a week" (deep-dive series)

> From J+21, one post a week (Tuesday 8:30), Colvio page voice, native upload of `tools/video/out/deep/colvio_<module>_<lang>.mp4` (1 to 1 min 40 s, chapters captioned, demo data only). Each post = the hook below + 3–4 lines picked from the video's chapter captions (`tools/video/deep/<module>.mjs`) + the question. Link in first comment, ≤ 5 hashtags (#Dynamics365 #Dataverse #PowerPlatform #D365 + one topical).

| Week | Module (video key) | Hook EN | Accroche FR | Closing question EN / FR |
|---|---|---|---|---|
| 1 | Security Audit (`security`) | "Who can delete accounts in this org?" — one screen, every role, every depth. | « Qui peut supprimer des comptes dans cette org ? » — un écran, tous les rôles, toutes les profondeurs. | When did you last audit your roles? / À quand remonte votre dernier audit des rôles ? |
| 2 | Teams (`teams`) | The rights a user has that never show on their profile. | Les droits d'un utilisateur qui n'apparaissent jamais sur sa fiche. | Owner teams or Entra groups? / Teams propriétaires ou groupes Entra ? |
| 3 | Show All Data (`showalldata`) | Every field of the record you're on — including the ones the form hides. | Tous les champs de l'enregistrement ouvert — y compris ceux que le formulaire cache. | What's the field you always hunt for? / Quel champ cherchez-vous toujours ? |
| 4 | Apps (`apps`) | "Include all forms" — the checkbox the maker portal never shows you again. | « Inclure tous les formulaires » — la case que le portail maker ne vous montre plus jamais. | Ever had a form show up where it shouldn't? / Un formulaire déjà apparu là où il ne devait pas ? |
| 5 | Business Units (`bu`) | Move 40 users to another BU by pasting their emails. | Déplacer 40 utilisateurs vers une autre BU en collant leurs emails. | How many BUs does your org have? / Combien de BU dans votre org ? |
| 6 | Solutions (`solutions`) | What's different between DEV and PROD — component by component. | Ce qui diffère entre DEV et PROD — composant par composant. | How do you check a deployment today? / Comment vérifiez-vous un déploiement aujourd'hui ? |
| 7 | Env Variables (`envvars`) | The environment variable with no value — the bug that shows up three screens later. | La variable d'environnement sans valeur — le bug qui apparaît trois écrans plus loin. | Ever been bitten by an empty variable? / Déjà piégé par une variable vide ? |
| 8 | Automation (`automation`) | "Why did this field change?" — every plug-in step and process, on one list. | « Pourquoi ce champ a changé ? » — chaque étape de plug-in et chaque processus, sur une liste. | Plug-ins or flows? / Plug-ins ou flows ? |
| 9 | Metadata (`metadata`) | A data dictionary in one click — and a schema diff between two orgs. | Un dictionnaire de données en un clic — et un diff de schéma entre deux orgs. | Do you keep a data dictionary? / Tenez-vous un dictionnaire de données ? |
| 10 | Relationships (`relationships`) | Your data model, business relations first. | Votre modèle de données, relations métier d'abord. | Which table has the most relations in your org? / Quelle table a le plus de relations chez vous ? |
| 11 | Users & Licenses (`licenses`) | Paid seats, disabled users, service accounts — the license picture in one list. | Licences payées, utilisateurs désactivés, comptes de service — le tableau des licences en une liste. | How many unused licenses would you bet on? / Combien de licences inutilisées pariez-vous ? |
| 12 | Translations (`translations`) | Fix field labels in every language — and round-trip them through a CSV file. | Corriger les libellés dans chaque langue — et les faire passer par un fichier CSV. | How many languages does your org run? / Combien de langues dans votre org ? |
| 13 | Login History (`logins`) | App or API? Each user's access trail, from the audit — and why there's no "logout". | Application ou API ? La trace d'accès de chaque utilisateur — et pourquoi il n'y a pas de « déconnexion ». | Did you know Dataverse has no sign-out event? / Saviez-vous que Dataverse n'a pas d'événement de déconnexion ? |

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
