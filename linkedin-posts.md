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

## Feature videos on LinkedIn — Posts 26 → 42 (17 videos, 13 weeks)

> PURPOSE: present Colvio's features IN VIDEO — nothing else. The earlier posts (1–25) already introduced Colvio and announced each release; none showed the features in motion. So no release news, no "what's new", no behind-the-scenes here: each post = one video + what it shows.
>
> START GATE: J = the first Tuesday after the Chrome Web Store shows **v1.11.173** (or later) — the videos show Teams, Storage and the current Login History, which older store builds don't have.
>
> Rules: Colvio page voice ("we", "Colvio") · upload the MP4 NATIVELY (no YouTube link: native video reaches far more people) · captions are burned in, so it works muted · link in the FIRST COMMENT · reply to every comment within the first hour · FR version for the French audience — a separate post the same day at 12:15, or LinkedIn's "add a translation" if available. Every claim below is shown in the video or stated in its chapter captions (`tools/video/deep/<key>.mjs`, `tools/video/make-video.mjs`).
>
> First comment, every post: `🔗 Chrome Web Store: https://chromewebstore.google.com/detail/edieednbdaclheikneelkjfbckibhdgl · Source: https://github.com/zmissoum/colvio`
>
> Videos: `tools/video/out/deep/colvio_<key>_en.mp4` / `_fr.mp4` (tour: `tools/video/out/video/colvio_tour_en.mp4` / `_fr.mp4`).

| Week | Slot | Post | Video (key · length) |
|---|---|---|---|
| 1 | Tue 8:30 | 26 — Colvio in 2 minutes | tour · 2 min 14 |
| 1 | Thu 17:30 | 27 — Data Explorer | `explorer` · 94 s |
| 2 | Tue 8:30 | 28 — Security Audit | `security` · 90 s |
| 2 | Thu 17:30 | 29 — Adoption | `adoption` · 87 s |
| 3 | Tue 8:30 | 30 — Storage | `storage` · 62 s |
| 3 | Thu 17:30 | 31 — Teams | `teams` · 73 s |
| 4 | Tue 8:30 | 32 — Show All Data | `showalldata` · 67 s |
| 4 | Thu 17:30 | 33 — Apps | `apps` · 68 s |
| 5 | Tue 8:30 | 34 — Business Units | `bu` · 81 s |
| 6 | Tue 8:30 | 35 — Solutions | `solutions` · 70 s |
| 7 | Tue 8:30 | 36 — Environment Variables | `envvars` · 75 s |
| 8 | Tue 8:30 | 37 — Automation | `automation` · 72 s |
| 9 | Tue 8:30 | 38 — Metadata | `metadata` · 83 s |
| 10 | Tue 8:30 | 39 — Relationships | `relationships` · 59 s |
| 11 | Tue 8:30 | 40 — Users & Licenses | `licenses` · 64 s |
| 12 | Tue 8:30 | 41 — Translations | `translations` · 64 s |
| 13 | Tue 8:30 | 42 — Login History | `logins` · 53 s |

Two posts a week the first month, then one a week. Example if v1.11.173 is live by Monday 12 October: 13 & 15 Oct, 20 & 22 Oct, 27 & 29 Oct, 3 & 5 Nov, then 10, 17, 24 Nov, 1, 8, 15 Dec — pause over the holidays — 5, 12, 19 Jan.

### Post 26 — Colvio in 2 minutes (tour)

**EN**

🎬 2 minutes, 16 modules, zero setup.

We keep getting the same question: "OK, but what does Colvio actually DO?"

Here's the answer, in motion: 16 modules on demo data, back to back.

🔎 Data: query any table (Builder, OData, FetchXML or SQL), inspect every field of a record
🛠 Develop: metadata, relationships, solutions, apps, automation, environment variables, translations
🛡 Admin: users & licenses, business units, security roles, teams, adoption, login history, storage

What you won't see in the video: a sign-up screen, an API key, an app registration. Colvio runs in your browser on the Dynamics 365 session you already have, and talks to nothing but your own org.

Over the next weeks we'll take them one by one, each in its own video.

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

Dans les semaines qui viennent, on les reprend un par un, chacun dans sa vidéo.

Quel module ouvririez-vous en premier ? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #OpenSource

---

### Post 27 — Data Explorer (`explorer`, 94 s)

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

### Post 28 — Security Audit (`security`, 90 s)

**EN**

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

