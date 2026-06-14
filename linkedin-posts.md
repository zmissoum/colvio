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