**FR**

🛡 « Qui peut supprimer des comptes dans cette org ? »

La question que pose chaque audit, et à laquelle l'éditeur de rôles vous fait répondre rôle par rôle.

▶️ 90 secondes dans l'audit de sécurité de Colvio :

→ Chaque rôle en clair : privilèges niveau Organisation et privilèges sensibles (suppressions, exports, gestion des utilisateurs et des rôles, personnalisation) comptés et signalés
→ La vue matrice : chaque table × les 8 droits d'accès, la profondeur dessinée en cercle qui se remplit
→ Qui détient vraiment le rôle : les membres de toutes les copies du rôle par business unit, et les teams qui le transmettent sans qu'il apparaisse jamais sur l'utilisateur
→ Attribuer le rôle à une liste de personnes : collez leurs emails, Colvio prend pour chacun la copie du rôle de sa propre business unit
→ Toute l'org en une analyse : choisissez un droit et une profondeur minimale (« Delete » niveau Organisation), puis regroupez par table, exportable en CSV ou Excel

Données de démo dans la vidéo. Gratuit et open source.

À quand remonte votre dernière revue de « qui peut supprimer quoi » ? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #SecurityAudit

---

### Post 29 — Adoption (`adoption`, 87 s)

**EN**

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

**FR**

📈 « Combien de personnes utilisent vraiment le CRM qu'on paie ? »

La direction pose la question. Personne n'a le chiffre sous la main.

▶️ 87 secondes dans le module Adoption de Colvio :

→ Événements d'accès, utilisateurs distincts, DAU / WAU / MAU, lus dans l'audit d'accès de Dataverse
→ La tendance jour par jour : connexions, utilisateurs distincts, ou les deux
→ Qui l'utilise le plus, par jours actifs ou par accès le plus récent
→ La liste que personne n'a sous la main : les utilisateurs qui ne se sont jamais connectés
→ Tout le périmètre avec licence et inactivité : qui n'est pas venu depuis 30 jours ou plus
→ Filtre par rôle de sécurité ou business unit, sous-BU comprises ; 7, 30, 90 jours ou une période libre
→ Comparaison avec la période précédente, export CSV ou Excel, ou un PowerPoint de 5 diapositives

Honnête par conception : Dataverse enregistre au plus un accès par utilisateur et par intervalle (4 h par défaut), donc Colvio compte des « événements d'accès », pas des connexions, et les comptes de service sont exclus par défaut. Il faut que l'audit de l'accès utilisateur (« Audit user access ») soit activé, et l'écran le dit.

Si vous pouviez connaître un seul chiffre d'adoption de votre org aujourd'hui, ce serait lequel ? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #Adoption

---

### Post 30 — Storage (`storage`, 62 s)

**EN**

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

**FR**

💾 « On a dépassé notre capacité Dataverse. Quelles tables la remplissent ? »

Le centre d'administration vous dit COMBIEN vous consommez. Pas OÙ.

▶️ 62 secondes dans le module Stockage de Colvio :

→ Le volume de chaque table de l'org en quelques secondes, lu dans le snapshot de Dataverse lui-même (rafraîchi par la plateforme, 24 h maximum)
→ Les tables qui grossissent en silence (audit, travaux système, journaux de workflow, traces de plug-ins, emails, restes d'imports), chacune avec le nettoyage adapté
→ Le stockage fichier mesuré en octets réels par table : notes, colonnes fichier et image, pièces jointes d'emails
→ Filtre par type de stockage (Base de données, Fichier, Journal) ou recherche sur n'importe quelle table
→ Actualisation à la demande

Ce qu'il ne prétend pas : les Go qui vous sont facturés ne se lisent que dans le centre d'administration Power Platform. Colvio le dit à l'écran et vous y emmène.

Quelle est la plus grosse table de votre org, et l'auriez-vous devinée ? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #Stockage

---

### Post 31 — Teams (`teams`, 73 s)

**EN**

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

**FR**

👥 Certains droits d'un utilisateur n'apparaissent jamais sur sa fiche.

Dans Dataverse, un rôle de sécurité porté par une team est hérité par chacun de ses membres, et il n'apparaît pas dans la liste des rôles de l'utilisateur. C'est souvent là que s'arrête la question « pourquoi cet utilisateur peut-il faire ça ? ».

▶️ 73 secondes dans le module Teams de Colvio :

→ Chaque team avec son type (Owner, groupe Entra, team par défaut de BU), et une recherche sur le nom, la business unit et l'administrateur
→ Les rôles de sécurité d'une team owner : ceux dont ses membres héritent
→ Les teams de groupe Entra : l'Object ID du groupe à copier, et la vérité sur l'appartenance : un nouveau membre du groupe n'apparaît qu'après son prochain accès
→ Les membres avec mode d'accès, type de licence et statut, exportables
→ Les teams d'accès (une par enregistrement partagé, parfois des milliers) chargées seulement à la demande

Données de démo dans la vidéo. Gratuit et open source.

Teams owner ou groupes Entra : sur quoi repose votre org ? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #EntraID

---

### Post 32 — Show All Data (`showalldata`, 67 s)

**EN**

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

**FR**

👁 Le formulaire affiche 30 champs. L'enregistrement en a 120.

▶️ 67 secondes dans Show All Data :

→ Collez l'URL d'un enregistrement (ou table/GUID) : chaque colonne renseignée avec son nom logique, son libellé et son type
→ Tapez pour trouver une colonne, par nom logique ou par libellé
→ Cochez « Empty columns » pour lister toutes les colonnes de la table, remplies ou non
→ Les colonnes de choix affichent leur libellé, pas le nombre stocké
→ « Custom only » ne garde que les colonnes de vos propres éditeurs ; celles de Microsoft (msdyn_, adx_) restent à l'écart
→ Copiez une valeur, le GUID de l'enregistrement, ou tout l'enregistrement en JSON

Sur votre propre org (non montré avec les données de démo) : modifiez une valeur sur place, lookups compris, la sécurité des champs restant appliquée par Dataverse.

Quel champ finissez-vous toujours par chercher ? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #PowerApps

---

### Post 33 — Apps (`apps`, 68 s)

**EN**

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

**FR**

🧩 « Pourquoi ce formulaire apparaît-il dans cette app ? »

Souvent à cause d'une case : « inclure tous les formulaires ». Laissée cochée, elle fait entrer dans l'app chaque formulaire actuel ET futur de la table, et le portail maker n'affiche plus cet état ensuite.

▶️ 68 secondes dans le module Apps de Colvio :

→ Les tables, formulaires et vues de chaque app, marqués EXPLICIT (choisis à la main) ou IMPLICIT (amenés par « inclure tout »)
→ Les boutons modernes de la barre de commandes de l'app
→ Les sous-grilles d'un formulaire : la table enfant, la vue affichée, la relation qui les relie
→ Ouvrez cette vue : ses filtres, ses colonnes, son tri, la réponse à « pourquoi ma ligne n'est pas dans cette sous-grille ? »
→ La recherche inversée : tapez le nom d'un formulaire, d'une vue ou d'un bouton, et voyez toutes les apps qui l'exposent
→ Un clic envoie le FetchXML de la vue dans le Data Explorer

Données de démo dans la vidéo. Gratuit et open source.

Un formulaire est-il déjà apparu là où personne ne l'avait ajouté ? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #PowerApps

---

### Post 34 — Business Units (`bu`, 81 s)

**EN**

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

**FR**

🏢 Une réorganisation arrive chez l'admin sous forme de tableau d'adresses email.

▶️ 81 secondes dans le module Business Units de Colvio :

→ Toute l'arborescence des BU avec le nombre d'utilisateurs directs, ou un vrai organigramme : dépliez les branches, zoomez, exportez en PNG
→ Ouvrez une BU : membres directs, total avec les sous-BU, exports de la BU seule ou de toute sa sous-arborescence
→ Les membres avec mode d'accès et type de licence ; les comptes désactivés ressortent
→ Collez la liste d'emails (format Outlook compris) : chaque correspondance est cochée, les absents de cette BU sont listés
→ Déplacez-les vers une autre BU, avec un avertissement sur les rôles de sécurité AVANT toute écriture, puis le résultat utilisateur par utilisateur

Données de démo dans la vidéo. Gratuit et open source.

Combien de business units dans votre org ? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #CRMAdmin

---

### Post 35 — Solutions (`solutions`, 70 s)

**EN**

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

**FR**

📦 « Qu'est-ce qui diffère entre DEV et PROD ? »

▶️ 70 secondes dans le module Solutions de Colvio :

→ Chaque solution avec sa version et son nombre de composants, managée ou non
→ Son contenu, groupé par type : tables, colonnes, option sets, vues, graphiques, assemblies de plug-ins
→ La liste complète des composants en CSV ou Excel : votre checklist de déploiement
→ Comparez deux solutions de l'org : seulement ici, dans les deux, seulement là-bas
→ Entre deux orgs : exportez un fichier de comparaison sur DEV, chargez-le sur PROD, lisez l'écart type par type, rapproché par GUID ou par type et nom

Données de démo dans la vidéo. Gratuit et open source.

Comment vérifiez-vous un déploiement aujourd'hui ? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #ALM

---

### Post 36 — Environment Variables (`envvars`, 75 s)

**EN**

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

**FR**

⚙️ Une variable d'environnement sans valeur n'échoue pas à l'import. Elle échoue plus tard, en chaîne vide dans un flux ou un plug-in.

▶️ 75 secondes dans le module Variables d'environnement de Colvio :

→ Compte et liste les variables sans valeur courante NI valeur par défaut : le piège classique après un déploiement
→ Édition typée : oui/non pour les booléens, le JSON doit être valide, les nombres doivent être des nombres ; une valeur invalide est refusée avec la raison, avant tout envoi
→ Supprimez une surcharge pour revenir à la valeur par défaut de la définition
→ Voyez ce que cet environnement surcharge
→ Variables secrètes : Colvio affiche et modifie la référence Key Vault, jamais le secret
→ Export avec valeur par défaut, valeur courante et origine de la valeur effective

Données de démo dans la vidéo. Gratuit et open source.

Déjà piégé par une variable vide après un déploiement ? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #ALM

---

### Post 37 — Automation (`automation`, 72 s)

**EN**

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

**FR**

⚡ « Pourquoi ce champ a-t-il changé ? »

Avant d'ouvrir le Plugin Registration Tool, regardez tout ce qui est enregistré pour s'exécuter, sur un seul écran.

▶️ 72 secondes dans le module Automatisation de Colvio :

→ Chaque étape de plug-in : type de plug-in, message, table, étape, synchrone ou asynchrone, état, origine
→ Filtrez par assembly, table ou message en quelques secondes
→ Seulement les étapes désactivées : la première vérification quand « mon plug-in ne se déclenche pas »
→ Personnalisé, managé ou Microsoft (au mieux, d'après les préfixes d'éditeur et l'indicateur managé)
→ Les workflows classiques avec leurs déclencheurs, et un onglet par type de processus : flux cloud, règles métier, actions, BPF, dialogues, flux de bureau
→ Exportez ce qui est affiché pour l'audit

En lecture seule, donc sans risque à explorer en production. Données de démo dans la vidéo. Gratuit et open source.

Plug-ins ou flux : où vit l'essentiel de votre logique ? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #PowerAutomate

---

### Post 38 — Metadata (`metadata`, 83 s)

**EN**

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

**FR**

📚 Un dictionnaire de données en un clic.

▶️ 83 secondes dans le module Métadonnées de Colvio :

→ Les tables filtrées par catégorie, les tables Virtual et Elastic mises en évidence
→ Chaque colonne avec son libellé et son type, les obligatoires et les personnalisées signalées
→ Les valeurs d'un option set, une par une, exportables
→ Un clic sur un nom logique le copie, prêt pour le FetchXML, le code ou Power Automate
→ Exportez toutes les colonnes d'une table (nom logique, libellé, nom OData, type, obligatoire, personnalisé) ou toutes les valeurs d'option sets
→ Snapshot de schéma : exportez-le en JSON sur une org, chargez-le sur une autre, et voyez les tables et colonnes manquantes, les écarts de type et d'obligation

Données de démo dans la vidéo. Gratuit et open source.

Tenez-vous votre dictionnaire de données à jour ? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #DataModel

---

### Post 39 — Relationships (`relationships`, 59 s)

**EN**

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

**FR**

🔗 Votre modèle de données, clic après clic.

▶️ 59 secondes dans le module Relations de Colvio :

→ Choisissez une table : les parents en haut, les N:N au milieu, les enfants en bas, chaque bloc indiquant son lookup ou sa relation
→ Les liens système (propriétaire, devise, créé par) existent sur toutes les tables, donc ils démarrent masqués ; un clic les affiche, et vos propres lookups vers ces mêmes tables restent visibles
→ Cliquez une table liée : elle passe au centre, et vous parcourez le modèle de table en table
→ Depth 2 ajoute les relations des tables liées, plafonné à 30 tables pour rester lisible
→ ↻ vide le cache des métadonnées : une relation créée il y a quelques minutes apparaît

Données de démo dans la vidéo. Gratuit et open source.

Quelle table a le plus de relations dans votre org ? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #DataModel

---

### Post 40 — Users & Licenses (`licenses`, 64 s)

**EN**

🎫 Paid seats, disabled users, service accounts: the license picture in one list.

▶️ 64 seconds in Colvio's Users & Licenses module:

→ Every user with license (CAL) type and status, live counts of active and disabled accounts
→ One click for the disabled users, or the non-interactive accounts integrations use
→ Search by name, email or business unit; sort by license to group users on the same plan
→ Open a user: business unit, title, access mode, license, creation date, last login, security roles
→ Org-wide breakdowns per access mode and license type
→ Export the filtered list to CSV or Excel

Demo data in the video. Free and open source.

How many unused licenses would you bet your org is paying for? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #Licensing

**FR**

🎫 Licences payées, utilisateurs désactivés, comptes de service : l'état des licences en une liste.

▶️ 64 secondes dans le module Utilisateurs & licences de Colvio :

→ Chaque utilisateur avec son type de licence (CAL) et son statut, et le décompte en direct des comptes actifs et désactivés
→ Un clic pour les utilisateurs désactivés, ou les comptes non interactifs des intégrations
→ Recherche par nom, email ou business unit ; tri par licence pour regrouper ceux qui ont la même
→ Ouvrez un utilisateur : business unit, fonction, mode d'accès, licence, date de création, dernière connexion, rôles de sécurité
→ Répartition sur toute l'org par mode d'accès et par type de licence
→ Export de la liste filtrée en CSV ou Excel

Données de démo dans la vidéo. Gratuit et open source.

Combien de licences inutilisées parieriez-vous que votre org paie ? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #Licensing

---

### Post 41 — Translations (`translations`, 64 s)

**EN**

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

**FR**

🌍 Corriger un libellé dans quatre langues ne devrait pas prendre un après-midi.

▶️ 64 secondes dans le module Traductions de Colvio :

→ Chaque libellé de colonne d'une table, dans toutes les langues installées sur l'org, côte à côte
→ Masquez les langues inutiles (l'export suit)
→ Recherchez par nom logique ou par n'importe quel libellé, dans n'importe quelle langue
→ Tapez directement dans la grille : les cellules modifiées sont surlignées et comptées, Save les écrit et publie la table
→ Des modifications non enregistrées ? Changer de table demande d'abord confirmation
→ Ou l'aller-retour : export CSV, traduction dans Excel, réimport sous forme de modifications en attente

Données de démo dans la vidéo. Gratuit et open source.

Combien de langues dans votre org ? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #Localization

---

### Post 42 — Login History (`logins`, 53 s)

**EN**

🕐 Dataverse has no "logout" event.

It records user access at most once per user per interval (4 hours by default), through two channels: the app (audit action 64) and web services, meaning the API (action 65). Any "session duration" built from the audit is a guess.

▶️ 53 seconds in Colvio's Login History, showing what the audit really holds:

→ Find a user as you type
→ Access events, active days, latest and oldest, split between the app and web services
→ A day-by-day timeline with each event's exact time and channel
→ Load from the last 50 up to 500 events
→ Export to CSV or Excel

Demo data in the video. Free and open source.

Did you know Dataverse has no sign-out event? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #Audit

**FR**

🕐 Dataverse n'a pas d'événement de « déconnexion ».

Il enregistre les accès des utilisateurs au plus une fois par intervalle (4 heures par défaut), selon deux canaux : l'application (action d'audit 64) et les services web, c'est-à-dire l'API (action 65). Toute « durée de session » tirée de l'audit est une supposition.

▶️ 53 secondes dans l'historique de connexion de Colvio, qui montre ce que l'audit contient vraiment :

→ Trouvez un utilisateur au fil de la frappe
→ Événements d'accès, jours actifs, le plus récent et le plus ancien, répartis entre l'application et les services web
→ Une frise jour par jour avec l'heure exacte et le canal de chaque événement
→ De 50 à 500 derniers événements chargés
→ Export en CSV ou Excel

Données de démo dans la vidéo. Gratuit et open source.

Saviez-vous que Dataverse n'a pas d'événement de déconnexion ? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #Audit

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
