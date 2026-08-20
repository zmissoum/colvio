# Changelog

## [1.11.148] — 2026-08-20
### Added — Explorer: duplicate finder on query results
- **⧉ Duplicates** button on the results toolbar (user's migration-QA need: "same date + same card + same amount = duplicate"). Pick the columns that define a duplicate — rows sharing the same values on ALL of them form a group. Analysis is client-side over **every loaded row** (a warning shows if more rows exist on the server), on **raw values**: lookups compare by GUID (two records sharing a display name never merge), money by number, text case-insensitively; a **"Compare dates by day"** toggle (on by default) makes 09:12 and 15:40 on the same date count as equal — the usual business rule. Rows whose every key column is empty are skipped instead of forming a bogus mega-group.
- Groups are listed biggest-first with per-row **KEEP/DELETE** verdicts (first of each group is kept). **"Select N duplicates"** feeds the excess rows into the normal selection — review checkboxes, then the existing bulk Update/Delete (with its $batch pipeline, ✕ Cancel and PROD confirm) does the rest. **"Export groups (CSV)"** produces the review/undo file: every duplicated row with its group number, verdict, and all columns.
- Honesty built in: the panel states the loaded-rows scope, reminds that rows sharing the key can still be legitimate twins (add a source-reference column when in doubt), and re-analysis is forced after a delete. Pure, unit-tested logic (`dupUtils.js`, 8 tests — incl. separator-collision and all-empty-key guards).

## [1.11.147] — 2026-08-07
### Added — Business Units: paste-a-list selection + member refresh
- **📋 Paste emails** (System Administrators) — paste a list of email addresses or UPNs (one per line, commas/semicolons/spaces, Outlook's `Name <email>` format all work) and every matching member of the displayed BU is **selected automatically**, ready for ➡ Move to BU. Born from a real provisioning run: moving a batch defined by an email list shouldn't mean clicking 200 checkboxes or hoping for a common filter pattern. The recap is honest by construction: "✅ 187 matched & selected · ⚠ 13 not found" **with the unmatched addresses listed** — those are your typos, not-yet-synced users, or members of another BU (fresh provisions land in the root BU). Matching is case-insensitive on **both email and UPN** (the member query now fetches `domainname` too); duplicates and email/UPN aliases of one user count once, never as "missing". Pure, unit-tested logic (`extractEmails` / `matchUsersByEmails`).
- **↻ Refresh** on the member panel (and on the empty state) — the member list is cached after first open, so users provisioned **after** the module was opened stayed invisible even when searched (the filter box is client-side; user hit exactly this mid-provisioning). The button drops the displayed BU's cache, refetches, and refreshes the count badges — no need to leave the module anymore.

## [1.11.146] — 2026-07-24
### Added — Explorer: one Cancel button for bulk update AND bulk delete
- While a bulk operation runs, a red **✕ Cancel** appears next to the action buttons (user request — one button serving both). Deletes stop **between chunks** (the in-flight chunk completes — there's no way to recall an HTTP $batch mid-flight); updates stop **before the next record**. Everything already written stays written, and the feedback says so honestly: "Cancelled — 1,240 deleted, 5,532 untouched".
- Bulk update also gained a **live counter** ("Updating 320/6,772…") — it had a mute spinner while the delete side already showed progress.

## [1.11.145] — 2026-07-24
### Fixed — Explorer bulk delete was sequential (tens of minutes on a few thousand rows)
- User report: deleting ~6,700 selected records from the results view crawled. The Explorer's bulk delete issued **one DELETE at a time, awaited each** — at typical Dataverse latency that's 20-45 minutes for that volume, while the Loader's DELETE mode had the fast machinery all along. The Explorer now **reuses the Loader's `$batch` pipeline**: chunks of 100 records × 4 parallel workers, one changeset per record (a failing row never rolls back its chunk), automatic 429 retry — typically **10-30× faster**. The Delete button shows live progress ("Deleting 1,200/6,772…").
- What still costs time is server-side and applies to any client: cascade deletes to child records, synchronous plug-ins/workflows firing per delete, audit writes. For very large purges with those, the Loader's DELETE mode adds the admin speed boosters (bypass custom logic) on top.

## [1.11.144] — 2026-07-24
### Added — Business Units: bulk move users to another BU (System Administrators)
- **Checkbox selection on the member list + "➡ Move to BU"** — re-parent many users in one pass (`PATCH systemuser.businessunitid`, low concurrency, per-user results; failures stay selected for a retry). The exact need: assigning a batch of users to the same BU without clicking through the admin UI one by one.
- **The roles truth is stated BEFORE confirming** — the classic Dataverse trap: on legacy behavior, changing a user's BU **removes every security role** (they lose access until re-assigned); modern orgs can retain roles via an org setting. Colvio reads `donotremoverolesonchangebusinessunit` and shows which applies (✅ kept / ⚠ removed with a pointer to Security Audit's bulk role assign / ℹ unknown on older schemas — verify on one user first). Owned-records note included: their owning BU is recalculated server-side, heavy owners take longer.
- Production confirmation; counts and member lists update locally after the move (target BU's cache invalidated). Server enforces write privileges on systemuser — Colvio grants nothing.

## [1.11.143] — 2026-07-24
### Changed — the panel opens right next to your D365 tab
- Clicking the Colvio icon used to append the panel at the far end of the tab strip (user request). It now opens **immediately to the right of the Dynamics tab** you clicked from — and if a panel tab already exists, it's **moved** next to the current D365 tab before being reused. `openerTabId` is set too: closing the panel returns focus to the D365 tab, and the panel joins the org tab's tab group when there is one.

## [1.11.142] — 2026-07-24
### Added — mapping step: the primary key is now visibly marked
- Epilogue of the Edm.Guid saga: the user had simply picked the wrong field — the PK's name was one character away from the business field they meant. Two selection-time guards so that near-miss can't happen silently again: the field picker **badges the primary key** ("🔑 PRIMARY KEY — Dataverse generates it") in the suggestion list, and choosing it shows an **inline warning under the input** — business numbers belong in a text/number field or the alternate-key match; watch for a similarly-named field. The PK is resolved from `IsPrimaryId` metadata (correct on activities too), and the v1.11.141 pre-flight remains the safety net before the run.

## [1.11.141] — 2026-07-24
### Added — Loader pre-flight: business values mapped onto a GUID field (incl. the primary key)
- Follow-up on the Edm.Guid report — the user's payload showed the REAL culprit wasn't a lookup: their business incident number was **mapped onto the table's primary-key column** (`fou_paymentincidentid`), a GUID Dataverse generates itself. The pre-flight now samples every mapped column that targets a `Uniqueidentifier` field and warns before the run — with a special, explicit message when the target **is the PK**: map the business number to a text/number field (or use it as the alternate-key match key) and unmap the primary key.
- Together with v1.11.140 (direct-bind lookups) both roads to "Cannot convert to Edm.Guid" are now caught before anything is sent.

## [1.11.140] — 2026-07-24
### Added — Loader pre-flight: non-GUID values in a direct-bind lookup
- User hit `Cannot convert the literal '3276711868' to the expected type 'Edm.Guid'` — a lookup in **direct (GUID) mode** fed with a business code. Direct mode ships the cell verbatim into `/entityset(<value>)`, so anything that isn't GUID-shaped fails every row with that unreadable message. The pre-flight now samples each direct-bind lookup column and warns **before the run** with an example value and the fix named: switch to "resolve" mode (or alt-key binding) matching on the business field. Complements the existing Salesforce-ID detection, which stays first when both would fire.

## [1.11.139] — 2026-07-24
### Fixed — Excel import could silently TRUNCATE decimals (display format ≠ cell value)
- User report right after v1.11.138: "same file, my decimals got stripped." Root cause was in the **Excel reader all along**: cells were read as their **formatted display text** (chosen to preserve leading zeros and displayed dates) — but an Excel display format like `0` or `# ##0` HIDES decimals, so a cell holding `123.45` displayed as `123` was parsed as `"123"`. Before v138 those rows died on the IEEE754 400, which masked the truncation; v138 made them pass — with the display value.
- **Hybrid cell reading now**: numeric cells take their **raw full-precision value**; text cells (where leading zeros live) and date cells (detected via `cellDates`) keep the display text — dates and account numbers behave exactly as before. A hidden-format cell (`;;;`) now honestly contributes its real value too.
- ⚠ If a run already wrote truncated numbers: reload the extension, reload the file and **re-run in delta mode** — the correct decimals now parse, delta updates exactly the fields that differ.

## [1.11.138] — 2026-07-24
### Fixed — Loader: the cryptic "IEEE754Compatible" 400 on numeric fields
- User report: `Cannot convert a value to target type 'Edm.Decimal' because of conflict between input format string/number and parameter 'IEEE754Compatible'`. Root cause: **without a transform, the raw CSV value — a string — was sent as-is**, and Dataverse requires Decimal/Money/Integer/Double as JSON **numbers** (and Boolean as JSON booleans). Even a clean-looking `"123.45"` in quotes is rejected.
- **Type-aware coercion at build time** (metadata-driven, pure `coerceForFieldType`, 4 tests — 217 total): clean values are converted to real numbers/booleans automatically in the run, the preview and the request log; **ambiguous ones fail the ROW with a readable reason** instead of the server's cryptic 400 — `"1,5"` could be 1.5 or 1500, that's exactly what the "Number (locale)" transform is for, and the error says so. Integers reject decimals by name; Booleans accept true/false, 1/0, yes/no.
- **New pre-flight check**: mapped columns targeting numeric/Boolean fields are scanned before the run (transforms mirrored) — "field X is Decimal but 214 values in column Y won't parse (e.g. \"1,5\")" with the fix named, before anything is sent.

## [1.11.137] — 2026-07-24
### Fixed — history restore looked "truncated" and 400'd (Explorer)
- User report: restoring a Builder query from the history opened the OData editor with `$filter=...` and executing gave Dataverse's cryptic *"Expression expected at position 0 in '…'"*. The `...` is **not truncation** — it's the privacy redaction (filter VALUES are never persisted in history, as advertised in the store listing) — but nothing said so. Now: **restoring a redacted entry explains it immediately** (placeholder, not truncation; replace or delete the clause; use Saved Queries for complete filters), and **Execute intercepts the placeholder client-side** with the same message instead of letting the 400 do the talking.
- Second real bug found on the way: history entries were capped at **200 characters at save time**, which could chop a long `$select` mid-token — a restored entry was then broken for a second, sneakier reason. Cap raised to 1000 (the dropdown display still shows 80).

## [1.11.136] — 2026-07-24
### Fixed — two more latent crashes of the "deltaSelect" class, found by sweeping the whole codebase
- After the v1.11.135 scope bug, the honest question was "are there others?" — answered with a tool, not a guess: **ESLint is now part of the project** (`npm run lint`), configured for real-bug rules only (`no-undef`, `no-dupe-keys`, `no-redeclare`, `no-unreachable`…, zero style noise). First full sweep found exactly two more:
  - **Automation**: the empty-state message referenced `managedFilter`, renamed to `sourceFilter` in the v1.11.106 three-way-source refactor — **the tab crashed whenever a filter emptied a category** (the one path that renders that message).
  - **System Jobs**: bulk Cancel/Resume called `confirmProd(orgInfo…)` but the sub-component never received `orgInfo` — **the buttons crashed on click** (and the production confirmation they were supposed to show never could). Prop now passed through.
- Everything else came back clean (the sweep also cleared stale/unused lint directives). The lint runs standalone via `npm run lint` — the "variable used outside its scope" class is now catchable before shipping instead of in your hands.

## [1.11.135] — 2026-07-24
### Fixed — Loader delta runs crashed with "deltaSelect is not defined"
- Scope bug (user-reported): `deltaSelect` was a `const` inside the existence-check `if` block, but the **null-clear no-op check** in the build loop (added in v1.11.114) reads it from OUTSIDE that block — a `const` is block-scoped, so the moment a **delta run** hit a `NULL` clear (or empty-as-null) on a mapped non-lookup column, the run died with a ReferenceError. Declaration hoisted next to `existCheck`; behavior unchanged otherwise. Affected only delta mode + null clears; plain delta runs and non-delta modes never touched that line.

## [1.11.134] — 2026-07-24
### Fixed — sidebar showed the raw "nav.apps" key instead of the Apps label
- The v1.11.127 locale edit inserted the Environment Variables keys using `"nav.apps"` as its anchor and silently **deleted that key from both locales** — the sidebar tab then displayed the literal key (user report/screenshot). Re-added `nav.apps` ("Apps" / "Applications").
### Added — i18n coverage test (so this whole bug class dies)
- New test file scans the source for every key referenced as a string literal (`t("…")`, HelpTab's `titleKey`/`bodyKey`) and asserts each exists in **both** locales, plus a key-for-key **symmetry check** between en and fr — **3 new tests (213 total)**. It fails the build the next time an anchored edit eats a key.

## [1.11.133] — 2026-07-24
### Fixed — Business Units: user counts no longer show 0 on large orgs
- The per-BU count badge came from ONE grouped-aggregate query that silently hits Dataverse's ~50k-scanned-rows aggregate limit on large orgs — every BU then showed **0 users until you clicked it** (user report). The action now **falls back to a paged scan of just the BU column** when the aggregate fails: exact counts at load, whatever the user volume (a 5,000-user page costs one request).
### Added — Business Units: on/off filter
- **All / Active / Off chips** above the BU tree (with counts): filter the list to enabled or disabled business units. Like search, an active filter switches to a flat list — a matching child's parent may be filtered out, so indentation would lie. The header shows "X of N BUs".

## [1.11.132] — 2026-07-24
### Changed — BU org chart: folds by default (user report: 1,177 BUs = an endless scrollbar)
- **The chart now opens folded to two levels** (roots + their direct children) — a 1,000+-BU org laid flat is hundreds of thousands of pixels wide, which made the scrollbar useless. Every BU with children carries a **±N chip**: "+12" tells how many child BUs are hidden, one click unfolds that branch, "−" folds it back. Only unfolded branches are laid out.
- Toolbar additions: **Fit** (zoom so the whole current chart fits the window width), **Expand all** (with a "can get VERY wide" warning in the tooltip) / **Collapse all**, and **hide disabled** (removes disabled BUs and everything beneath them — the "Dump"/archive branches stop eating space). The header counts "showing X of N BUs", and the PNG export captures what's currently unfolded.
- `visibleBuList()` added to the pure layout utils — **3 new tests (210 total)**: one-level-at-a-time reveal, child counts computed on the full hierarchy so collapsed chips badge what they hide, expanding a hidden node is inert until its ancestors are expanded.

## [1.11.131] — 2026-07-24
### Added — Business Units: full-screen org chart
- **🌳 Org chart** button in the Business Units module: the hierarchy as an actual **organigram** — boxes and elbow connectors, tidy top-down layout (each parent centered over its subtree), user count per BU, disabled BUs dashed, the currently selected BU highlighted. Zoom −/+, **click a box to open that BU** (drops you on its member list), and **PNG export** (2× resolution) for documentation and slide decks.
- Layout is pure and unit-tested (`src/buTreeUtils.js`, **4 new tests — 207 total**): parents centered over children, no sibling overlap, orphaned BUs (invisible parent) laid as roots, and **cyclic hierarchies survive as fallback roots** instead of disappearing or hanging — same defensive stance as the Adoption subtree filter.

## [1.11.130] — 2026-07-24
### Changed — Adoption: failed days now say WHY, and retention is explained up front
- **Failed-day banner carries the reasons** (user report: a since-January window showed "96 days failed to load" with no way to know why — the per-day error was swallowed). The scan now records each failed day's error message and the banner shows the distinct reasons — retention, timeout, privilege, throttling… each points to a different fix, so hiding them made the banner undiagnosable.
- **Proactive retention banner**: Colvio now reads the org's audit retention (`auditretentionperiodv2`, with a fallback for older schemas) and, when the window starts before `now − retention`, says it plainly — days before that date have **no data by design** (purged, shown as zero, NOT failures), users active only before it will appear as "never signed in", and covering the window would need retention ≥ N days. A wider window cannot conjure purged audit rows back.

## [1.11.129] — 2026-07-24
### Added — Adoption: BU filter can include the whole subtree
- **"+ child BUs" checkbox** next to the business-unit filter: widens the scope from the selected BU alone to **the BU plus every descendant** (BFS over the org hierarchy, cycle-safe), with the resulting BU count shown. Pick a region-level parent and see all its teams at once.
- **Parent BUs are now selectable even with no direct users** — the BU dropdown is built from the real `businessunit` hierarchy (one cheap query, loaded once) instead of only the BUs that happen to appear on user records; without this, filtering on "Europe" whose users all sit in sub-BUs was impossible.
- The subtree scope flows through everything: KPIs, engagement metrics, charts, never-signed-in, service accounts, previous-period compare and the PPTX report (scope label says "+ child BUs"). **2 new tests (203 total)** including the cyclic-hierarchy guard.

## [1.11.128] — 2026-07-24
### Added — Adoption: one-click PowerPoint report
- **📊 Report (.pptx)** — a 5-slide management deck built from the data on screen, honoring the active window and role/BU filters: (1) title with org, window and scope; (2) KPI grid (access events, distinct users, DAU/WAU/MAU, stickiness, never-signed-in) **with the honesty note on the slide** — the ≤1-event-per-interval proxy caveat travels with the numbers into the meeting; (3) activity trend; (4) weekday profile + per-BU adoption rates (top 15, remainder noted); (5) findings — never-signed-in **split by license type**, inactivity ≥30/60/90 (only thresholds the window can assert), and silent service accounts.
- **Charts are NATIVE PowerPoint charts, not images** — the recipient can restyle, retitle and edit the data (pptxgenjs, MIT). The ~370 KB library is **dynamic-imported on click**, same pattern as the lazy xlsx chunk — zero cost until used. Excel-with-charts was evaluated and honestly declined: SheetJS Community can't create charts (Pro feature) and hand-writing OOXML chart parts isn't worth the fragility.
- Pure `buildReportModel()` separated from the renderer — **4 new tests (201 total)**: honesty hint present, license split sorted, inactivity thresholds gated by window length, BU top-15 cap counted.

## [1.11.127] — 2026-07-24
### Added — NEW module: Environment Variables (19th)
- **Definition default + per-environment override, side by side** for every environment variable, with type badges (String, Number, Boolean, JSON, Data source, Secret) and managed/unmanaged. The headline is the **⚠ NO VALUE filter and banner**: a variable with neither override nor default reads as an empty string in flows and plug-ins — they fail three screens later and nobody thinks to check here. The classic post-deployment trap, now impossible to miss.
- **Typed editing of the override** (`environmentvariablevalue` PATCH, or POST bound to the definition when none exists): Booleans get a yes/no picker (the documented string convention), JSON and Data-source values are parsed before save, numbers checked; empty input is rejected with a pointer to **Clear override** (DELETE → falls back to the default). Production asks for confirmation; the server still enforces customizer rights.
- **Honesty notes in the editor**: overriding a MANAGED definition is the normal per-environment pattern (your override lives in the unmanaged layer, the modal says so); **Secret** variables hold a Key Vault *reference* path, never the secret itself — Colvio shows and edits the reference only.
- Search, filters (All / No value / Overridden / Secrets), copy current value, CSV/Excel export with each variable's effective source (override / default / none). Pure logic in `src/envVarUtils.js` — **5 new tests (197 total)**. Gated like Solutions (customizer read).

## [1.11.126] — 2026-07-24
### Added — Adoption: dedicated Service & application accounts section
- **Their own card, always visible** whatever the human-metrics toggle: every enabled Non-Interactive / Support / Delegated Admin / **Application (S2S)** account with its **access-event count, active days and last access** over the window, plus CSV/Excel export. How they're told apart: `accessmode` 3/4/5 on systemuser, and `applicationid` set = S2S application user (the label "Application (S2S)" wins over its accessmode).
- API access IS audited under the same ≤1-event-per-interval rule, so the counts are comparable — and a service account at **zero events is highlighted**: an integration that silently stopped calling is as much a finding as one that hammers the API.

## [1.11.125] — 2026-07-22
### Changed — Adoption: honest numbers (accuracy pack)
- **"Total logins" → "Access events"**, because that's what it is: Dataverse logs a user's access AT MOST once per `UserAccessAuditingInterval` (**default 4 h** — doc-verified; the KPI hint shows the org's actual value, now read from `organizations`). A stable activity proxy, not literal logins or clicks. Trends and comparisons stay valid; the wording stops overselling.
- **Service accounts excluded from every number by default** — Non-Interactive (accessmode 4), Support (3), Delegated Admin (5) and S2S application users (`applicationid` set, now returned by getAllUsers): they never sign in interactively BY DESIGN, so they were false positives in the never-signed-in list and noise in the denominators. A checkbox on the never-signed-in card re-includes them; the card now stays visible at zero (the toggle must remain reachable) and the scope KPI counts ENABLED users only.
### Added — Adoption: engagement metrics, per-BU rates, inactivity, previous-period compare
- **DAU (avg, quiet days count as zero) / WAU / MAU / stickiness (DAU÷MAU)** — WAU/MAU hidden on windows shorter than 7/30 days rather than shown misleadingly.
- **Access events by weekday** (Monday-first profile) and **adoption rate per business unit** (active ÷ enabled, role filter applied, BU filter deliberately ignored — it IS the BU dimension; CSV export).
- **"⇄ vs previous period"** — lazily loads the preceding window of the same length (on demand: it doubles the scan cost) and shows ▲▼ deltas on access events and distinct users, with a retention-truncation caveat; invalidated by any window/filter change.
- **Per-user table gets an "All in scope" mode** — license type + inactivity column: days since last access, honest `>N d` when there was no access in the loaded window, and an inactive ≥30/60/90 filter that only enables when the window covers the threshold. The filtered view exports on purpose ("everyone inactive ≥60 days" IS the deliverable: user, email, BU, license, events, days, last access, inactive days).
- Pure metrics logic in `src/adoptionUtils.js` — **7 new tests (191 total)**. Help EN/FR rewritten around what the numbers actually mean.

## [1.11.124] — 2026-07-22
### Added — Adoption: export the never-signed-in list
- **CSV/Excel buttons on the "Never signed in" card** — the full list (not just the 300 chips shown), with `user, email, businessUnit, licenseType, userId`. The license type is included on purpose: paid seats that never log in ARE the finding, whether for license cleanup or onboarding follow-up. Fixes the misleading "+N more (export for all)" hint, which pointed at the main export — that one only ever contained users WITH logins.

## [1.11.123] — 2026-07-22
### Added — Solution Explorer: CROSS-ORG compare (DEV vs PROD drift)
- **"Compare file"** downloads the selected solution's component list as a versioned .json (`colvio-solution-components@1`: org, date, solution descriptor, components). On the **other org**, select the counterpart solution and **"Load file"** — the same three-bucket diff (Only here / In both / Only there), with the source org and export date shown, and a **version-drift note** when it's the same solution on both sides.
- **Two-pass matching, explained on screen**: GUIDs first — solution-transported components (forms, views, workflows, web resources…) keep their id across orgs; then **type + resolved name** for metadata components whose `MetadataId` is org-local — matched ONLY when unambiguous on both sides (two forms named "Information" on different tables must not cross-match; if they were the same form, the GUID pass would have caught them). The banner reports how many matched by which pass, warns that different base languages can create false name differences, and counts unnamed components that couldn't be matched at all.
- Malformed or foreign .json files are rejected with a readable error; the export mirrors the intra-org diff format. Pure logic extended in `solutionCompareUtils.js` — **6 new tests (184 total)**: GUID-match despite renamed labels, name-match across differing MetadataIds, ambiguity refusal, unnamed flagging, file round-trip, bad-file rejection.

## [1.11.122] — 2026-07-22
### Added — Solution Explorer: compare two solutions (same org)
- **"⇄ Compare with…"** next to a selected solution's export buttons: pick any other solution of the org and get the component diff — **Only in A / In both / Only in B** — with count tiles, per-type grouping (resolved labels, not GUIDs), and a full **CSV/Excel export** (`presence, componentType, name, objectId`).
- **The overlap is the point**: when BOTH solutions are unmanaged and share components, a warning names the classic layering conflict — whoever publishes last wins, and "my change vanished" starts there.
- Honest scope stated in Help: **same-org comparison of component MEMBERSHIP** — it says nothing about content differences between two versions of the same form (that's solution-zip parsing, a different beast). Matching is (type, objectId) with case-insensitive GUIDs, duplicates collapsed, and the name taken from whichever side resolved one. Display capped at 200 rows per group (the export has everything); switching side A clears side B (stale-compare guard); pure logic in `src/solutionCompareUtils.js` — **6 new tests (178 total)**.

## [1.11.121] — 2026-07-22
### Added — System Ops: Cloud Flow Runs tab
- **The Power Automate run history, inside Colvio** — a third System Ops panel reading the `flowrun` table Dataverse keeps org-side for SOLUTION cloud flows (~28-day retention, backed by the flow service): flow name, status badge (Succeeded / **Failed** / Cancelled / Running), start/end, duration, trigger type and the error message on failures. Status filter (the "exceptions view" for flows), date range (default: last 7 days), name search, Load more pagination, CSV/Excel export.
- **Honest limits, stated in the UI**: flows outside a solution ("My flows") never write to Dataverse — their history only exists in make.powerautomate.com; orgs without the table get a clear message instead of a raw 404; and if the provider-backed table rejects server-side filters, Colvio falls back to a bare fetch and says the filters now apply client-side to the loaded rows only.
### Changed — Plugin Traces: quick time windows instead of a date range
- The platform purges plug-in traces after ~24 h, so a calendar date-range picker was pointless (any past date returned nothing — user-reported). Replaced with **quick windows**: everything retained (~24 h) / last 15 min / last hour / last 6 h — still filtered server-side. System Jobs keeps its real date range (jobs live longer).

## [1.11.120] — 2026-07-21
### Added — API Tester: download the response
- **⬇ Download button next to Copy** in the response panel: saves the body as a file — pretty-printed **.json** when the response parsed as JSON, raw **.txt** otherwise. Filename is derived from the request path's last segment (entity set or function name) + date&time, e.g. `api_accounts_20260721_143012.json`, so a metadata dump like `StatusAttributeMetadata?$expand=OptionSet` lands as a sensibly named file instead of a 20 KB clipboard paste.

## [1.11.119] — 2026-07-21
### Added — Apps: view inspector + form subgrids ("why doesn't my record show in that list?")
- **View inspector**: every view in the Apps module is now clickable → its FetchXML **filters decoded to plain language** (field display name + logical name, operator label, value, nested AND/OR groups, conditions targeting linked tables) and its **columns** from layoutxml (display names, hover for logical + width), plus sort order and the raw FetchXML. Linked tables show their join and a warning when it's an **inner join — rows without a match are hidden**, one of the sneaky reasons a record vanishes from a list. A filterless view says so explicitly.
- **Form subgrids**: a ⊞ button on every form lazily parses its `formxml` and lists each child grid — caption, target table, **the view it renders** (resolved by ViewId), the relationship linking child rows to the open record, and a VIEW PICKER badge when users can switch views (so what they see may not be the default). Subgrids pointing at a **personal view** (`userquery`) or a deleted view can't be inspected — the inspector says so honestly instead of erroring cryptically.
- **Open in Explorer**: one click loads the view's FetchXML into the Explorer's FetchXML mode (new lightweight handoff: one-shot slot + window event; app.jsx switches the tab, the active query tab consumes — Explorer stays mounted so there is no race). Add a filter on your parent record and see exactly why a row matches or not.
- Under the hood: new pure `src/viewInspectorUtils.js` (minimal dependency-free XML parser — DOMParser doesn't exist in the node test env — + FetchXML filter-tree/layout/subgrid extractors, ~40 operator labels incl. the `last-x-days` family; unknown operators pass through raw rather than being hidden). 2 new read-only content.js actions: `getViewDetail` (savedquery fetchxml+layoutxml), `getFormXml`. **10 new tests (172 total)**, including the parser regression where a spaced self-closing tag (`<x a="1" />`) used to flatten the whole filter tree.

## [1.11.118] — 2026-07-21
### Added — NEW module: Apps (model-driven app inventory)
- **What each model-driven app actually exposes**, read straight from the runtime tables (`appmodule`, `appmodulecomponent`, `systemform`, `savedquery`, `appaction`): its tables, and per table its forms and views, each badged **EXPLICIT** (hand-picked in the app designer) or **IMPLICIT** (surfaced automatically).
- **The invisible include-all flag, made visible.** When a maker leaves "All forms" / "All views" checked, Dataverse creates NO component rows and stores NO flag saying so — Colvio infers it from the absence of explicit form (or view) components for a registered table, **independently for forms and views**, and badges the table ALL FORMS / ALL VIEWS. That badge means every form/view of the table — current **and future** — surfaces in the app, a fact you cannot see anywhere in the maker portal. The tooltip explains the inference honestly.
- **Modern command-bar buttons** (appaction) classified by their three scopes: app-specific (EXPLICIT, one app), entity-global (IMPLICIT in every app exposing that table), table-generic templates (IMPLICIT everywhere). Classic RibbonDiffXml customizations are out of scope and the UI says so. Orgs without the appaction table simply show no commands section.
- **Reverse search** — type a form/view/button name and see which apps expose it, with the explicit/implicit reason: the impact map to check before editing a shared component.
- **On-demand dependency analysis** per app: walks the `dependencies` entity to list the attributes and option sets the app's in-scope forms/views actually drag in (attribute names resolved via metadata `MetadataId`; capped at 200k edges with an honest truncation banner on very large orgs).
- CSV/Excel export of the flat inventory (selected app or all apps). Apps with blank display names (internal placeholders) are hidden. Read-only module, visible to all users — it reads the same runtime tables every app user already reads. Logic is pure and unit-tested (8 new tests, 162 total); `getFields` now returns each attribute's `MetadataId` (fields cache key bumped).

## [1.11.117] — 2026-07-21
### Added — Translation Manager: solution-wide translations (forms, views, sitemap…)
- **Export / import a solution's full translation file via Microsoft's official mechanism** (`ExportTranslation` / `ImportTranslation` Web API actions, signatures verified against the docs). One zip covers everything Dataverse deems localizable: **form tabs, sections and label overrides, views, charts, dashboards, sitemap, option sets, custom ribbon LocLabels** — the elements the per-field editor can't reach. Flow: pick a solution → download `CrmTranslations_<name>.zip` → edit in Excel → import it back.
- **Colvio never parses the XML** — it transports the file and Dataverse does the work, so nothing can be corrupted in transit. Import runs as a tracked job (progress shown live, also visible in System Ops), with an optional publish-all on completion (default on), production confirmation, and hidden entirely for users without publish rights.

## [1.11.116] — 2026-07-20
### Added — Loader: option-set labels match in EVERY provisioned language
- **The picklist/statecode transform now resolves labels in all the org's languages**, not just the connected user's. A French org loading an English export (or vice versa) no longer reports "Inactive customer" as an unmatched label when the user's UI language is French — every `LocalizedLabel` of every option is matched (zero extra queries: the labels were already in the metadata response). On the rare cross-language collision (the same text meaning different values), the user's language wins. Option-set cache key bumped so fresh metadata loads immediately.

## [1.11.115] — 2026-07-20
### Changed
- **Empty-cell contract confirmed after researching the ecosystem** (Salesforce Inspector's source clears on empty via `fieldsToNull`; Salesforce Data Loader and the Import Wizard ignore empties by default): Colvio keeps the protective default — empty leaves the field untouched, the per-run checkbox inverts it. The checkbox tooltip now names both worlds ("same default as Salesforce Data Loader" / "matches Salesforce Inspector's import behavior") so migrating users find their habits immediately.

## [1.11.114] — 2026-07-19
### Added — Loader: opt-in "Empty cells CLEAR fields"
- **A per-run checkbox inverts the empty-cell contract**: with it ON, every empty cell in a mapped column — lookups included — sends an explicit `null` and CLEARS the field on the matched record (lookups via the bare nav property, the documented disassociate). The default stays OFF: empty leaves the field untouched, only the literal `NULL` clears — a partial file must never wipe data by accident.
- **Guardrails**: a red warning card while the option is on, plus a pre-flight check that counts exactly how many cells will clear ("Empty-as-NULL is ON: 12,431 empty cells will CLEAR the corresponding field…"). The option takes precedence over a lookup's "empty → error" fallback. Never persisted — off again on every new import.
- **Delta-aware**: a null clear on a mapped column whose org value is already empty is recognized as a no-op and dropped (Dataverse omits null columns from responses — absence from the delta fetch means already-null), so repeat runs converge to full skips. Lookup clears are always sent (their current value isn't fetched). Preview and per-row request log mirror the run exactly.

## [1.11.113] — 2026-07-19
### Fixed
- **Auto-resume no longer looks like a restart-from-scratch.** On a chained pass the progress bar resets to 0/REMAINDER (it counts only the rows being re-sent), which read as "my well-advanced load started over" (user-reported). A persistent banner now sits above the bar during every auto-resume pass: "🔁 Auto-resume pass 2/3 — re-sending ONLY the unsent / transient rows · N records already succeeded and are kept. The bar below counts this pass only; final totals are cumulative."

## [1.11.112] — 2026-07-19
### Added — Loader: auto-resume after a chunk timeout
- **A chunk-timeout stop no longer parks 200k rows behind a Retry click.** When a chunk hits the 600s timeout (org too slow for the batch size), the run now automatically chains the same retry pass the Retry button would run — unsent + transient rows only, at reduced settings (half the threads, chunks ≤50) — up to **3 chained passes**, with cumulative totals and the live progress announcing "Chunk timeout — auto-resuming pass 2/3…". The mechanics are the field-tested manual retry (96% of a 243k run recovered).
- Guardrails: clicking **Cancel always stops for real** (a user cancel never auto-resumes); after 3 passes the run stops with the usual honest accounting and Retry card; a manual Retry click restarts the budget. Opt-out checkbox in the Performance card (default on). Works in CREATE/UPSERT/UPDATE and DELETE modes.

## [1.11.111] — 2026-07-19
### Changed
- **The run-stopped log marker now says WHY.** "Import cancelled — N records not sent" was written for both a user cancel and an automatic chunk-timeout stop — misleading when nobody cancelled anything. The row-0 marker now reads "Cancelled by user — …" or "Stopped early — a chunk hit the timeout (org too slow for this batch size) — …", and both note that every unsent record was recorded as retryable.

## [1.11.110] — 2026-07-18
### Changed — scale-safety hardening after the 308k post-mortem
- **`flushNeverSent` moved to loaderUtils and locked by a 300k-row regression test** (survives without throwing, ≤5,000-row UI slices that re-assemble the exact remainder, rows classified retryable, a throwing UI callback can't kill the accounting). 154 tests.
- **Two sibling argument-spread bombs defused in the SQL mode's client-side aggregation**: `Math.min(...vals)` / `Math.max(...vals)` on per-group values → `reduce` (a GROUP BY with a >100k-value group would have thrown the same RangeError).

## [1.11.109] — 2026-07-18
### Changed
- **Download Log: the Summary block is now recomputed from the per-row log it sits under**, instead of copying the result screen's counters — a summary must describe the lines above it, and the log is the source of truth (the 1.11.108 crash had exported "Updated: 0 / Errors: 1" on top of 20,800 real rows). It now reports rows logged, Created / Updated-Upserted / Errors counted from the log, Skipped (prep), and — when file rows never reached the log at all — an explicit "UNACCOUNTED" line with the count.

## [1.11.108] — 2026-07-18
### Fixed — Loader: the honest-accounting flush could crash on very large aborted runs
- **A 308k-row UPDATE that hit a chunk timeout at ~20k rows produced an incoherent result screen** (tiles said 0 updated / 1 error while the log held 2,558 successes and 2,790 failures, and 288k rows went unaccounted). Root cause: when a timeout stops the run, the v1.11.85 safety net records every never-sent row as a retryable error — but it did so with `push(...arr)`, and JavaScript's argument limit (~100k) makes that throw `RangeError` when the remainder is large. The exception killed the whole batch promise AFTER the workers finished, so the totals never got assembled.
- Fixed with loop-pushes and slice-by-5,000 delivery to the UI (plus a fence so a UI callback failure can never kill the accounting again). A timed-out big run now ends with true totals — sent, failed, and "aborted before send" rows that the Retry button can resume.

## [1.11.107] — 2026-07-17
### Changed
- **Explorer: the default SELECT now starts with the entity's primary key** (accountid, fou_vesselid…) instead of including statecode. The id column is found via the metadata's `IsPrimaryId` marker — the reliable way: the `<entity>id` naming heuristic breaks on activity tables, whose PK is `activityid` (heuristic kept as fallback while a pre-update field cache expires). getFields now exposes `isPrimaryId`; field cache key bumped so fresh metadata loads immediately.

## [1.11.106] — 2026-07-16
### Fixed — Automation: honest source classification (user-reported: "Custom only" showed msdyn_ steps)
- **"Custom only" was equating unmanaged with yours — wrong on both counts.** Dataverse doesn't stamp authorship, and the platform registers thousands of ITS OWN steps unmanaged (the `Microsoft.Crm.ObjectModel.*` flood). The filter is now a three-way SOURCE call: **Microsoft** (publisher-prefix heuristic — `Microsoft.*` assemblies, msdyn-family names — applied BEFORE the managed flag), **Managed** (installed from a managed solution: an ISV's or your own), **Custom** (unmanaged). The Source badge explains the heuristic on hover; exports carry both `source` and the raw `managedFlag`.
- **Internal steps hidden by default.** Stage 30 (MainOperation) and other non-10/20/40 stages are the platform's own execution machinery (workflow runners, Custom API handlers) — the Plugin Registration Tool hides them too. A toggle shows them ("internal steps (+94,551)"); the tab count now counts real registrations, not the machinery.

## [1.11.105] — 2026-07-16
### Added
- **Solution Explorer: export a solution's components to CSV/Excel.** One row per component with its resolved type label (Entity, Web Resource, Security Role…), name and objectId — the "what exactly ships in this solution" deliverable for deployment reviews. Buttons appear next to the solution header once components are loaded; filename carries the solution's unique name.

## [1.11.104] — 2026-07-16
### Added — New module: Automation (plug-ins & processes inventory)
- **The static inventory of everything registered to run in the org** — the design-time counterpart to System Ops' runtime jobs. Two sources, eight category tabs with counts: **Plug-in steps** (which class runs on which message/entity, Pre-validation/Pre-operation/Post-operation stage, Sync/Async, Enabled/Disabled, rank, filtering attributes on hover, assembly) and every process definition from the workflow table — **Workflows** (Background/Real-time mode + Create/Update/Delete triggers), **Cloud flows** (Power Automate), **Business rules**, **Actions**, **BPFs**, **Dialogs**, **Desktop flows**.
- Filter by state (enabled/activated vs disabled/draft), custom vs managed, and free text (name, entity, message, assembly, owner); CSV/Excel export of any view. Empty categories stay visible with (0) — "we have zero desktop flows" is also an answer.
- Sits in the DEVELOP section, gated like Solutions (`canReadSolutions`). Help card EN/FR.
### Added
- **Solution Explorer: All / Unmanaged / Managed filter chips with counts** + a total line following the filter and search — same treatment as the Metadata Browser got in 1.11.103.

## [1.11.103] — 2026-07-16
### Added
- **Metadata Browser: entity counts.** The All / Standard / Custom filter buttons now show how many tables each holds, and a total line under them follows the active filter and search ("214 entities (Custom)", "3 entities matching").

## [1.11.102] — 2026-07-16
### Added — Virtual / Elastic table badges
- **Virtual and Elastic tables are now labeled** in the Data Explorer entity list, the Loader's target-entity picker and the Metadata Browser (`TableType` from the entity metadata — zero extra queries; graceful fallback on orgs whose schema doesn't expose it). Hover the badge for the limitations: Virtual = external data behind a data provider (writes and filter operators depend on the provider, no audit history, no recycle bin); Elastic = Cosmos-backed (500-row max pages, limited joins/aggregates — the audit-table gotcha).
- **Loader warns when the target is a Virtual table** — most are read-only, so an import would fail row by row with the provider's error; the banner says so before you build the mapping.

## [1.11.101] — 2026-07-16
### Fixed
- **Loader: DELETE mode now offers the retry card too.** The "Retry N transient errors / Retry all failed" buttons (v1.11.52) only existed for CREATE/UPSERT/UPDATE — a delete run ending with 136 timeout errors offered nothing but "New import". Deletes now get the same treatment: retry only the failed rows (transient by default), at gentler concurrency (half the threads, chunks ≤50 — a cascade-heavy or throttled org is exactly why the first pass timed out), with cumulative totals ("Retry: X of Y succeeded"), preserved log, and honest error re-derivation.

## [1.11.100] — 2026-07-16
### Fixed
- **Explorer: clicking a "Recent queries" entry now actually restores it.** Builder-mode entries did nothing at all (history stores the emitted query string, not the Builder's visual state, and the handler only switched the mode tab); SQL entries did nothing; OData entries pasted the text without selecting the table. A click now selects the entry's table, then reopens the recorded query in the right editor — Builder entries open in the raw-OData editor where the query is visible, editable and runnable. Note shown by design: `$filter` VALUES are redacted at save time (privacy), so the `$filter=...` placeholder stays for you to complete. If the entry's table no longer exists on the org, an explicit message says so.

## [1.11.99] — 2026-07-15
### Docs
- **README fully refreshed** (was stale since 1.11.41): Adoption module, Builder relational filters, inline field edit + BPF manager under Show All Data, Security Audit matrix/org-wide/Teams/bulk-assign, Loader NULL token / strip HTML / date toggle / migration mode / pre-flight checks / honest accounting, corrected bypass-header names (the old text still listed the non-existent `BypassSynchronousLogic`), sidebar sections, updated stats (16 modules, ~15.3k LOC, 62 actions, 35 components, 151 tests) and the slimmed MV3 permissions.
- **Store listing**: added relational filters to the Data Explorer section and exact server-side aggregation to the Adoption section.
- **What's New popup** rewritten for the 1.11.67 → 1.11.99 arc (8 highlights EN/FR: Adoption, relational filters, org-wide privileges, BPF, inline edit, Loader NULL/strip-HTML/migration, loader honesty + real bypass headers, sidebar sections).

## [1.11.98] — 2026-07-15
### Changed — sidebar reorganized into three sections
- **Tabs are now grouped by role, with small section captions.** DATA (Data Explorer, Data Loader, Recycle Bin, Show All Data — query → load → restore → inspect, side by side at last), DEVELOP (API Tester, Metadata, Relationships, Schema, Solutions, Translations), ADMIN (Users & Licenses, Business Units, Security Audit, Adoption, Login History, System Ops). Help stays at the bottom.
- Captions follow permissions: a group whose tabs are all hidden for the current user disappears entirely — non-admins simply don't see an ADMIN section. Nothing else changes (palette, permissions, redirects, per-tab state).

## [1.11.97] — 2026-07-10
### Fixed — pre-upload review pass (3 agents: Dataverse docs, Builder OData, Chrome MV3)
- **Adoption: weekly chart no longer drops the final days of the window.** Over 92 days the chart buckets weekly, but the timeline was stepped 7 days from the window start — when the window didn't start on a Monday, the last week's label was never generated and up to 6 trailing days silently vanished from the chart (KPIs were right, chart wasn't). Labels now step Monday-to-Monday through the last week.
- **Adoption: the aggregate truncation guard could never fire on its row-count check.** Elastic tables clamp page size to a 500 MAXIMUM, so the `count="5000"` request comes back with at most 500 groups and the `>= 5000` check was dead code; threshold corrected to 500. Busy days (500+ distinct users) now reliably take the exact scan path.
- **Explorer: saved-query/template restore can no longer leak onto the wrong entity.** Two staleness holes: the restore callback survived an entity switch (load query A, click entity B before A's fields resolve → A's whole config applied to B), and the relational-filters re-fetch had no generation guard (same race → stale filters → guaranteed 400). `selEnt` now clears any pending callback; the rel-filters restore checks the selection generation.
- **Explorer: schema-drift guard on relational filters.** A saved condition whose field no longer exists on the target entity used to lose its navigation prefix and silently filter the ROOT entity's same-named column (`statecode`, `name`…). Dropped instead — and if ALL of a child-filter's conditions drop, the whole filter is skipped rather than degrading to a meaning-changing bare `any()`.
- **Explorer: double-click on a relation can't add duplicate cards anymore** (REL and EXPAND both).
- **Chrome: the icon now grays out on non-D365 tabs.** `chrome.action.disable()` was never called, so the declarativeContent rules were a no-op and the permission had no observable use (a classic store-review flag). Manifest slimmed: `activeTab` removed (unused — injection targets are covered by host permissions), the 21 redundant `*.crmN.dynamics.com` entries collapsed into `https://*.dynamics.com/*` (3 host permissions total), `minimum_chrome_version` raised to 110 (aligns with the service-worker lifetime our 600s long-ops rely on).
- **Hardening: `validateEntitySet` rejects control characters** — the entity-set name is interpolated into raw `$batch` request lines; key values were already CR/LF-stripped, the set name no longer is the one gap.

## [1.11.96] — 2026-07-10
### Fixed — Adoption: distinct users no longer flat-line at 500 (elastic-table paging)
- **The per-day aggregate was silently truncated at 500 users.** The audit table is an ELASTIC table, and elastic tables page results at 500 rows by default (standard tables: 5,000) — busy days showed exactly 500 distinct users and undercounted totals. The aggregate now requests a 5,000-row page (`count="5000"`), adds the `<order>` element the aggregate spec expects, and — belt and braces — treats ANY continuation signal (paging cookie, nextLink, morerecords, or a full page) as truncation and switches that day to the exact paged raw scan instead of trusting a partial aggregate.
- Fallback logic inverted for safety: only auth/session errors surface as a failed day; any other aggregate hiccup (50k limit, elastic quirks) silently takes the exact scan path.

## [1.11.95] — 2026-07-10
### Changed — Adoption: exact totals on any audit volume (no more 100k cap)
- **The login scan is now aggregated SERVER-SIDE, per day.** Instead of downloading every login event (capped at 100k — orgs with heavy traffic hit it in days), Colvio asks Dataverse for a per-user aggregate (count + last login) of each UTC day via FetchXML `aggregate` — the audit table supports it, and slicing by day keeps every query under Dataverse's 50,000-row aggregate limit (Microsoft's documented workaround: filter by date range, run multiple queries, combine). 30 days = 30 fast queries returning ~active-users rows each, whatever the volume.
- **Fallback for extreme days:** a single day exceeding 50k logins falls back to a paged raw scan of just that day, aggregated inside the content script — raw events never cross the extension bridge in either path.
- **Result: KPIs, chart and per-user table are exact** — the "Result capped" warning is gone. A day whose query fails is reported in a red banner ("N days failed — totals EXCLUDE them") with a Retry button, never silently missing. Scan progress shows as "day 12/30".
- Demo mode mirrors the new shape; Help EN/FR updated.

## [1.11.94] — 2026-07-09
### Added — Builder: relational filters (Advanced-Find style)
- **New REL row in the Builder: filter the ROOT rows by their related records** — the thing D365 views/Advanced Find do that the Builder couldn't. Two flavors:
  - **Condition on a parent (N:1)** — "accounts whose primary contact's email contains @gmail": generates a single-valued navigation-property path filter (`primarycontactid/emailaddress1 …`).
  - **Has / has no children (1:N)** — "accounts with NO open opportunity": generates an `any()` lambda (`opportunity_customer_accounts/any(o: o/statecode eq 0)`, negated with `not` for "has none"); with no condition it's a pure existence test (`any()`).
- Same type-aware operator UI as everywhere else (contains/starts with on text, </> on numbers and dates, GUID handling on lookups), AND/OR between conditions on the same relation, several relation filters combine with the WHERE via AND (with correct OR-precedence parenthesization). The generated OData shows in the query preview.
- Persisted in saved queries (target-entity metadata is re-fetched on restore); reset on entity switch; independent from EXPAND — REL changes which rows return, EXPAND changes what's displayed.
- Help EN/FR updated, including the honest limit: parent paths go one level deep (Dataverse limitation) — deeper chains still need FetchXML link-entities.

## [1.11.93] — 2026-07-09
### Fixed — code-review pass over 1.11.83 → 1.11.92 (3 agents + manual review; 9 findings, all fixed)
- **Loader: speed boosters now really apply to DELETE mode.** The boosters card was shown and toggleable in delete mode, but the bypass headers were never sent with deletes — a silent no-op. Bulk deletes now carry the same doc-verified bypass headers ($batch sub-requests AND the serial fallback), and the "boosters on" warning shows in delete mode too.
- **Loader: a file that parses to nothing is now said out loud.** A CSV whose header line contains an unclosed quote collapses to <2 rows and used to be silently ignored — the Mapping step kept showing the PREVIOUS file's data under the new file's name. A red banner now names the file, explains the likely stray quote, and warns that the table below still shows the previous file.
- **Loader: the pre-flight "D365 record example" now mirrors the run exactly.** Three drifts fixed: an empty cell previewed as sent/cleared (the run omits it — only the NULL token clears); Migration-mode fields previewed under their raw names (the run remaps createdon → overriddencreatedon etc.); an empty lookup cell previewed as a fabricated `@odata.bind` (the run skips the binding).
- **Security Audit org-wide view: leaving the tab now stops the scan.** Switching modules mid-scan used to leave orphaned workers hammering the API to completion, and coming back started a second full scan alongside them (doubling the intended concurrency).
- **Security Audit org-wide view: failed roles are no longer silently missing.** A role whose privilege fetch fails is now reported in a red banner ("N roles failed to load — results below are INCOMPLETE") with a Retry button, instead of quietly disappearing from a view an auditor might read as a verified negative. The "No role grants X" empty-state no longer shows when data is missing.
- **Security Audit org-wide view: no partial exports.** CSV/Excel are disabled during the scan (a mid-scan export produced a partial file indistinguishable from a complete one); the progress counter now counts completed fetches, not claimed ones.
- **Adoption: role-filter race fixed.** Picking a role then switching back to "All" (or to another role) before its member list arrived could silently leave the OLD role's filter applied to the KPIs and table. In-flight results for a role you've navigated away from are now discarded.
- **Adoption: "results capped" no longer cries wolf.** The warning fired when the window's login count landed exactly on the fetch cap even though everything was retrieved; it now fires only when rows were actually left on the server.
- **Adoption (demo mode): synthetic logins now respect the selected window** — the 7-day preset used to chart 7 days while the KPIs counted 30.

## [1.11.92] — 2026-07-09
### Performance
- **Adoption filters are now snappy on big orgs.** Switching the security-role or business-unit filter used to re-scan every login event (up to 300k) to recompute the KPIs, chart and table — a visible lag. The aggregation is split in two: a heavy pass that buckets + rolls events up per user runs **once per window**, and the filter change now only reduces over users (a few thousand at most), re-summing pre-computed per-bucket counts. Same numbers, near-instant. (The security-role filter still does one cached Dataverse lookup the first time a given role is picked — that round-trip is network-bound.)

## [1.11.91] — 2026-07-09
### Fixed
- **Adoption custom range: no more bad-date crashes.** A native date field emits transient values (e.g. year `0020`) while you edit the year, which Dataverse rejected with *"DateTime is less than minimum value supported by CrmDateTime"* (HTTP 400). The custom window is now validated (well-formed, 2000–today, from ≤ to) before any query — an incomplete or out-of-bounds entry keeps the last good window instead of firing an illegal request, and shows an inline hint. The inputs are bounded with `min`/`max` and outlined red while invalid.
- **Adoption custom range: click anywhere to open the calendar.** Clicking (or focusing) either date field now opens the native picker via `showPicker()`, instead of only the tiny calendar icon reacting.

## [1.11.90] — 2026-07-03
### Changed
- **Adoption chart: pick the series.** A Both / Logins / Distinct users toggle above the trend chart. "Both" keeps login bars + the distinct-user line; picking a single series shows it as bars scaled to its own maximum so it fills the height.

## [1.11.89] — 2026-07-03
### Added — New module: Adoption (usage & login analytics)
- **A new "Adoption" tab turns the user-access audit into usage analytics.** For a window you pick (7 / 30 / 90 days or a custom range): total logins, distinct active users, average logins per active user, and how many enabled users **never signed in**. A per-day (per-week over 92 days) chart shows the login trend with a distinct-active-users line.
- **Filter the whole view by security role or business unit** — applied client-side, so switching filters is instant (the window drives the one audit query; role/BU never re-query). Per-user table (logins, active days, last login) with search + sort, plus the never-signed-in list. **CSV / Excel export.**
- Gated to users with audit-read rights (like Login History) and dimmed when auditing is off. Only reflects login rows still inside the org's audit retention window — stated in the UI. New content-script action `getLoginEvents` (paged `audits` scan of `action eq 64`). Help (EN + FR) added.

## [1.11.88] — 2026-07-03
### Fixed — Data Loader speed boosters now use the correct, documented bypass headers
- **The "Bypass synchronous workflows" booster was a silent no-op.** It sent `MSCRM.BypassSynchronousLogic: true` — a header that **does not exist** in Dataverse, so the platform silently ignored it and nothing was bypassed. Verified against Microsoft's [Bypass custom Dataverse logic](https://learn.microsoft.com/power-apps/developer/data-platform/bypass-custom-business-logic) docs.
- **Reworked to Microsoft's real headers:**
  - **Bypass custom synchronous logic** → `MSCRM.BypassCustomPluginExecution: true` — skips sync plug-ins **and real-time workflows** (needs `prvBypassCustomPlugins`).
  - **Bypass custom asynchronous logic** (renamed checkbox) → `MSCRM.BypassBusinessLogicExecution: CustomAsync` — skips async plug-ins + background workflows so a bulk load doesn't flood the system-job queue (needs `prvBypassCustomBusinessLogic`; Power Automate flows are a separate mechanism and are NOT bypassed).
  - Both boxes together send `MSCRM.BypassBusinessLogicExecution: CustomSync,CustomAsync` in a single header (Microsoft's current combined parameter).
  - Duplicate-detection suppression unchanged.
- **The boosters now also apply on the serial-PATCH/POST fallback path**, not only the `$batch` path — so a row that falls back still bypasses what you asked. Tooltips and Help (EN + FR) updated with exactly what each header does and the privilege it needs.

## [1.11.87] — 2026-07-03
### Added — Security Audit: Org-wide privilege view ("who can do what")
- **One view across EVERY security role.** New "🌐 Org-wide view" button in Security Audit: pick an **operation** (Delete by default — the classic audit ask) and a **minimum depth** (Organization by default), and see each role with the entities it can touch, as depth-pie chips. Scans every role's privilege matrix (progressively, with a progress bar; results are cached so changing filters afterwards is instant). Root roles only — business-unit copies inherit the same privileges.
- **Group by role or by entity** — the entity grouping answers "which roles can delete Account?" in one glance; clicking a role opens its full detail. Filter by role or entity name. **CSV / Excel export** of the whole view (role, entity, operation, depth), flat and pivot-ready.
### Fixed
- **Test suite scoping.** Vitest also picked up stale copies of the test files inside `.claude/worktrees/*` (session worktrees pinned to old branches), inflating counts with duplicate old tests. The suite now runs only this checkout's tests (151).

## [1.11.86] — 2026-07-03
### Changed
- **"What's new" popup updated with the reliability wave.** The highlights (EN + FR) now also cover the Loader trust fixes: no silent row loss on timeouts (honest totals + retry of exactly the unsent rows), the pre-flight example applying transforms, and the file-lines vs parsed-records transparency. Store users updating across the whole 1.11.67→86 arc get an accurate recap on first launch.

## [1.11.85] — 2026-07-03
### Fixed — a chunk timeout no longer silently discards the rest of the load
- **Root cause of "it sped through the rest without updating anything".** When one chunk exceeded the 600s timeout, the timeout handler fired the batch-abort flag (meant to stop the hung chunk's server-side work) — but every later chunk then bounced off that flag and returned instantly EMPTY: the progress bar sprinted to the end while those rows were never sent, never logged, and missing from the final counts (a 243k-row update could end at "14,600 processed" with 228k rows unaccounted).
- Now: after a chunk timeout, the run **stops dispatching** and every never-sent row is recorded as an explicit, **retryable** per-row error ("Aborted before send… retry to send this row"). The result screen shows honest totals and the "Retry transient errors" card offers exactly the unsent rows — at gentler concurrency, which is usually what a timing-out org needs.
- Defense in depth in the content script: any batch call interrupted by the abort flag (timeout **or** user cancel) now pads every unprocessed row with the same retryable error instead of dropping it — rows can no longer vanish from the accounting, in any mode (CREATE / UPSERT / UPDATE / DELETE).

## [1.11.84] — 2026-07-03
### Fixed
- **The "D365 record example" now applies the column transforms.** It used to show the raw CSV value — so a "No" mapped with the boolean (Yes/No→true/false) transform previewed as the string `"No"`, making a correct mapping look wrong (and hiding a genuinely missing transform). The example now mirrors what the run will send: transforms applied (`"No"` → `false`, dates → ISO, strip-HTML → cleaned text…), NULL tokens as `null`, and option-set labels annotated with "resolved at run time" (their numeric values are only loaded when the run starts).

## [1.11.83] — 2026-07-03
### Added — Data Loader: parse transparency (lines vs records)
- **"My 200k-line file only imported 14,800 rows" is now answered on screen.** When a CSV has far more file *lines* than parsed *records*, the Mapping step says so explicitly:
  - ℹ Informational when cells contain quoted line breaks (multiline / HTML content) — each record legitimately spans several file lines; the parsed count is the true record count.
  - ⚠ **Unclosed-quote detection**: if a single field holds hundreds of line breaks, a stray `"` swallowed the rest of the file into one cell — the banner flags the record where it happens so you can fix the source and reload, instead of silently importing a truncated file.

## [1.11.82] — 2026-07-03
### Fixed (code-review pass over 1.11.74→81)
- **Bulk role assign/remove: switching role mid-operation could paint the wrong members.** If you launched an assign/remove and clicked another role while it ran, the completion handler reloaded the *previous* role's member list into the newly selected role's Users tab (and the result report bled across). Both operations now capture the selection generation at start and leave the view alone if the role changed mid-flight (the writes themselves were always correct).
- **Role removal now warns about selection hidden by the filter** — "⚠ N selected hidden by filter" next to the Remove button, matching the Explorer's behaviour, so a filtered view can't silently remove the role from members you no longer see.

## [1.11.81] — 2026-07-03
### Changed
- **"What's new" popup refreshed.** It was still announcing the v1.11.0-6 arc (dry run, Recycle Bin…). It now highlights the current arc (EN + FR): BPF manager, inline editing of form-locked fields, the privilege matrix, the role Teams tab + bulk assign/remove, the Loader NULL token, the strip-HTML transform, and the EU/US date toggle + pre-flight checks.

## [1.11.80] — 2026-07-03
### Added — Security Audit: bulk assign / remove a role for users
- **Assign a role to many users at once.** On a role's Users tab (also offered when the role has no direct member), click "➕ Assign users" and paste a list of emails (or domain logins) — one per line, commas/semicolons accepted. Colvio resolves each user, then associates the role copy from **that user's own business unit** — the platform requires the BU-local copy, which is exactly where naive bulk scripts fail. Per-user ✓/✗ report (unmatched emails, per-user Dataverse errors), and idempotent semantics: "already assigned" counts as OK.
- **Remove a role from selected members.** Tick users in the list (header checkbox selects the filtered view) → "Remove role (N)". Direct assignments only — team-inherited roles are managed on the team, as the footnote now states.
- Guardrails: production-environment confirmation on both actions, the member list and count refresh after a run, and the server still enforces the assign-role privilege (Colvio grants nothing the caller doesn't have). Help updated (EN + FR).

## [1.11.79] — 2026-07-03
### Added — Data Loader: "strip HTML → plain text" transform
- **New column transform that removes HTML markup and keeps the visible text** — for importing rich-text (HTML) sources, e.g. Salesforce rich text areas, into a **plain-text** column without changing the column's format. `<br>`/`</p>`/closing blocks become line breaks, `<li>` becomes a "- " bullet, `<script>`/`<style>` are dropped with their content, and common + numeric HTML entities are decoded (`&amp;` last, so already-escaped text can't double-decode).
- **The max-length pre-flight measures the stripped text**, not the raw HTML — so it warns on what will actually be sent. Help updated (EN + FR). (+5 tests → 251.)

## [1.11.78] — 2026-07-02
### Fixed
- **Loader lookups on CUSTOM fields: "Invalid property 'xxx' was found in entity" (HTTP 400).** OData navigation-property names are case-sensitive, and for a custom lookup the navigation property is the attribute **SchemaName** (e.g. `fou_BlockedReasonId`) — not the lowercase logical name. Out-of-box lookups happen to match their logical name, which is why `ownerid`/`primarycontactid` worked while clearing (or binding) a custom lookup like `fou_blockedreasonid` could 400. The Loader now canonicalizes every lookup's navigation property against the relationship metadata at request-build time — for NULL-token clears AND all @odata.bind writes (direct, alt-key, resolve). The pre-flight request example reflects the corrected name too.

## [1.11.77] — 2026-07-02
### Added — Data Loader: NULL token to clear a field (lookups included)
- **Put the literal word `NULL` (any case) in a cell to CLEAR that field on the target record.** Until now there was no way to empty a field from a file: an empty cell means "leave the field untouched" (by design — a partial file must never wipe data), so lookups in particular could not be cleared. `NULL` is the explicit opt-in:
  - **Lookups:** the request sends the bare single-valued navigation property set to `null` — the documented Web API disassociate. Works in direct, alt-key and resolve modes (no resolution is attempted on a NULL token).
  - **Regular fields:** the attribute is sent as `null` (text, numbers, dates, option sets…).
  - **Delta mode:** an explicit clear is always sent (never dropped by the unchanged-field comparison); the pre-flight "D365 record example" and the request log show the `null` exactly as sent. Meaningless on migration-override audit fields, so it's ignored there.
- Empty cells behave exactly as before. Help updated (EN + FR) with the empty-vs-NULL rule. (+2 tests → 246.)

## [1.11.76] — 2026-07-02
### Fixed
- **Filtering on a value containing `#` failed with "unterminated string literal".** A raw `#` in a URL starts the *fragment* — the browser strips everything after it before the request is even sent, so a Builder filter like `fullname not contains '#'` reached Dataverse truncated mid-string (`contains(fullname,'`) and 400'd. The content script now percent-encodes `#` (`%23`) in every request path — a literal `#` is never meaningful in an API URL, so this fixes the Builder, raw OData mode, and any other caller in one place.

## [1.11.75] — 2026-07-02
### Added — Security Audit: Teams sub-tab (who holds the role via teams)
- **New "Teams" tab next to Users on a security role.** A role can be held by teams only — users then inherit it through team membership, so the Users tab legitimately shows 0 while the role is very much in use (e.g. "…BASIC TEAM" roles). The Teams tab lists every team holding the role across all business-unit copies (deduplicated): team name + description, type (Owner / Access / AAD group), business unit, administrator, and member count (counted for the first 50 teams).
- The tab badge shows the team count as soon as a role is selected (fetched in parallel with the user count), so a "Users (0) / Teams (3)" role reads correctly at a glance. **CSV / Excel export** of the team list. Help updated (EN + FR).

## [1.11.74] — 2026-07-02
### Changed — Help updated with the latest features (EN + FR)
- **New "Business Process Flows (admin)" card** in the Admin category: what the section does (list every BPF on a record, reopen a finished flow, move to any stage, finish/abort), the sysadmin gate, the PROD confirmation, the bypass warning, and the SetProcess limitation.
- **Show All Data card** now documents inline field editing — the ✎ pencil, supported types, the fact it works on form-locked fields, and that server-side security still applies.
- **Security Audit card** now documents the Matrix (by table) view — the make.powerapps-style grid with depth pies, not-granted cells, and the full CSV/Excel export.

## [1.11.73] — 2026-07-02
### Fixed (code-review pass over the 1.11.67→72 features)
- **Demo mode showed only half the app.** Since the 1.11.66 anti-flash fix, permission-gated tabs are hidden until permissions are *confirmed* — but the demo (manual) connect never confirmed them, so Login History, Solutions, Translations, System Ops, Users & Licenses, Business Units and Security Audit were all missing in demo mode. Demo now confirms its permissions (and includes the admin flag, so admin-gated features are visible in demo too).
- **BPF "Move to stage" backwards left a stale traversed path.** Moving a flow to an *earlier* stage kept the later stages in `traversedpath`, which can render an inconsistent progress bar on the form. The path is now truncated to end at the target stage (forward moves still append).
- **`getUsersByBu` now validates the business-unit id** before building the OData filter — consistency with every other content-script action (never interpolate an unvalidated id into a URL).

## [1.11.72] — 2026-06-29
### Added — Security Audit: CRUD privilege matrix (make.powerapps-style)
- **New "Matrix (by table)" view on a security role.** Alongside the flat privilege list, you can now see the full grid like the make.powerapps role editor: one row per table × the 8 access rights (Create / Read / Write / Delete / Append / Append To / Assign / Share), each cell a depth "pie" — empty = None, then ¼/½/¾/full for User / Business Unit / Parent-Child / Organization, coloured green→red by breadth. **Crucially, it shows the NOT-granted cells too** (None), which the list view couldn't — so you can confirm what a role *can't* do, not just what it can.
  - Built from the org's full privilege catalog crossed with the role's granted depths — no extra queries (the catalog is already cached). Filter tables by name, and a "Show tables with no access" toggle to include every securable table.
  - Task-based (miscellaneous) privileges that aren't tied to a table are listed separately with their granted depth.
- **Export the whole grid** to CSV / Excel — every table × the 8 rights as depth labels, plus the granted miscellaneous privileges — the complete role definition you'd otherwise have to read cell-by-cell in the maker portal.

## [1.11.71] — 2026-06-29
### Added — inline field editing in Show All Data
- **Edit a field straight from Show All Data, even one the form marks read-only.** Each writable column (per its `IsValidForUpdate` metadata) now has a ✎ pencil: edit the value inline and save it via a direct Web API `PATCH`. Supports text, memo, whole/decimal numbers, money, yes/no, date-time (ISO), and option-sets (State/Status/Picklist) with a value dropdown. Lookups and the primary key are left read-only for now.
- **Guardrails:** the server still enforces field-level security and the write privilege; every save runs through the production-environment confirmation and the tooltip flags it as a direct API write that bypasses the form. The record reloads after a save so the new formatted value (and any rollup/calculated knock-on) shows immediately.

## [1.11.70] — 2026-06-29
### Fixed
- **BPF manager: writes now target the concrete BPF entity resolved from the process `uniquename`.** The previous attempts (`@odata.type`, then `@odata.id`) both reported the abstract base `businessprocessflowinstance`, so Reopen/Move/Finish/Abort 400'd. Per the Microsoft docs, the writable entity is the **`uniquename` of the instance's process (workflow)** — Colvio now looks up `workflows(<processid>)?$select=uniquename`, resolves its `EntitySetName` from metadata, and PATCHes that concrete entity (the instance id is shared with the base, so it addresses the same row). Confirmed the legacy `stageid`/`processid`/`traversedpath` columns on the primary record are deprecated/unsupported, so the instance PATCH is the only supported route.

## [1.11.69] — 2026-06-29
### Fixed
- **BPF manager: "HTTP 400: The 'RetrieveMultiple' method does not support entities of type 'businessprocessflowinstance'" on Reopen/Finish/Abort/Move.** `RetrieveProcessInstances` returns each instance typed as the abstract base `businessprocessflowinstance`, which can't be updated directly — the write must target the **concrete** BPF entity set (e.g. `phonetocaseprocesses`). The call now requests **full OData metadata** and derives the concrete entity set + id from each instance's `@odata.id`, so the PATCH addresses the right entity. (The failure message also now shows which entity set was targeted, for support.)

## [1.11.68] — 2026-06-29
### Fixed
- **BPF manager: "HTTP 404: Resource not found for the segment 'RetrieveProcessInstances()'".** `RetrieveProcessInstances` is an **unbound** Web API function taking `EntityId` + `EntityLogicalName` — it was being called as a *bound* function on the record (`entityset(id)/Microsoft.Dynamics.CRM.RetrieveProcessInstances()`), which 404s. Now called correctly as `RetrieveProcessInstances(EntityId=<guid>,EntityLogicalName='<entity>')`, so the Business Process Flows section actually loads.

## [1.11.67] — 2026-06-29
### Added — Business Process Flow manager (System Administrator only)
- **New "Business Process Flows" section in Show All Data.** When a System Administrator inspects a record, Colvio now lists every BPF instance running on it and lets you do what the form UI blocks once a flow is finished/locked:
  - **Move to any stage** — pick a stage and apply (`activestageid` + `traversedpath` updated together, per the platform contract).
  - **Reopen** a finished/aborted flow (`statecode=0 / statuscode=1`), **Finish** (`1 / 2`), or **Abort** (`1 / 3`).
  - The section auto-appears only when the record actually has a BPF instance; it reads them via the bound `RetrieveProcessInstances` function and resolves each instance's own entity for the PATCH.
- **Guardrails:** the whole section is gated to System Administrators (reuses the existing role check), shows a clear "direct API edit — bypasses stage rules" warning, and routes every change through the production-environment confirmation. Errors are surfaced per action.
- **Note:** switching a record to a *different* process is intentionally not offered — Microsoft removed `SetProcess` from the Web API.
- **Fix (prerequisite):** the System-Administrator detection now matches the role **template id** (`627090ff-…`) instead of the English role name, so it works on non-English orgs (a French org's role is "Administrateur système"). This also tightens the existing admin-gated features (System Ops job cancel/resume).

## [1.11.66] — 2026-06-24
### Added/Fixed (scenario-audit hardening — migration integrity, big-volume perf, permissions UX, finishing touches)
**Group 1 — migration data integrity**
- **Date locale toggle (silent data corruption fix).** A US/Salesforce export of `03/04/2024` (meaning March 4) was read day-first as April 3, with no error. The Loader now shows a **Day-first d/m (EU)** ⇄ **Month-first m/d (US / Salesforce)** toggle whenever a column uses the `date_iso` transform; ISO dates and unambiguous values (day part > 12) are still auto-detected and ignore the setting. (`applyTransform` gained a `dateMD` flag, threaded through both run paths; +4 tests.)
- **Dot-headers no longer hijacked as lookup notation.** A plain data column whose header contains a dot (e.g. `Q1.Revenue`) was forced into a bogus lookup against a non-existent entity and excluded from the normal mapping. When target metadata is loaded, a dotted header is treated as a lookup **only** if its prefix matches a real lookup field/nav; otherwise it's a normal, mappable column.
- **Salesforce-ID pre-flight warning.** Mapping 15/18-char Salesforce IDs to a direct-bind lookup or to a migration owner/created-by/modified-by field now raises a pre-flight warning — those need a Dataverse GUID (or resolve mode against an external-id field), not a raw SF id.

**Group 2 — big-volume performance**
- **Security Audit → role members cap.** A baseline role held by tens of thousands of users no longer pages the entire list (slow / timeout-prone). The first 10,000 are loaded and the view shows "first N of M members (capped for performance)"; the count badge still reflects the true total.
- **Business Units lazy-loads members.** The module no longer fetches **every** org user on mount. It loads the BU hierarchy + per-BU counts (one cheap aggregate query) immediately, then fetches a BU's members only when it's opened (cached thereafter). Subtree export pulls any not-yet-loaded sub-BUs on demand.

**Group 3 — permissions & connection UX**
- **No more permission flash for non-admins.** During the provisional fail-open window (slow-permission-probe timeout), restricted tabs now stay hidden until permissions are confirmed — so they never appear then vanish, and a non-admin can't click into a tab that's about to 403. (Admins, the common case where the probe wins the race, see no change.)
- **Orphaned-tab guard.** If the active tab becomes disallowed after permissions tighten, the app bounces to the first allowed tab instead of leaving its content mounted to throw a raw 403.
- **Unified session-expired message** across every Explorer mode (Builder/OData/FetchXML/SQL) — one detector + one message, so it can't drift.
- **Production confirmation** before mutating actions: Recycle Bin restore, System Ops cancel/resume, and Translation save+publish now prompt on a PROD environment (silent on sandbox/UAT/dev).

**Group 4 — finishing touches**
- **Explorer rows with no unique id are read-only.** When a result has no resolvable primary key, the row's select checkbox and inline edit are disabled with a hint (add the table's primary-key column), instead of silently no-op'ing or deleting the wrong record.
- **Post-delete row removal unified.** The grid and the Explorer's after-delete refresh now share one canonical `recordId` resolver, so deleted rows always disappear (the old after-delete filter matched the first GUID in the row — sometimes a lookup — and could leave deleted rows on screen).
- **Stale-selection guards** added to Metadata Browser, Solution Explorer and Translation Manager — a slow load from a previously-selected entity/solution can no longer overwrite the current selection's view.

## [1.11.65] — 2026-06-19
### Added/Fixed (scenario audit — batch B: Loader key-health + cancel)
- **Pre-flight key-health warnings:** the Data Loader now warns before you run when the key column has **empty cells** (in UPSERT those rows are silently CREATED as new records, not matched — a common surprise) or **duplicate key values** across rows (multiple rows hit the same record, last one wins).
- **Cancel now interrupts the "Preparing N records" phase**, not just the sending phase — a huge file no longer ignores Cancel until prep finishes.

## [1.11.64] — 2026-06-19
### Fixed (scenario audit — batch A: wrong exports, stale state, dead-ends)
- **Exports now honour the on-screen filter** in Security Audit (role privileges) and Users & Licenses — they used to export the full set even when a filter showed only a few rows.
- **Recycle Bin no longer claims "disabled" when the status is merely unknown** (probe failed or insufficient privilege) — it now says it couldn't be determined instead of asserting it's off.
- **Explorer: switching the target entity clears the raw OData/FetchXML/SQL query text** — you can no longer accidentally run the previous entity's query against the newly-selected table.
- **Explorer: closing a query tab mid-fetch now stops its paging loop** (was leaking an orphaned fetch + setState on an unmounted tab).
- **Explorer: saved queries now persist and restore the OData and SQL query text** (previously an OData/SQL saved query came back blank); restoring a query whose table no longer exists now shows a clear message.
- **Data Loader: lookups are reset when the target entity changes** — a lookup configured for the old entity can no longer bind wrongly on the new one.

## [1.11.63] — 2026-06-19
### Fixed (second-pass audit — data integrity, correctness, robustness)
- **Wrong-record edit/delete when the primary key isn't selected:** the results grid derived a row's id by scanning for the first GUID, which could pick a lookup value (`_ownerid_value`, `_parentcustomerid_value`). Inline-edit / bulk-update / DELETE could then target the wrong record. Now lookup `_*_value` columns and annotations are excluded; a non-PK GUID is only a last resort.
- **Double-create on a batch timeout:** when a batch chunk exceeded the 600 s timeout, the panel gave up but the content script kept writing (serial-PATCH fallback) → rows reported as errors may actually have been created → duplicates on retry. The timeout now sends `abortBatch` so the content script stops.
- **$batch response parsing is now keyed by Content-ID** (echoed per operation) instead of by ordinal position — robust to an error message/value containing the multipart marker or any response reordering; missing responses are padded by the specific missing row, not the tail.
- **HAVING (aggregate FetchXML) is applied to every page**, not just the first — a grouped query that paginates no longer leaks unfiltered rows.
- **Select-all is additive over the filtered view** — selecting rows then filtering no longer silently drops the hidden selection; the header checkbox reflects "all visible selected".
- Keyboard focus row is clamped when the filtered set shrinks; the DELETE live-log "processed" count now includes deleted rows.

## [1.11.62] — 2026-06-19
### Fixed (Data Loader — the Lookups step was unreachable when nothing auto-detected)
- Lookups are auto-detected only on columns holding a Dataverse GUID. When a CSV's lookup columns hold non-GUID IDs (e.g. Salesforce IDs like `005To000002TH5xIAG` in a SF→D365 migration), 0 lookups were detected and the Lookups step was both skipped and greyed-out — so you couldn't configure them at all. The Lookups step is now always reachable: the stepper item stays clickable, the Mapping step shows a "🔍 Lookups (add) →" button, and the empty Lookups screen explains that a raw Salesforce ID can't bind a Dataverse lookup directly — you add the lookup and resolve it by matching that ID against a field on the target record (alternate key or a migrated "original ID" field).

## [1.11.61] — 2026-06-19
### Fixed (Explorer — export filename used the wrong entity in OData/FetchXML/SQL)
- Running a raw OData, FetchXML or SQL query that targets a different table than the one selected in the Builder named the export after the stale Builder selection (e.g. a `contacts?...` OData query exported as `fou_salesareateam.xlsx`). The result entity is now resolved from the query itself — the entity-set segment for OData, the `<entity name="…">` for FetchXML/SQL (incl. the >50k client-side-aggregation path) — so CSV/XLSX/JSON exports are named after the table you actually queried.

## [1.11.60] — 2026-06-19
### Fixed (code-audit hardening — logic, perf, web/D365 best practices)
- **Loader result counts (UPSERT):** Created vs Updated are now counted separately end-to-end (content.js → bridge → result card), so a mixed upsert no longer reports "Updated: 1000" while the rollback offers to delete the 300 it actually created. The card now matches the log and the rollback set.
- **`int` transform data corruption:** `"1,000"` was silently parsed to `1` (the comma stopped `parseInt`); now thousands separators are stripped (`"1,000"`/`"1 000"` → 1000), a trailing fraction is truncated, and non-numeric input is rejected to null instead of a silent partial parse. +5 regression tests.
- **Results grid identity:** VirtualTable rows are keyed by record id instead of position, so inline-edit and selection no longer visually jump to the wrong record after sort+filter.
- **Batch cancel:** the per-row serial-PATCH fallback now checks the abort flag mid-chunk, so Cancel stops it (and reduces orphaned writes when a chunk falls back under throttling).
- **Lookup resolution N+1:** resolve-mode lookups now batch via OR-filter chunks of 80 with concurrency 6 (like the existence check) instead of one query per unique value — a high-cardinality migration no longer fires tens of thousands of sequential requests before the first write.
- **Explorer large exports:** paginated fetches throttle the results re-render (paint every 5 pages, force on column changes) so the filter/sort memos don't recompute over the whole growing set on every page.
- **Resilience & hygiene:** ErrorBoundary now logs the caught error + component stack; inline-edit write-access probe fails open on a probe error; Results' confirm/bulk modals close on Escape; a "N selected are hidden by the filter" warning before bulk actions; control chars stripped from role-name OData filters; `lookupFieldSet`/`entityTemplates` memoized; the global search box now opens the Ctrl+K palette (was inert).
- **Edge / packaging:** `minimum_chrome_version: 102` added; panel CSP `connect-src` widened to the US-Gov and China Dataverse hosts. (No code changes were required for Edge — the same package is Edge-Add-ons-ready; this is forward-proofing.)

## [1.11.59] — 2026-06-19
### Fixed (Data Loader — chunk isolation now covers all modes incl. DELETE)
- UPDATE was already covered by the v1.11.58 fix — it runs through the same `batchUpsert` path (only difference is the `If-Match: *` header), so the 600 s timeout and per-chunk isolation already applied. This release extends the same per-chunk try/catch to the bulk-DELETE worker (`batchDeleteKeyed`), which still had the unprotected per-chunk call: a single timed-out delete chunk no longer aborts the whole delete; its rows are logged as per-row errors and the rest continues. All three batch workers (create / upsert+update / delete) are now consistent.

## [1.11.58] — 2026-06-19
### Fixed (Data Loader — one timed-out chunk aborted the whole load)
- A single chunk timing out (`Batch UPSERT failed: Timeout after 300s`) used to reject the entire batch operation, throwing away every remaining chunk and reporting one opaque row-0 error. Now each chunk is isolated: if its request fails (timeout, network drop, content-script error) its rows are logged as **per-row errors with the exact message** and the load **carries on with the next chunks**. Because a timeout classifies as transient, those exact rows are offered on the retry card. Also raised the per-chunk batch timeout from 300s to 600s to give heavily-throttled orgs / the serial-PATCH fallback more headroom before a chunk is marked failed.

## [1.11.57] — 2026-06-19
### Fixed (Data Loader — retry card was self-contradictory when no failure is transient)
- When every failed row is deterministic (e.g. 130 "no matching record" 404s), the retry card no longer asks "retry the ones that might be transient?" while offering only "Retry all 130 failed". It now adapts: the heading reads "130 rows failed — these look like data/permission errors, not transient ones", the accent turns amber, the action becomes "Retry all 130 anyway", and the help text explains a retry only helps if you fixed something org-side, otherwise to check the log (usually a wrong/format-mismatched key) and re-import. The transient-retry flow is unchanged when transient failures exist.

## [1.11.56] — 2026-06-19
### Added (Data Loader — show the exact error on a crash)
- If a run dies with an uncaught error outside the per-batch try/catch (prep loop, existence pre-pass, metadata fetch, etc.) it no longer stops silently with a spinner stuck. Every run (dry / real / retry) now goes through a wrapper that catches the failure and shows the **exact error message** (plus an expandable stack trace) on the run screen, with "← Back to mapping" and "Save error" actions. The busy/before-unload guard is released on crash so the tab isn't stuck. Per-batch failures are still handled as logged row errors as before.

## [1.11.55] — 2026-06-19
### Fixed (Data Loader — progress denominator counted input rows, not sent rows)
- An UPDATE of, say, 91,000 rows that only matches ~5,400 existing records looked like it "stopped at 5,400 / 91,000". Rows the prep step filters out (no matching record in UPDATE-only, empty key, or unchanged in delta mode) never reach a batch, but the progress bar's denominator was the full input count while `done` only counts sent rows. The bar now tracks the rows actually being sent, the send message shows "Sending N of M … — K not eligible", and the completion reads "Done — N sent, K not eligible (no matching record / empty key / unchanged — see the log)". No behavioural change to what's sent; the result screen's Updated/Errors/Skipped breakdown was always correct.

## [1.11.54] — 2026-06-19
### Added (Explorer results — client-side filter + filtered export)
- The query-results toolbar now has a **Filter results** search box that filters the already-loaded rows live (no re-query) across every selected column, matching the displayed value (label for lookups/option-sets). The header count shows "X of Y records" while filtered, with a no-match state and a clear-filter shortcut. Typing stays smooth on large result sets (useDeferredValue).
- **Every export and copy now honours the active filter + sort** — CSV/XLSX/JSON download and Excel/CSV/JSON copy emit exactly the rows currently shown, and Select-all selects the filtered rows. So you can narrow thousands of rows to the ones you want and export just those.

## [1.11.53] — 2026-06-19
### Fixed (Data Loader — switching target entity left stale key/mode/mappings)
- Changing the target entity now resets the **match key** and **load mode**. Previously the key persisted across entities, so an alternate key chosen for one entity (e.g. `fou_sapcustomernumber`) carried over to the next and drove every row to "No existing record … UPDATE only → 404". On a real entity switch Colvio now clears `uKey`, UPDATE/UPSERT/DELETE mode, delta, verify-existence and the delete confirmation, and once the new entity's metadata loads it drops any field mapping whose target doesn't exist on the new entity (valid mappings like name→name and statecode/statuscode transforms are kept).

## [1.11.52] — 2026-06-19
### Added (Data Loader — retry failed rows)
- After a load with errors, the result screen now offers **🔁 Retry transient errors (N)** — re-runs only the rows whose failure is likely transient (timeouts, aborts, throttling/429, 5xx, SQL deadlocks, network blips) classified by a new pure `isTransientError()` helper. A secondary **Retry all failed** covers the rest (use after fixing something org-side). The retry re-runs at gentler concurrency/chunk so it doesn't re-trip the same limit, keeps the original log + created-IDs so **rollback still covers everything**, merges the counts (successes add up, errors shrink), and shows a "44 of 47 succeeded · 3 still failing" banner. Deterministic 400/403/404 (bad data, no privilege, not found) are intentionally NOT offered for transient retry — a blind retry would fail the same way. +6 tests (235 total).

## [1.11.51] — 2026-06-17
### Fixed (Explorer Builder — filtering on Owner / primary-key fields)
- Filtering or selecting an **Owner** field (e.g. `ownerid`) in the Builder no longer throws `HTTP 400: A binary operator with incompatible types was detected … 'Microsoft.Dynamics.CRM.principal' and 'Edm.String'`. Owner is a polymorphic lookup: it must be queried as `_ownerid_value` with an **unquoted GUID**, but it wasn't recognised as a lookup. `getFields` now maps Owner (like Lookup/Customer) to `_<name>_value`, and the filter builder emits the unquoted GUID for Owner **and** Uniqueidentifier (primary-key) fields instead of `ownerid eq 'guid'`.

## [1.11.50] — 2026-06-17
### Added (Data Loader — pre-flight length check)
- The Data Loader now warns **before** you run when a mapped column's values exceed the target field's MaxLength — the usual failure when migrating HTML into a rich-text field (verbose markup blows past the limit → a 400 per row). The pre-flight panel shows, per field: the max length, how many rows exceed it, and the longest value found. `getFields` now returns `maxLength`/`format` for String + Memo attributes (fetched via typed metadata casts, best-effort, cached 1 h). The whole-file scan is memoized so it only re-runs when the data/mapping/metadata change.

## [1.11.49] — 2026-06-17
### Added (Data Loader — Migration mode)
- New opt-in **Migration mode** on the Data Loader lets a migration preserve original audit values when creating records. When enabled (and only in pure CREATE — no upsert/update key, not delete), you can map `createdon` (→ `overriddencreatedon`), `modifiedon`, `createdby` and `modifiedby`. createdby/modifiedby take a systemuser GUID and are bound automatically via `@odata.bind`; createdon is translated to `overriddencreatedon` (the only writable created-date attribute). Requires the **prvOverrideCreatedOnCreatedBy** privilege at runtime.
- Default behaviour is unchanged: outside Migration mode, all system/audit fields (createdon, createdby, modifiedon, modifiedby, owning*, versionnumber, …) are stripped on every load mode exactly as before. The toggle shows a clear warning + privilege note, and reverts to stripping the moment an upsert/update key is set. Pure mapping logic extracted to `migrationOverridePair()` with 6 regression tests (229 total).

## [1.11.48] — 2026-06-16
### Fixed (faster, clearer connect)
- The panel no longer lingers on the static "Open any Dynamics 365 page… Demo Mode" screen while it connects. During auto-connect it now shows a proper **"Connecting to <org>…"** spinner.
- First paint is no longer blocked behind the permission probes. `checkPermissions()` (4 network round-trips: audit / solutions / users / admin) is now raced against a 2.5 s timeout: if the probes win you get exact permissions with no flash; if a cold tab/slow org makes them lag, Colvio connects immediately (fail-open) and tightens the read-gated tabs the moment the probe lands. This removes the occasional ~10 s blank-looking wait on open.

## [1.11.47] — 2026-06-16
### Added (more user fields from Dataverse)
- User views now surface **Manager**, **Business phone** and **Mobile** (in addition to **Job title**) — pulled from the Dataverse `systemuser` record (`parentsystemuserid`, `address1_telephone1`, `mobilephone`, `title`). Shown in the Users & Licenses detail card; job title also appears as a sub-line under each name in Business Units and Security-Audit role-member tables (phone/mobile on hover). All four columns are included in every CSV/Excel export of those lists.
- Note: these come from Dataverse, not directly from Entra ID. Pure-Entra attributes such as **department** are not mirrored onto `systemuser` by default and live in Microsoft Graph, which Colvio (a zero-setup, Dataverse-session tool) does not call. If your org syncs a custom department field onto `systemuser`, it can be surfaced too.

## [1.11.46] — 2026-06-14
### Added (Excel export next to every CSV button)
- Every CSV export now has a native **Excel (.xlsx)** button beside it — better for business users (real typed cells, column widths, no separator/encoding/formula-injection issues). Added across Business Units (this-BU and sub-tree), Security Audit (privileges + role members), Users & Licenses, Login History, System Ops (plug-in traces) and Metadata Browser (fields data-dictionary + OptionSets). Both formats share one `exportTable` helper; xlsx stays lazy-loaded (only fetched when you click an Excel button).

## [1.11.45] — 2026-06-14
### Fixed (Security Audit: "roleId is not defined" when opening a role's Users)
- 1.11.44 switched the bridge's getRoleUsers signature to take a role name but left its body still passing the old `{ roleId, rootId }` — a ReferenceError ("roleId is not defined") that broke the Users sub-tab while the count badge (correctly updated) still worked. It now passes `{ roleName }`.

## [1.11.44] — 2026-06-14
### Changed (Security Audit: role members in ONE query — no more per-BU fan-out)
- Reworked how a role's members are fetched: instead of one query per business-unit copy of the role (which timed out on big multi-BU roles), Colvio now starts from `systemusers` and filters by the role with a single `any()` lambda — `systemusers?$filter=systemuserroles_association/any(o:o/name eq '<role>')` — returning every member with their business unit in **one paged query**, regardless of how many BUs the role spans. The count badge uses the same filter with `$count`. (Caveat: it matches by role name; if two genuinely-different roles share a name this slightly over-matches — role names are effectively unique in practice.)

## [1.11.43] — 2026-06-14
### Fixed (Security Audit: role members timed out on roles spanning many BUs)
- Loading a role's members could fail with "Timeout after 30s — action: getRoleUsers" on big roles that exist in many business units, and the UI then misleadingly showed "No users are assigned to this role." Three fixes: (1) getRoleUsers/getRoleUserCount now get the 5-minute timeout (they fan out one query per business-unit copy of the role, not a single call); (2) those per-copy queries run with **bounded concurrency (pool of 6)** instead of firing all at once, which used to 429-storm orgs with many BUs; (3) a load failure now shows a clear **error with a Retry button** (and only shows "No users assigned" when the role genuinely has none).

## [1.11.42] — 2026-06-14
### Added (Security Audit & Business Units: Enabled/Disabled user filter)
- Both the **Security Audit** Users sub-tab (role members) and the **Business Units** members list now have an **All / Enabled / Disabled** filter (defaults to All — same as before). The CSV export respects the active filter, so you can export, say, only the enabled members of a role or a business unit.

## [1.11.41] — 2026-06-14
### Added (Business Units: scoped CSV export + docs)
- The Business Units module's user export now offers a **scope choice**: export just the **direct members** of the selected BU, or **this BU plus every sub-BU beneath it** (the sub-tree export keeps a Business Unit column per user, deduplicated). The header shows both the direct count and the "incl. sub-BUs" count, and the sub-tree export works even when the selected BU has no direct members.
- Documented the new module everywhere — in-app Help (EN + FR), README, and the Chrome Web Store listing.

## [1.11.40] — 2026-06-14
### Added (new module: Business Units)
- New **Business Units** tab: the org's BU **hierarchy** (indented tree, with a search) and the **users per BU**. Pick a BU to list its direct members (name, email, access mode / CAL type, enabled/disabled) with a filter and CSV export; each BU shows its user count in the tree. Reads `businessunits` + the existing all-users fetch, grouped by `_businessunitid_value`. Admin-gated (needs read on all users), read-only. Complements Security Audit (who holds a role) and Users & Licenses.

## [1.11.39] — 2026-06-14
### Added (Data Explorer Builder: ORDER BY)
- The visual query **Builder now has an ORDER BY** control — pick a field and ASC/DESC. It adds a server-side `$orderby`, so the **whole result/export is sorted** (not just the loaded page like header-click sorting). It's saved with the query, and shows in the copied OData URL.

## [1.11.38] — 2026-06-14
### Changed (Loader: visible "Preparing…" phase before sending)
- On big imports the run used to sit at a frozen "0 / N records" for several seconds before anything moved — the per-row build loop is synchronous and the existing "Preparing records…" message never got a chance to paint. It now yields to the browser so the message shows, displays the **record count**, and refreshes a **"Preparing X / N records…"** counter every 25k rows. The progress bar stays at 0 during this phase on purpose — nothing is written until preparation finishes (no global existence check runs in plain UPDATE/UPSERT unless you opt in, dry-run, or use delta mode).

## [1.11.37] — 2026-06-14
### Changed (Loader: searchable Target-entity in Parent Lookups)
- The "Target entity" field in each Parent Lookup is now a **searchable autocomplete** (like the main entity picker) instead of a free-text box: type a few letters and it suggests matching tables by display name or logical name; pick one and its lookup fields/alt-keys load automatically. You can still type a logical name directly.

## [1.11.36] — 2026-06-14
### Fixed (Help: "Restart onboarding tour" no longer abandons a running import)
- "Restart onboarding tour" reloads the Colvio panel — which would silently kill a Data Loader import in progress. The Loader now reports its busy state to the app, and the restart-tour action asks for confirmation when an import is running ("…reloads Colvio and abandons the import — continue?") instead of reloading blindly. (Switching tabs is already safe since 1.11.35; this closes the one in-app action that still forced a reload.)

## [1.11.35] — 2026-06-14
### Fixed (Loader: switching tabs / reloading no longer loses a running import)
- The Data Loader is now **kept mounted** (like the Explorer) while you use the app, so switching to another Colvio tab during an import no longer unmounts it — the run keeps its **progress, live log, result and Rollback button**, and you can switch back to watch it, Cancel, or roll back. Before, navigating away unmounted the component: the write loop kept running in the background but you lost all visibility (and could accidentally start a second import on the fresh mount).
- Added a **"Leave site?" guard** (beforeunload) that fires only while an import is in flight, so accidentally closing or reloading the Colvio panel mid-run prompts a confirmation instead of silently abandoning the run (which would leave it without a result or rollback).

## [1.11.34] — 2026-06-14
### Internal (Loader: regression-test the match-key default)
- Extracted the UPSERT/UPDATE/DELETE default-key logic into a pure, unit-tested helper (`loaderUtils.defaultMatchKey`) and added 5 tests — including the regression that bit 1.11.33: when no CSV header matches the key name, the column must be left empty (never silently fall back to the first column). 223 tests total.

## [1.11.33] — 2026-06-14
### Fixed (Loader: match key no longer silently grabs the wrong CSV column)
- When you switch to UPSERT/UPDATE/DELETE, the Loader auto-fills the match key with the table's first alternate key (a convenience). It used to also auto-pick the **first CSV column** for that key's value when no column name matched — which silently matched on the wrong column (e.g. a product code landing in a "SAP customer number" key → every row 404s). Now the CSV column is only auto-filled when one actually matches the key name; otherwise it's left empty so the existing "key has no CSV column" warning prompts you to pick the right one. The match key itself is still shown in the Preview banner ("matched on …") — change it there if it isn't the one you want.

## [1.11.32] — 2026-06-14
### Changed (Help: organized into category tabs)
- The Help tab now groups its cards into **category tabs** — All · Query & Export · Data Loader · Admin & Governance · Solutions & Schema · Tips & Troubleshooting — each showing a count, so you jump straight to the area you need instead of scrolling one long list. Search still spans every category (the tabs hide while a search is active). EN + FR.

## [1.11.31] — 2026-06-14
### Changed (Help: compact masonry layout)
- The Help cards now use a **tight masonry layout** (CSS columns): cards pack together with no vertical gaps and fill the full width, auto-fitting as many ~340px columns as the screen allows (1 on mobile, 3-5 on a wide monitor). Fixes the uneven "wall of gaps" the row-major grid produced with very different card lengths.

## [1.11.30] — 2026-06-14
### Changed (Help: full-width row-major grid)
- The Help cards now use a full-width responsive **grid that fills row by row** (auto-fitting as many ~340px columns as the screen allows — 2 on a narrow panel, 4-5 on a wide monitor), replacing the centered two-column masonry that left wide empty margins and flowed column-by-column.

## [1.11.29] — 2026-06-14
### Changed (Help: two-column card layout)
- The Help tab now lays its feature cards out in a **responsive two-column masonry** (one column on mobile) and uses the full width, instead of a single tall stack — far less scrolling to find a module. The search box and header stay at a comfortable width.

## [1.11.28] — 2026-06-14
### Docs
- **In-app Help refreshed (EN + FR)** to cover everything shipped in 1.11.16→27: query tabs + "All" default in the Data Explorer, the Show All Data multi-column grid, Recycle Bin ownership columns + pagination, System Ops pagination + server-side filters, Security Audit "who holds this role" (across all business units), the corrected/expanded solution component types, full language-name coverage in Translations, and SQL TOP behavior.
- README and the Chrome Web Store listing updated to match.

## [1.11.27] — 2026-06-14
### Changed (Query / Request tabs: inline rename)
- Renaming a query tab (Data Explorer) or request tab (API Tester) is now **inline** — double-click the tab title and it turns into an editable field (Enter to save, Esc to cancel, click away to commit), instead of the old browser prompt dialog. Discoverable and clean.

## [1.11.26] — 2026-06-14
### Added (Data Explorer: query tabs)
- **The Data Explorer now has browser-style query tabs.** Open several queries at once (+ New), switch between them, double-click to rename, ✕ to close. Each tab keeps its own full state — entity, mode (Builder/OData/FetchXML/SQL), fields, filters, and **its results** — so you run them one at a time and flip between tabs to compare. Same proven pattern as the API Tester's request tabs: each tab is an independent Explorer instance kept mounted, and only the visible tab reacts to the Ctrl+Enter run shortcut. (Note: each open tab holds its result set in memory, so with the new "All" default, very large result sets across many tabs use more memory.)

## [1.11.25] — 2026-06-14
### Changed (Data Explorer: builder defaults to All, not 50)
- The visual query **builder now defaults its LIMIT to "All"** instead of 50 — an export tool should return everything by default (auto-paginated), and you can still drop the limit for a quick preview. Also fixed a restore bug where a saved query whose limit was "All" (0) snapped back to 50 on reload (`?? 0` instead of `|| 50`). Other result views were already cap-free: Recycle Bin and System Ops paginate ("Load more"), Users & Licenses and Metadata load everything; Login History keeps its "Last N" timeline depths (50–500) since it's a per-user audit timeline, not a bulk export.

## [1.11.24] — 2026-06-13
### Fixed (Security Audit: role members missing across business units)
- **Roles that clearly had users showed none (and the user count was wrong).** A security role exists as one copy per business unit, and a user is assigned the copy in *their* BU — but Colvio was only reading the root-BU copy, so every member sitting in a child business unit was invisible. The user count and the Users list now gather **every copy of the role** (matched via `parentrootroleid`) and union the members, deduplicated by user. The Business Unit column shows where each member sits. Degrades to the previous single-copy behaviour if the copies can't be enumerated.

## [1.11.23] — 2026-06-13
### Added (Security Audit: list users assigned to a role)
- A role's detail panel now has two sub-tabs — **Privileges** and **Users** — so you can see *who* actually has the role, not just the count. The Users list shows name, email, business unit, access mode (a badge flags app / non-interactive accounts), and enabled/disabled status, with a filter box and its own CSV export. It's loaded lazily (only when the Users tab is opened) so clicking through roles stays instant. A note clarifies the list is for this role instance / business unit — the same-named role in another BU can have different members.

## [1.11.22] — 2026-06-13
### Added (System Ops: date & search filters — server-side)
- **Plugin Traces**: date range (From/To), a duration filter (min ms), and the text search (plug-in / message / entity) now all run **server-side** — they query the whole table, not just the loaded pages. The trace table is auto-purged after ~24h so `contains()` stays cheap.
- **System Jobs**: a **name search** (using `startswith` — index-friendly, deliberately not `contains()` which would force a full `LIKE '%…%'` scan on a potentially huge asyncoperation table) plus a date range. Status chips still load instantly.
- **No perf/UX cost**: text inputs are **debounced (350 ms)** so typing never fires a request per keystroke; date ranges only narrow the result set; status chips stay immediate; a ✕ resets all filters. Native date pickers follow the light/dark theme.

## [1.11.21] — 2026-06-13
### Changed (System Ops: pagination — no more hard cap)
- **Plugin Traces and System Jobs now paginate** instead of being capped (Traces maxed at Top 200, Jobs were hard-wired to 100). Both use Dataverse server-driven paging (`Prefer: odata.maxpagesize` + `@odata.nextLink`): pick a page size (100/250/500/1000) and a **"Load more"** button appends the next page until the list is exhausted. A footer shows how many are loaded and whether more remain. Everything stays loaded so the search box spans all fetched rows, and CSV export covers them all.
### Internal
- `dvRequest` now appends `odata.include-annotations` to a caller-supplied `Prefer` instead of overwriting it (so maxpagesize and formatted values travel together); the `query` bridge call accepts a `maxpagesize` option.

## [1.11.20] — 2026-06-13
### Fixed (Translations: language names · Solutions: component types & names)
- **Translation Manager — language columns showed raw codes** ("LCID 2070", "LCID 3082") for any language outside a short hard-coded list. The map now covers the full set of Dataverse-provisionable languages, so 2070 → Portuguese (Portugal), 3082 → Spanish, plus ~40 others (with the easy-to-confuse pairs labelled: Portuguese Brazil 1046 vs Portugal 2070, Spanish 3082 vs legacy 1034, Chinese Simplified 2052 vs Traditional 1028). Unknown codes still fall back to "LCID n".
- **Solution Explorer — component type labels were wrong, and names showed as GUIDs.** The internal `componenttype` codes were shifted by a few against Microsoft's enumeration, so groups were mislabelled (type 60 "Web Resource" was actually System Form; real Web Resources 61 were labelled "Sitemap"; 63 "Security Role" was actually Connection Role; etc.) and the name-resolvers queried the wrong tables — which is why Web Resources, Roles, Apps and others fell back to raw GUIDs. All codes are corrected to the official list, the type map is expanded (Security Role 20, Email Template 36, Field Security Profile 70, Model-driven App 80, Routing Rule 150, Convert Rule 154, Environment Variable 380, SLA 152…), and name resolution now hits the correct table per type (best-effort; still shows the GUID if a record can't be read).

## [1.11.19] — 2026-06-13
### Changed (Responsive layout — use the full screen, less scrolling)
- **Show All Data** now renders fields in a **responsive grid** instead of one long single-column list: 1 column on narrow panels, 2 on a normal window, 3+ on wide screens (each column ≥440 px). A 400-field record that used to be a tall scroll now fits in roughly a third of the height. The view also uses the full width (cap raised 900 → 1600 px).
- **Wider content on every data-heavy tab** so big screens aren't half-empty and tables/lists scroll less: width caps raised — Metadata Browser & Login History 900–1000 → 1500, System Jobs/Traces 1100 → 1500, API Tester 1200 → 1500, Loader 1100 → 1400 (Recycle Bin was already 1500 in 1.11.17). All collapse to full width on mobile. The Help tab stays narrow on purpose (prose reads better in a column).

## [1.11.18] — 2026-06-13
### Fixed (SQL Explorer: TOP semantics + paging-cookie 400)
- **`TOP n` now actually limits the result.** Two bugs compounded: (1) the parser only recognized `TOP` right after `SELECT`, so the suffix form Colvio's own templates use (`… ORDER BY name ASC TOP 100`) was silently dropped; (2) when `TOP` *was* read it mapped to FetchXML `count` (a page size), so the query paginated through the entire table n-at-a-time instead of stopping. `TOP` is now parsed in either position and emitted as FetchXML `top` (a hard cap that disables paging), capped at the platform max of 5000.
- **No more "Paging Cookie And Query Do Not Match. The counts are not equal." (HTTP 400) on page 2.** The pagination loop used to re-encode the Web API paging cookie back into the fetchXml, which is brittle and triggered that error. It now pages by page **number** only and uses the cookie's *presence* purely as the "more pages remain" signal — the documented, reliable approach. Queries with no `TOP` still fetch every page; queries with `TOP n` return exactly n and never paginate.

## [1.11.17] — 2026-06-13
### Changed (Recycle Bin: pagination + full-screen layout)
- **True pagination** replaces the old "Top N" cap (max was 2000). The bin is now read one page at a time via FetchXML `count`+`page`, with **← Prev / Page N / Next →** controls and a page-size selector (100/250/500/1000 per page). Only the current page lives in the DOM, so a mass ETL delete of **hundreds of thousands** of records is browsable without ever loading everything — "Next" is enabled only when the server returns a paging cookie (more pages exist). The deleted-by audit lookup follows the page (best-effort; deep/old pages may show "—").
- **Layout now fills the screen**: the table grows to the viewport height (`calc(100vh - 300px)`) instead of a fixed 460 px, and the container widened from 1000 → 1500 px so all eight columns fit without horizontal scrolling on a normal window (narrow side-panel still scrolls as a fallback). The footer shows page / count / "more pages available".

## [1.11.16] — 2026-06-12
### Added (Recycle Bin: ownership & deletion columns)
- The deleted-records list now shows **Created by**, **Modified by** (standard ownership lookups on the retained record, resolved to user names) and **Deleted by / Deleted on**. "Deleted by/on" isn't stored on the bin record — Colvio pulls it from the **audit log** (the delete event) with a single best-effort query per load: it fills in when auditing is enabled for the table, and shows "—" otherwise (never blocks the list). The table scrolls horizontally and the Id is truncated (full value on hover).

## [1.11.15] — 2026-06-12
### Added
- **Recycle Bin: find a deleted record by name, beyond the page cap.** A name search box runs a **server-side** `like` filter on the bin query, so you can locate a specific deleted record even when there are more than the displayed page — it doesn't just filter the loaded rows. The page size now also offers Top 2000 (the list shows the most recently deleted first; the Dataverse FetchXML single-page hard cap is 5000). Changing the page size or table reloads automatically.

## [1.11.14] — 2026-06-12
### Added
- **Recycle Bin: the table picker now lists only tables that actually support restore.** Using Microsoft's documented detection (`recyclebinconfig` rows where `statecode=0` and `isreadyforrecyclebin=1`, joined to the `entity` table for the logical name), the picker hides tables that can't be restored on this environment (virtual/elastic/solution-component tables, tables with >600 columns, anything not yet enabled) — so you can't pick a table that would error. A small note shows the count. Fail-open: if the support list can't be read (e.g. no privilege, older org), all tables are shown as before. Cached 10 min, fetched lazily when the tab opens.

## [1.11.13] — 2026-06-12
### Fixed
- **Recycle Bin: selecting a table failed with "Could not find a property named 'CanBeDeleted'".** The shared entity-metadata query `$select`ed `CanBeDeleted`, a managed property that isn't selectable on every org/API version. The core query now requests only universally-selectable properties (display name, primary name/id, entity set); `CanBeDeleted` is fetched separately, best-effort and opt-in (only the Explorer bulk-delete pre-check asks for it), so a non-selectable property can never break the metadata call. Recycle Bin (and any other metadata consumer) works regardless. The org-level "recycle bin enabled" detection was already correct (the green banner) — this was a per-table metadata issue, not the activation check.

## [1.11.12] — 2026-06-12
### Fixed
- **Recycle Bin: the table picker was empty/unusable.** `getEntities()` returns `{logical, display, entitySet}`, but the Recycle Bin used the list without mapping it to the `{l, d}` shape every other module applies — so every entry rendered as "()" and selecting one sent `undefined` as the table name ("Invalid logicalName: undefined"). Now mapped (and sorted) like the Metadata Browser. The table list and restore flow work again.

## [1.11.11] — 2026-06-12
### Fixed
- **Change History: the "User" column is now populated.** The audit query didn't `$select` `_userid_value`, so the timeline showed who-did-it as blank. Added it (formatted user name resolved via the annotations Colvio already requests on reads). Found during the post-1.11 Microsoft-compliance + regression verification (10/11 PASS; this was the one data-completeness gap — 0 API-correctness or security regressions).

## [1.11.10] — 2026-06-12
### Fixed (rollback transparency)
- **The Rollback panel now reports records it cannot reach.** A created record whose GUID wasn't returned (rare `OData-EntityId` miss, or the serial-fallback path that creates via single PATCH) was silently absent from the rollback list. The panel now counts those rows and shows a clear warning ("N created record(s) had no GUID returned and cannot be rolled back here — delete them manually if needed"), and the panel appears even when *every* created GUID was un-captured, so the user is never told rollback succeeded when it didn't.
### Note
- The delta-mode behavior of always re-sending lookup `@odata.bind` values is **intended and correctly documented** ("lookup bindings are always sent — no cheap server-side compare"): skipping them would risk dropping a binding that actually changed. No change — it is not a bug, and the help does not overstate the savings.

## [1.11.9] — 2026-06-12
### Fixed (full-project code review)
- **Rollback now covers UPSERT-created records.** UPSERT rows that *create* a record return HTTP 201 (tagged CREATED) but their GUID was never captured from the `OData-EntityId` header — only `batchCreate` did. So "Rollback created records" after an upsert silently skipped exactly those records. The upsert batch parser now captures the created GUID too.
- **Owner lookups no longer mis-bind on throttling.** The user-vs-team probe treated a transient 429/5xx exactly like a clean 404, so a throttled *team* GUID could be bound to `/systemusers` and fail per row. It now distinguishes "not found" from "couldn't check": unresolved-by-throttling rows are reported as a clear per-row error ("re-run to retry") instead of being silently mis-owned.
- **Defense-in-depth: same-org host check in `dvRequest`.** Any absolute URL (e.g. an `@odata.nextLink`) is now verified to target the user's own org host at the single request chokepoint. Panel messages already can't be forged (`background.js` checks `sender.id`, no `externally_connectable`), so this isn't an exploitable path — it just guarantees no current or future caller can make the privileged content script fetch an off-org host.
- **Show All Data** validates the record id from a pasted D365 URL as a real GUID (like the other input forms) — a garbled URL now fails fast instead of building a malformed OData path.
- **System Ops**: the "select all" jobs checkbox no longer renders checked on an empty table.
- **Data Explorer**: lookup links are only rendered for genuine GUID values (and the entity name is URL-encoded), avoiding broken `main.aspx` links for alias/virtual-entity projections.
- **Change History**: a missing audit timestamp renders "—" instead of "Invalid Date".

The review confirmed the security posture is sound: no XSS / `innerHTML` / `eval` anywhere, CSV exports all carry the formula-injection guard, the message trust boundary is enforced, and the OData "query builder" surface is the user querying their own data with their own session — by design, not an injection vuln.

## [1.11.8] — 2026-06-12
### Changed (org-feature detection + performance pass)
- **Org-feature gates, everywhere.** One consolidated probe per session (`organization.isauditenabled`, `plugintracelogsetting`, recycle-bin config — 2 GETs, cached 10 min) now feeds the whole UI: when a Dataverse feature is disabled on the environment, its tab is **dimmed with a ● badge** ("Feature not enabled on this org") and the module shows a clear banner explaining the feature is not usable via Colvio **and the exact admin-center path to enable it**. Gated: Recycle Bin (bin setting), Login History + record Change History (auditing), Plugin Traces (trace logging Off). Unknown status (no read rights) never dims — fail-open, the module's own errors guide instead.
- **Performance pass over the 1.10.27→1.11.7 additions:**
  - **Startup un-blocked**: the publish-privilege probe (3 chained requests, added in 1.10.27) no longer gates the first paint of the tab bar — it resolves in the background and is **cached 6 h**. Startup is back to the 4 parallel one-shot probes.
  - **`entitySetFor` memoized** in the Loader: it runs per lookup per row (×400k rows in the prep loop and again in the log export) — the linear entity-list scan became O(1) per logical name, removing seconds of main-thread freeze on large loads.
  - **Owner user-vs-team probes parallelized** (5-way pool, abort-aware) instead of strictly sequential.
  - **Recycle-bin status served from the shared cached probe** — opening the tab no longer costs its own roundtrip.
  - Everything else added in 1.11 was already lazy by design: org probes after connect, module queries on tab open, audit details on expand, What's New from localStorage, palette renders nothing while closed, xlsx still a lazy chunk. Bundle: panel ~584 KB (+~92 KB for 7 new modules/features), xlsx chunk unchanged.

## [1.11.7] — 2026-06-12
### Documentation & distribution
- **EDGE_LISTING.md** — complete Microsoft Edge Add-ons submission guide: the package is Edge-ready as-is (no `update_url`, all APIs supported), free Partner Center account, permission justifications, certification notes, Edge-specific listing copy. Publishing to Edge is the biggest distribution win available (enterprise D365 users live in Edge).
- **README / Chrome Web Store listing** updated for the whole 1.11 arc (Recycle Bin, change history, System Ops, schema diff, dry run/rollback/delta, palette) and refreshed stats (~11,400 LOC, 48 API actions, 30 components, 215 tests).
- **All 6 Office documents regenerated** (training guides FR+EN with a new "Safety net & new modules" chapter, technical specs with the new module rows and stats, walkthrough deck with the 14-module map) — version-stamped v1.11.7.

## [1.11.6] — 2026-06-12
### Added (Data Loader power-ups)
- **Δ Delta mode** (UPSERT/UPDATE with a key) — Colvio fetches the current org values of the mapped columns up front and **sends only the fields that actually changed**; rows where nothing differs are skipped with status `UNCHANGED`. Tolerant comparison (number/string, boolean, datetime representations). On recurring syncs this slashes write volume and keeps `modifiedon`/audit clean for untouched records. Lookup bindings are always sent.
- **Owner lookups handle teams** — for direct-mode lookups on the polymorphic `ownerid`, each unique GUID is probed (user, then team) and bound to `/systemusers` or `/teams` accordingly. Team-owned imports no longer fail per row.
- **Fixed a 1.11.0 dry-run gap**: in dry runs the UPDATE-only existence gates no longer pre-empt classification — UPSERT dry runs now correctly report *Would create* for missing keys instead of erroring them.
### Roadmap (deliberately deferred, tracked)
- Composite (multi-attribute) alternate keys, resume-after-crash for interrupted runs, and a visual picklist label mapper are designed but not shipped in this arc — each touches the import core and deserves its own focused release with tests.

## [1.11.5] — 2026-06-12
### Added (UX layer)
- **⌘K / Ctrl+K command palette** — fuzzy-jump to any module (permission-filtered) or run quick actions (theme, language, shortcuts). Arrow keys + Enter.
- **"What's new" popup** — after an update, a one-time dialog lists the highlights of the new version (EN/FR, tracked per version, silent on first install).
- **Saved-query sharing** — the Explorer's 📂 saved-queries menu gains Export / Import (JSON): share query packs with colleagues, merged by name on import.

## [1.11.4] — 2026-06-12
### Added (Metadata Browser: schema snapshot & diff ⇄)
- **Export a JSON snapshot of the org's schema** (custom tables by default, or everything) — table by table: column types, requirement levels, custom flags. Progress shown, deterministic file name `schema_<org>_<YYYYMMDD>.json`.
- **Compare a snapshot against the current org**: load a snapshot taken on DEV while connected to UAT/PROD and get a ranked diff — missing tables and columns (HIGH), type mismatches (HIGH), requirement-level differences (MED), elements present only in the target (LOW) — with CSV export for the deployment checklist.
- Help section EN+FR.

## [1.11.3] — 2026-06-12
### Added (new module: System Ops ⚡ — jobs & plugin traces)
- **System Jobs**: the `asyncoperation` monitor with quick filters (Failed / Waiting-Suspended / In progress / Canceled / All recent), expandable details (started/completed, friendly message), and — for System Administrators — **bulk Cancel** (the documented `statecode 3` / `statuscode 32` transition) and **Resume** (from Suspended). Platform-maintenance jobs can't be cancelled (Microsoft restriction) — the error is translated when it happens.
- **Plugin Traces**: the `plugintracelog` viewer — exceptions highlighted, full trace text per entry (the platform caps `messageblock` at 10 KB and trims oldest lines), >2s duration warnings, filter by plug-in/message/entity, exceptions-only toggle, CSV export. The UI documents how to enable logging (System Settings → Customization → Off/Exception/All) and the ~24h auto-purge.
- Tab gated on user-read rights like the other admin modules; Help section EN+FR.

## [1.11.2] — 2026-06-12
### Added (Show All Data: record change history 📜)
- Every inspected record now has a collapsible **"Change history"** panel: the audit timeline (when, which user, which action — formatted labels) with a click-to-expand **field-level diff** (old value → new value, formatted values for lookups/option sets, additions in green, removals in red).
- Implementation grounded in the Microsoft docs: the Web API `RetrieveRecordChangeHistory` **omits the user/date per change** (documented limitation), so Colvio reads the `audits` table for the record and calls `RetrieveAuditDetails` per entry on expand. Requires auditing enabled (org + table) and audit-read privileges — a friendly hint explains this when the query fails or returns nothing.

## [1.11.1] — 2026-06-12
### Added (new module: Recycle Bin ♻)
- **View and restore deleted Dataverse records** — a true server-side restore via the platform's "Keep deleted Dataverse records" feature. Pick a table, see what's in the bin (name, created/modified, id), select and **Restore**; restored records come back with their original values.
- Grounded in the Microsoft docs: the bin is queried through FetchXML with `datasource='bin'` (the only Web API path), restore uses the unbound `Restore` action **by primary key** (platform limitation), and the module detects whether the org has the feature enabled (`recyclebinconfig` row, retention days shown). When disabled, it shows the exact admin-center path to enable it.
- **Documented limitations surfaced in the UI**: records deleted before enablement aren't restorable; retention 1-30 days; **virtual tables, elastic tables, solution-component tables and tables with more than 600 columns are excluded**; cascade-deleted records don't appear — restore the original parent first; conflicts (reused primary key, duplicate alternate-key values, removed choice options) block a restore. Restore failures are translated to actionable messages (e.g. "restore the parent record first").
- Help section EN+FR.

## [1.11.0] — 2026-06-12
### Added (Data Loader: Dry run & Rollback)
- **🔍 Dry run** — a new button next to Load simulates the **entire** import with zero writes: parsing, transforms, lookup resolution and existence classification all run for real, then the report shows row by row what would happen — *Would create / Would update / Would fail (UPDATE 404) / Would delete / Not found* — plus unmatched option-set labels. Works in all 4 modes (DELETE included, without the typed confirmation since nothing is deleted). In UPSERT mode the dry run always resolves key existence, so you see the exact create-vs-update split before committing.
- **↩ Rollback** — Colvio now captures the GUID of every record a run creates (from the `OData-EntityId` batch response headers). After a run that created records, the result panel offers *Rollback created records*: type `ROLLBACK` to confirm, and exactly those records are deleted through the same parallel batch engine (progress shown, per-record errors reported). Creations only — updates keep their new values.
- Help (EN+FR): new "Loader — Dry run & Rollback" section.

## [1.10.28] — 2026-06-12
### Changed
- **API Tester: two-step confirmation on DELETE.** The first Send (button or Ctrl+Enter) arms the button — it turns red and reads "⚠ Confirm DELETE" — and only a second activation within 3 seconds actually sends. It re-arms automatically when the method or path changes. DELETE is the one irreversible method (Dataverse has no recycle bin), and recalling an old DELETE from history + Ctrl+Enter muscle memory made an accidental send realistic. Other methods are untouched — no extra friction on GET/POST/PATCH/PUT. This closes the last destructive surface in Colvio without a UI safeguard (Explorer bulk delete and Loader DELETE mode already require typed confirmations).

## [1.10.27] — 2026-06-12
### Changed (finer permission-aware UI)
- **Translations opens read-only without the publish privilege.** On top of the existing tab gating (solutions read), Colvio now probes `prvPublishCustomization` at startup (new generic `hasPrivilege` action: WhoAmI → privilege id → `RetrieveUserPrivileges`). Without it, the Translations tab stays accessible for **browsing and CSV export**, but label inputs are locked and Save / Import are hidden, with a banner explaining which privilege is missing — no more failed saves discovered at the end of an editing session.
- **Explorer inline edit pre-checks write access.** Double-clicking a cell now verifies your rights via `RetrievePrincipalAccess` (one call per table, cached for the session) — if your roles don't grant write on that table, you're told immediately instead of typing a value and hitting a 403 on Enter. Fail-open on probe errors: Dataverse still enforces server-side.
- Help → Tab Visibility section rewritten (EN+FR) to document exactly which permission unlocks which module.

## [1.10.26] — 2026-06-10
### Changed
- **In-app Help fully rebuilt** (EN + FR): a search bar filters topics; 6 new sections — **API Tester**, **the 4 import modes** (CREATE / UPSERT / UPDATE-only with If-Match / DELETE), **column transforms** (label→value picklists, EU/US dates with time, locale numbers), **performance & speed boosters** (batching, 429 retry, cancel semantics, admin-gated MSCRM headers), **exports & file naming** (incl. why Excel shows the Protected View banner), and a **Troubleshooting / FAQ** (session expired, 404s in UPDATE, unmatched labels, 429, PROD badge, slow imports).
- **Docs refreshed across the board**: README (API Tester section added, Data Loader rewritten around the 4 modes/transforms/boosters, stats and security sections updated to v1.10.25 reality), Chrome Web Store listing (loader + API Tester paragraphs), privacy policy (API Tester history redaction, loader templates, org-scoped cache — and the guarantee that imported file contents are never persisted).

## [1.10.25] — 2026-06-10
### Fixed (full code-review pass — 10 findings)
- **XLSX export: numbers are numbers again.** The 1.10.17 formula-injection guard wrapped every cell in a string, turning numeric columns into text (SUM() = 0) and prefixing a visible apostrophe to negatives. `.xlsx` cells carry explicit types — a string cell holding `=…` is inert — so the guard belongs to CSV only; the XLSX export now writes raw typed values.
- **CSV values are trimmed again.** The RFC-4180 rewrite stopped trimming, so `"a, b"`-style files leaked leading spaces into upsert keys (`' A001'` → no match → duplicate created), lookup GUIDs and field values, and a whitespace-only cell could blank a field on UPDATE.
- **Picklist labels that start with a digit convert correctly.** `"3 - Hot"` was truncated by `parseInt` to option 3 before the label lookup ran; labels are now matched first and numeric passthrough only applies to strictly-numeric values.
- **`date ISO` handles times and US dates.** `13/06/2026 14:30` and `1/2/2026 3:45 PM` now produce valid ISO timestamps (they previously produced malformed strings that 400'd every row); `12/31/2026` auto-detects US month-day order. Unparseable time parts yield an explicit empty value instead of an invalid request.
- **Lookup resolution works for activities & co.** The resolve query `$select`ed `<entity>id`, a permanent 400 for entities whose primary key differs (task/email → `activityid`); combined with 1.10.17's stricter errors this could fail every row. It now selects the match field (Dataverse always returns the PK) — and resolve failures honor the chosen fallback (Skip/Null/Error) instead of always erroring.
- **UPDATE existence-check matches keys reliably.** GUIDs with braces/uppercase from exports are normalized on both sides (previously 100% of rows could be wrongly reported "No existing record"); integer alternate keys are no longer quoted in the filter; one malformed value now degrades to per-value checks and a per-row error instead of aborting the whole import; Cancel works during the check phase.
- **Cancel now reaches the content script.** Cancelling mid-throttle previously let in-flight batches sleep through `Retry-After` waits and re-send their writes (up to ~2 min of unwanted server writes). A run-scoped abort flag stops back-off retries and remaining chunks immediately.
- **429 retry at the right layer.** `dvRequest` (the funnel for lookups, existence checks, single-record ops) now honors `Retry-After` like the `$batch` path — a throttle during the pre-check no longer kills the run.
- **Pasted Excel data parses correctly again.** Delimiter detection treats an unquoted tab as decisive (cells containing commas out-counted the tab and mis-split columns).
- **Per-row request details match what was sent.** The request-log reconstruction now uses the same option-set label→value maps as the actual send (picklist fields no longer show as missing in the log); the option-set preload also runs in parallel.

## [1.10.24] — 2026-06-10
### Changed
- **All export filenames now follow `<object>_<YYYYMMDD>.<ext>`** — e.g. `account_20260610.csv`, `contact_fields_20260610.csv`, `security_role_Sales_Manager_20260610.csv`. Run logs (live log, load log, errors) also append `_HHMMSS` so several runs the same day don't collide. One shared `expName()` helper in shared.jsx replaces the ad-hoc names (`*_export.csv`, `load_errors.csv`, ISO timestamps).

## [1.10.23] — 2026-06-10
### Changed
- **UPDATE relies on `If-Match: *` by default — the existence pre-check is now opt-in (off).** Alternate-key UPDATE is fully supported by Dataverse, and `If-Match: *` (sent on every PATCH) is the documented native mechanism that makes Dataverse return 404 instead of creating when a record is missing — for both GUIDs and alternate keys. So the default UPDATE path adds no extra queries and is fast even on very large updates. The "pre-verify existence" pass remains available as an opt-in safety net for the rare org that doesn't honor `If-Match`. (The creates seen earlier came from pre-1.10.19 bugs — the serial-fallback PATCH missing `If-Match` and empty-key rows routed to create — both fixed.)

## [1.10.22] — 2026-06-10
### Changed
- **UPDATE existence-check is now optional and parallelized.** The "verify which records exist before writing" pass (added in 1.10.20 to guarantee no creates) was sequential — costly on very large updates (~5,000 queries for 400k rows). It now runs ~6 queries in parallel, and there's a checkbox **"Verify each record exists first"** in the UPDATE config:
  - **On (default):** bulletproof — zero creates even if the org ignores `If-Match` on alternate keys.
  - **Off:** relies on `If-Match: *` only (always sent) — no extra queries, fastest. Use once you've confirmed your org honors `If-Match` (test with one non-existent key).

## [1.10.21] — 2026-06-10
### Fixed
- **The upsert/update key is no longer duplicated in the request body.** The alternate key (or GUID) addresses the record in the URL — `entityset(field='value')` — and Dataverse applies that value to the record from the URL, so repeating it in the JSON body was redundant and could 400 if the key field isn't writable. The key is now sent in the URL only; the Preview "D365 record example" and the per-row request details reflect this. (Defense-in-depth: the content script also strips the key field from any body.)

## [1.10.20] — 2026-06-10
### Fixed (UPDATE mode now never creates — guaranteed)
- **UPDATE mode pre-checks which keys exist and skips the rest.** Relying on `If-Match: *` alone was not enough: some orgs don't honor the precondition when the record is addressed by an **alternate key**, so an UPDATE could still upsert (create) missing records. Colvio now queries which key values actually exist before writing, PATCHes only those, and reports every missing key as a per-row ERROR — so no create can happen regardless of how the org handles `If-Match`. `If-Match: *` is still sent as a second layer. (Adds an existence-check pass at the start of an UPDATE; the import aborts safely if that check itself fails, rather than risking accidental creates.)

## [1.10.19] — 2026-06-10
### Fixed (UPDATE mode is now strictly update-only)
- **Serial-fallback path didn't carry `If-Match: *`.** If the `$batch` endpoint failed and Colvio fell back to per-record PATCH, an UPDATE-mode import would silently upsert — creating records that don't exist. The fallback now passes `If-Match: *` (and `dvRequest` accepts extra headers), so it still 404s instead of creating.
- **Rows with an empty key value were routed to CREATE even in UPDATE mode.** Such a row can't target a record, so it's now reported as a per-row ERROR instead of being inserted. Result: UPDATE mode only ever updates existing records — a missing id/alt-key (or empty key) always yields an error, never a create.

## [1.10.18] — 2026-06-10
### Changed
- **Smaller initial bundle: the xlsx library is now lazy-loaded.** It's only fetched when an Excel file is actually dropped (Data Loader) or an XLSX export is run (Data Explorer). The panel bundle drops from ~890 KB to ~492 KB; the ~430 KB xlsx chunk loads on demand. Faster panel open for the common (no-Excel) case.
- **Data Loader: unmatched option-set labels are now reported.** When a `picklist`/`statecode` column uses a label that matches no option value, the result panel lists exactly which labels in which fields didn't convert (instead of those cells being silently left empty).

## [1.10.17] — 2026-06-10
### Fixed (data-integrity audit)
- **Data Loader: robust RFC-4180 CSV parser.** The previous parser did `split("\n")` then `split(delimiter)` and stripped all quotes — so a cell like `"Acme, Inc."`, an embedded newline, or escaped quotes silently mis-split into the wrong columns, corrupting every column after it. Replaced with a proper quoted-field parser that preserves each value as its exact string (leading zeros and SAP-style codes survive). Excel files now read straight to rows (no CSV round-trip that re-introduced the bug). Auto-detects `,` / `tab` / `;`.
- **Decimal locale.** The `float` transform now handles EU formats (`1,5` → 1.5, `1.234,56` → 1234.56) and strips thousands spaces, instead of `parseFloat` silently truncating at the first comma.
- **Lookup resolution no longer hides transient errors.** A 403/timeout/500 during resolve-mode lookup is now reported as an explicit per-row ERROR instead of being treated as "record not found" and silently skipped.
- **Formula-injection guard** added to the Explorer XLSX export and the Login History CSV export (the CSV exports already had it); also applied to the Loader log exports.
### Security / privacy
- API Tester history redacts secret-bearing headers (`Authorization`, `Cookie`, `x-api-key`, …) before writing to local storage.
### Internal
- Extracted the pure loader logic (CSV parsing, value transforms, EntitySetName resolution) into `src/loaderUtils.js` and added **31 unit tests** (169 total). De-duplicated the live-log writer across the 4 import modes; standardized EntitySetName resolution on one helper.

## [1.10.16] — 2026-06-10
### Fixed (audit hardening — D365 correctness + security)
- **Lookup binding now uses the real EntitySetName** instead of naive `logical + "s"`. This fixes `@odata.bind` (and the resolve-mode GET) for irregular plurals (`opportunity` → `opportunities`, not `opportunitys`) and abstract polymorphic targets (`owner` now binds to `/systemusers`, not the invalid `/owners`). Resolved via the already-loaded entity metadata.
- **Loader now knows which fields are writable.** `getFields` returns `IsValidForCreate` / `IsValidForUpdate`; a new pre-flight check warns when a read-only / calculated / rollup field is mapped for the current mode (CREATE/UPSERT vs UPDATE) — these would otherwise fail with a 400 on every row.
- **Picklist / State columns can convert option *labels* → values.** When the `picklist` or `statecode` transform is chosen, Colvio pre-loads the field's OptionSet and maps CSV labels (e.g. "Chaud") to the option value, instead of silently dropping non-numeric values.
- **`date ISO` transform is timezone- and format-safe.** Date-only `yyyy-mm-dd` is kept verbatim (no more UTC-midnight day shift), and `dd/mm/yyyy` / `dd-mm-yyyy` (FR/EU) are parsed explicitly instead of being misread or dropped.
- **429 (Service Protection) backoff on bulk loads.** `$batch` requests now honor `Retry-After` and retry instead of surfacing a throttle as a per-row error.
### Security (defense-in-depth)
- API Tester: the final request URL is re-validated against the org host after path assembly (blocks protocol-relative / backslash drift, on top of the existing same-origin guard).
- `upsert` single-record path strips control chars from the key value (parity with the batch builders).
- `background.js` only accepts runtime messages from the extension's own pages (`sender.id` check).

## [1.10.15] — 2026-06-09
### Added
- **Data Loader: DELETE mode** (fourth import mode). Bulk-delete records identified by primary key (GUID) or alternate key from a CSV — same parallel `$batch` engine, per-row log, request details, and cancel as the other modes.
  - **Safety rails (destructive, irreversible):** red warning banners; a **typed confirmation** on the Preview step (you must type the target entity's logical name) before the Delete button is enabled; Speed boosters are not applied (server-side logic stays active by default); the red "🗑 Delete records" button replaces "Load".
  - Rows whose key matches no record fail with a 404 (visible per row). Empty key values are skipped.
  - The result panel shows a "Deleted" count; the live log counts "deleted"; per-row request details show the `DELETE /entityset(key)` URL.
  - New `batchDeleteKeyed` action (content.js) + bridge wrapper with the same worker pool as `batchUpsert`.

## [1.10.14] — 2026-06-09
### Added
- **Data Loader: per-row request details in the import log.** Click any row in the live log or the result Import Log to expand the exact Dataverse request that was sent for it — HTTP method (POST/PATCH), the request URL (incl. the alt-key/GUID and `If-Match: *` for UPDATE), and the JSON payload (the mapped D365 attributes with their transformed values and `@odata.bind` lookups).
- **Exported logs now include Method, Request URL, and Payload columns** (both "Export current log" and "Download Log"), so the saved CSV is a full audit of what was sent per row — ideal for diagnosing failures offline.
- Request details are reconstructed on demand from the original CSV row + mapping config (nothing extra stored per row → no memory impact on large imports). Resolve-mode lookup GUIDs aren't retained after the run, so those bind values show `<resolved at runtime>`.

## [1.10.13] — 2026-06-09
### Added
- **Data Loader: UPDATE mode** (third import mode alongside CREATE and UPSERT). UPDATE only modifies records that already exist — rows whose key matches no record **fail instead of being created** (uses the `If-Match: *` header on each PATCH). Useful when you want to enrich/correct existing data without accidentally inserting new rows. The key configuration is shared with UPSERT; the Preview reassurance sentence, mode tile, and live counters reflect the chosen mode. UPDATE is also saved/restored in mapping templates.

## [1.10.12] — 2026-06-09
### Added
- **API Tester: multiple request tabs** (like Salesforce Inspector's multiple query tabs). Open several requests side by side — each tab keeps its own method, URL, headers, body, and response. "+ New" to add a tab, ✕ to close, double-click a tab to rename. Switching tabs preserves every tab's state.
### Changed
- **Data Loader: faster import + snappier cancel.** Each batch chunk is now sent as a single HTTP `$batch` roundtrip instead of being re-split into sequential 100-record sub-batches inside the content script. This means fewer Dataverse roundtrips (faster import) and a much quicker cancel — a worker drains in one roundtrip rather than several before it sees the abort. Batch size now reflects the real `$batch` size (1–500; the previous 1000 max gave no throughput benefit because the content script capped HTTP batches at 100). The default 200 is unchanged but now genuinely sends 200 records per roundtrip.

## [1.10.11] — 2026-06-09
### Added (Data Loader UX — less tedious to fill in, batch 2)
- **Saved mapping templates.** Configure a mapping once, save it as a named template, and reload it next time in one click — column mapping + transforms + parent lookups + upsert key + performance settings are all restored. Stored locally per entity (`chrome.storage.local`), up to 50 templates.
  - "💾 Save this mapping as a template" on the Preview step.
  - "📋 Templates" dropdown on the Mapping step lists templates for the current entity (with column/lookup/mode/date summary and a delete button).
  - Templates apply **only within the same entity** (no metadata reload, no risk to the in-progress config). Mapping is matched by CSV column name; if the file or the entity changed since the template was saved, columns/fields that no longer exist are reported (not silently mis-applied) instead of failing.
  - This goes beyond Salesforce Inspector, which re-derives mapping from headers every time and has no saved templates.

## [1.10.10] — 2026-06-09
### Changed (Data Loader UX — less tedious to fill in, batch 1)
- **Empty Lookups step is now skipped.** When no parent lookups are detected, the Mapping "→" button goes straight to Preview, and the Lookups stepper node is dimmed/labelled "(none)" and not clickable. No more clicking through an empty step.
- **Pre-flight checks on Preview.** A non-blocking warning panel surfaces misconfigurations *before* Run instead of as mass errors at the end: required D365 fields not mapped, lookups with no key field (would silently skip), option-set columns with no transform chosen, UPSERT with no CSV key column. Warnings only — you can still load if it's intentional.
- **Plain-language reassurance sentence on Preview.** Above the technical JSON example, a clear statement of exactly what Load will do: e.g. "Will UPSERT 12,400 records into Account — existing records matched on `fou_sapcustomernumber` are updated, the rest are created." Echoes a booster warning when Speed boosters are active.

## [1.10.9] — 2026-06-09
### Added
- **Data Loader: import start/finish timestamps** — the launch date & time is shown live during the run ("🕐 Started …") and on the result panel ("🕐 Started … 🏁 Finished …"). Both are also written into the exported log CSV summary header.
### Fixed
- **Data Loader: cancel message no longer hardcodes "100 records"** — now reflects the actual in-flight ceiling (batch size × threads).

## [1.10.8] — 2026-06-09
### Fixed (audit pass — security + correctness)
- **CRITICAL (regression in 1.10.7): unbounded live-log memory → tab crash on large imports.** The live import log kept every processed row (with its full CSV row object) in React state and spread-copied the whole growing array on every progress callback — O(n²) churn and ~1GB+ retained on a 600k-record import. Now a lightweight `fullLog` ref records every row (`{csvRowNumber, status, msg}` only, ~a few MB for 600k), while React state holds a bounded 2000-row buffer for the live table. The full log powers "Export current log" and the final "Download Log" (columns reconstructed from the parsed CSV at export time).
- **HIGH (security): HTTP-request/changeset injection via the upsert key value.** In `batchUpsert`, the alt-key / primary-key value flowed into the multipart `$batch` request line with only single-quote escaping. A key column containing `\r\n` (malformed or hostile CSV) could break out of its changeset and inject arbitrary operations. Now control characters are stripped from the key value, and primary-key (GUID) values are reduced to GUID characters only — neutralizing path/CRLF injection without aborting the batch (a bad value yields a clean per-record error instead).
- **HIGH (correctness): final Import Log fabricated row numbers.** The result log was rebuilt from success *counts* (`1..N` synthetic rows) instead of the real per-row results, so "OK" rows didn't map to actual CSV lines. It's now built from the real per-row `fullLog`, with accurate CSV line numbers, capped at 5000 in the table (note shown) — the full set is always available via Download Log.
- **MED (API Tester): URL preview and "Copy as cURL" showed no origin.** `fullUrl` read `orgInfo.clientUrl`, which only exists on the standalone mock; the extension exposes `orgUrl`. Now falls back through both, so the displayed URL and cURL command include the real org host.
- **MED (API Tester): history robustness.** Loading history now validates it's an array (a corrupted/older shape previously crashed the whole tab on render). Saving uses a functional state updater so two quick sends can't drop an entry.
- **LOW (theme): `localStorage` access in the OS-theme listener is now wrapped in try/catch** — no longer throws on every OS theme change in private/blocked-storage contexts.

### Known / accepted (reviewed, low risk)
- OData `$filter`/`$select` in the `query` action are interpolated without operator whitelisting — scoped to the user's own session privileges (no cross-tenant/privilege escalation), acceptable for a developer tool. The Builder mode sanitizes numeric/GUID/string values against injection.
- `$batch` response parsing splits on a `Content-Type: application/http` marker; a Dataverse error message containing that exact literal could mis-number a row in the log (cosmetic, very low probability). Padding logic bounds the impact.

## [1.10.7] — 2026-06-05
### Changed
- **Data Loader: Target entity picker is now searchable**
  - Replaced the dropdown listing all entities alphabetically with an autocomplete-style search input. Type any part of the display name or logical name to filter in real time. Much faster on orgs with 200+ entities.
  - Click outside or press Escape to dismiss without changing the selection. List capped at 200 visible matches with a hint to narrow down further.
- **Data Loader: Live import log keeps the full log in memory (no more 100-row cap)**
  - Previously, only the last 100 processed rows were kept in the live log state — older rows were lost during the import.
  - Now all rows are kept; the rendered DOM portion is capped at 2000 rows for browser perf, but the full log lives in memory.
  - New **Export current log** button in the live log header — downloads a CSV of every row processed so far, with all CSV columns + Success/Failed status + Dataverse error detail. Available mid-import or after completion.

## [1.10.6] — 2026-05-28
### Fixed
- **API Tester: History entries didn't visibly pre-fill the form**
  - Clicking a history (or template) entry now triggers a brief cyan border highlight on the request form for 700ms, so the user sees that the click took effect.
  - Defensive guards added on `loadHistory` and `loadTemplate`: missing or non-string fields in stored entries default to safe values (no more potential `undefined` reaching `setState`).
  - Headers values coerced to strings via `String(value ?? "")`.

## [1.10.5] — 2026-05-28
### Changed
- **Speed boosters: hidden for non-admin users**
  - The MSCRM bypass headers (`BypassCustomPluginExecution`, `SuppressDuplicateDetection`, `BypassSynchronousLogic`) require the `prvBypassCustomPlugins` privilege, granted by the System Administrator role.
  - Colvio now probes the current user's roles at connect time (new `isSystemAdmin` bridge action: `WhoAmI` → `systemusers(<id>)/systemuserroles_association` filtered by `name eq 'System Administrator'`) and sets `permissions.canBypassPlugins`.
  - The Speed boosters block in the Data Loader Preview step is hidden entirely for users without the role — no feature visibility they can't use, no need for Dataverse to return 403 mid-import.
  - Defense in depth: even if the toggles were somehow flipped on, the `doLoad` flow forces them to `false` for non-admin users before sending to the bridge.

## [1.10.4] — 2026-05-21
### Added
- **Data Loader: Speed boosters — server-side bypass headers**
  - New section in the Preview step with three opt-in toggles, each mapping to a Microsoft-documented `MSCRM.*` header injected on every individual request inside the multipart `$batch`:
    - **Bypass custom plugins** → `MSCRM.BypassCustomPluginExecution: true` — skips all custom plugins (sync + async). Typical gain: 100-500ms per record on orgs with active plugins.
    - **Suppress duplicate detection** → `MSCRM.SuppressDuplicateDetection: true` — skips duplicate-detection rules. Typical gain: 50-200ms per record.
    - **Bypass synchronous workflows** → `MSCRM.BypassSynchronousLogic: true` — broader scope, also covers sync workflows.
  - Warning banner appears when any booster is enabled (skipped business logic, requires `prvBypassCustomPlugins` privilege — typically System Administrator).
  - All boosters are off by default for safety.

## [1.10.3] — 2026-05-20
### Changed
- **Environment detection: now uses Microsoft's authoritative `OrganizationType`** instead of URL guessing
  - On connect, Colvio calls the `RetrieveCurrentOrganization` Web API bound function and reads `Detail.OrganizationType` (an enum returned by Dataverse itself)
  - Recognized values: `Production`, `Sandbox`, `CustomerTest` (→ UAT), `Trial`, `Preview`, `Support`, `Developer`, `Default`, `BCS`
  - Falls back to the URL heuristic only if the API call fails (older D365 versions, restricted permissions)
  - The badge tooltip now indicates the detection source: "Detected via Microsoft API (OrganizationType=CustomerTest)" or "Detected via URL pattern matching"
  - The connect call also captures `EnvironmentId`, `TenantId`, `Geo`, friendly name, and version for use across modules
- **`getContext` bridge call** now returns enriched org info — includes the Dataverse-authoritative env metadata in addition to the basic URL/orgName

## [1.10.2] — 2026-05-20
### Fixed
- **PROD/Sandbox detection: stop crying wolf on UAT, TEST, RECETTE, etc.**
  - Previously, the badge logic only checked `sandbox` and `dev` substrings in the URL — any URL like `org-uat.crm4.dynamics.com` was flagged as PROD (false positive).
  - New `detectEnv()` recognizes 14 non-prod indicators (sandbox, dev, test, uat, qa, staging, preprod, recette, demo, training, sit, trial, preview, hotfix) with word-boundary matching (surrounded by `-` or `.` so legit prod names like `interface.org.com` don't false-positive on `int`).
  - **Badge now shows the actual env type**: "UAT", "TEST", "RECETTE", "STAGING" instead of a generic "SANDBOX". Still red+⚠ for true PROD, green for everything else.

## [1.10.1] — 2026-05-20
### Added
- **API Tester: line numbers in the JSON body editor** — left gutter with synced scrolling, font-matched line-height for vertical alignment
- **API Tester: JSON error messages now include line numbers** — `"Unexpected token } at position 47"` becomes `"... (line 5)"`, so the user can jump straight to the issue using the gutter
- **API Tester: line count badge** — "✓ Valid JSON · 14 lines" when the body parses correctly

## [1.10.0] — 2026-05-20
### Added
- **New module: API Tester** — Postman-equivalent for Dataverse, built right into Colvio
  - Method picker (GET / POST / PATCH / PUT / DELETE) with color-coded indicator
  - URL field with the `/api/data/v9.2/` prefix shown as a fixed label (less typing, less typos)
  - Headers builder with autocomplete for common Dataverse headers (`Prefer`, `MSCRM.SuppressDuplicateDetection`, `MSCRM.BypassCustomPluginExecution`, `If-Match`, etc.)
  - JSON body editor with live validation + Format button (auto-indent)
  - Response panel: status code badge (colored by 2xx/3xx/4xx/5xx), elapsed time, body size, JSON-pretty-printed body, response headers table
  - **No auth setup needed** — uses your active D365 session cookies (same as the rest of Colvio); requests are scoped to your current org
  - **Templates** — 7 ready-to-go examples (WhoAmI, sample GET, CREATE, PATCH, UPSERT by alt-key, DELETE, etc.)
  - **History** — last 50 requests stored locally (chrome.storage.local), click any past request to reload it as the current draft
  - **Copy as cURL** for sharing in tickets / Slack / docs
  - Keyboard shortcut: Ctrl/Cmd+Enter in the URL field sends the request
  - **Same-origin guard** in content.js: requests are blocked if the target URL is not your active D365 host (no exfiltration risk)

## [1.9.6] — 2026-05-06
### Fixed
- **Data Explorer: stale FieldPicker state across entity changes**
  - When switching from one entity to another in Builder mode, the FieldPicker (popup that lists columns) kept its local search text, type filter, and "Custom only" toggle from the previous entity. The new entity's fields loaded correctly but appeared filtered/empty because the previous criteria still applied.
  - Fix: keyed the FieldPicker by entity logical name so React re-mounts a fresh instance with cleared filters whenever the user switches entity. Also applied the same pattern to ExpandCard's FieldPicker for safety.

## [1.9.5] — 2026-05-06
### Added
- **Metadata Browser: Export All Fields**
  - New CSV export button next to the existing OptionSets export
  - Columns: Logical Name, Display Name, OData Name (for $select), Type, Required, Custom
  - Available for any selected entity (not just those with picklists)
  - OData Name correctly reflects the `_logicalname_value` convention for Lookup/Customer types — paste directly into a `$select` clause
  - Useful for data dictionaries, documentation, custom field audits, and query-building

## [1.9.4] — 2026-05-03
### Added
- **Data Loader: massive overhaul**
  - Excel (XLSX/XLS) file support — drag-drop or paste, parsed via SheetJS to first sheet → CSV pipeline
  - Multipart `$batch` HTTP with **per-record changesets** for `batchUpsert` (was serial PATCH) and `batchCreate` — errors no longer cascade across the chunk
  - **Parallel worker pool** in bridge (CONCURRENCY=5, default) — ~5× speedup vs sequential
  - **Tunable performance** in Preview step: batch size (1-1000) × threads (1-10), defaults 200 × 6
  - **Live per-row import log** during the run: every line shown with its CSV columns + Success/Failed status + Dataverse error detail (last 100, newest first, content-driven column widths)
  - **Cancel mid-import** with graceful in-flight batch completion, partial-result preserved
  - **Alt-key direct bind** for Parent Lookups: when the lookup key is a registered alternate key on the target entity, skip the resolve query (no `?$filter=...` per unique value) and bind via `entity(field='value')` syntax — eliminates O(N unique values) extra GETs
  - **Smart upsert key dropdown**: alt-keys at top (recommended), primary key, then other fields. Default picks first alt-key over PK
  - **Smart parent lookup field dropdown**: shows all lookup fields on the load target with their target entity (`fou_accountextension → fou_accountextensionaviation`), auto-fills target entity on selection
  - **Auto-skip Lookup-type fields** in the Mapping step — prevents accidental writes to lookup `_value` columns that need `@odata.bind`
  - Auto-detect of dot-notation parent lookups now uses real D365 metadata (`bridge.getLookups`) instead of naive prefix-as-entity heuristic
  - Bridge: chunked IPC payloads (auto-splits batches > 500 records to stay under Chrome's 64 MB sendMessage cap)
  - New bridge action `getEntityKeys` (lists registered alternate keys for an entity)
- **Data Explorer: per-expand $filter**
  - Collection-typed expands (1:N) get a dedicated FILTER section in the ExpandCard with type-aware operators (string/numeric/date/lookup), AND/OR logic, identical UX to main WHERE
  - Single-valued expands (N:1) hide the filter section (Dataverse rejects $filter there)
  - Filters persisted in saved queries

### Fixed
- **Pagination silently capped at 5001 records** when filter expression contained parentheses (e.g. `(_field_value eq null)`). Root cause: `isDirectFetch` regex in `query` action used naive `path.includes("(")` which matched parens in `$filter` clause too — same bug already fixed in `queryRaw`. Tightened to `/^[^?]*\(/` (only matches paren before `?` query string)

## [1.9.1] — 2026-04-03
### Added
- Schema (ERD) tab: interactive Entity Relationship Diagram with multi-entity canvas, drag/zoom/pan, bezier relationship lines, expand/collapse cards, Tables/Fields toggle, Add Related button
- Schema export: PNG (2x retina), SVG (vector), Mermaid (.mmd) with auto-bounding box
- Translation Manager: non-renameable fields shown as read-only with lock icon (IsRenameable check)

### Fixed
- Translation Manager: fix label save — use GET+PUT pattern with typed cast and MSCRM.MergeLabels header (previous PATCH/SetLocLabels approaches returned HTTP 405/400)
- Translation Manager: lock non-renameable fields as read-only (IsRenameable check + lock icon)
- Translation Manager: show error message in UI on save failure
- Theme system: fix toggle regression — setThemeColors called before render, theme prop passed to all 11 tabs for instant re-render
- Theme system: dark mode by default on first launch (no flash)
- Theme audit: 38 findings fixed — Spin component, bt() helper, option elements, error backgrounds, type badges all use C.xxx tokens
- Custom field detection: exclude Microsoft solution prefixes (msdyn_, mspp_, msfp_, adx_, etc.) from "Custom only" filters
- Sidebar logo: use magnifying glass icon instead of lightning emoji
- Icons: all PNGs regenerated from SVG source
- content.js: include PUT in isWrite check for correct timeout handling

## [1.9.0] — 2026-03-27
### Added
- SQL query mode: 4th mode in Explorer (Builder | OData | FetchXML | SQL), recursive descent SQL parser, translates to FetchXML for reliable pagination
- Role-based tab access control: permission probes during connection phase, sensitive tabs hidden for non-admin users (zero flash)
- Help tab updated with 5 new sections (Login History, Users & Licenses, Security Audit, SQL Mode, Tab Visibility)
- Solution Explorer: resolve all 13 component types to display names
- User & License Monitor tab: load all D365 users with full pagination (no limit), display Access Mode, CAL Type, Business Unit, security roles, last login date
- Filter users by Active/Disabled/Non-Interactive, search by name/email/BU, sort by Name/Status/CAL/Access
- User detail panel: security roles list, last login from audit logs with "X days ago" indicator, Access Mode + CAL Type breakdown stats
- CSV export of full user list with formula injection protection
- Security Audit tab: browse all security roles with privilege viewer
- Readable privilege labels (prvDeleteAccount → Delete · Account)
- Org-level and sensitive privilege flags (30+ critical privileges detected)
- Privilege depth badges (User, BU, Parent:Child, Organization)
- Global privilege cache (loaded once, instant on subsequent role clicks)
- RetrieveRolePrivilegesRole OData function for accurate privilege retrieval
- 5 new API actions: getAllUsers, getUserRoles, getUserLastLogin, getAllRoles, getRolePrivileges
- ~25 i18n keys (EN + FR)

### Fixed
- OData mode now executes the raw user-typed OData URL instead of silently using Builder parameters
- FetchXML pagination: auto-fallback to page-number-only mode when paging cookie mismatch (0x80041129)
- getAllUsers: full pagination via @odata.nextLink, orderby=systemuserid for stable paging, 5min timeout

## [1.8.1] — 2026-03-26
### Security
- OData filter injection: validate numeric values (regex) and GUID format for Lookup/Customer types before unquoted insertion; invalid values fall back to quoted strings
- Bulk Update now requires confirm() dialog showing field, value, and record count
- CSV/TSV export: prefix formula-triggering characters (=, +, -, @) with single quote to prevent spreadsheet injection
- Query history strips $filter values before persisting to avoid storing PII
- D365 error messages parsed as JSON to extract user-facing message only (no server internals leaked)
- Content script fingerprint changed to non-enumerable property (anti-fingerprinting)
- Content Security Policy added to panel.html

### Fixed
- OData mode now executes the raw OData URL instead of silently using Builder parameters
- FetchXML pagination: auto-fallback to page-number-only mode when D365 returns paging cookie mismatch error (0x80041129), fixing systemuser and other plugin-affected entities
- 13 cross-feature state bugs fixed:
  - Explorer: race condition on fast entity switch (generation counter)
  - RelationshipGraph: depth-2 fetch loop not cancelled on re-selection
  - History click now restores mode (builder/odata/fetchxml)
  - loadSavedQuery/QueryTemplates: replaced setTimeout(500ms) with onFieldsReady callback
  - Results: sort/selection reset on new query
  - Loader: stale targetFields after entity change (generation counter)
  - TranslationManager: confirm dialog on unsaved edits before entity switch
  - LoginHistory: search timer moved from useState to useRef
  - Sidebar history stores mode and switches tab correctly

## [1.8.0] — 2026-03-26
### Added
- Help tab: built-in feature guide accessible from navigation
- Onboarding tour: 5-step first-launch walkthrough (persisted in localStorage)
- Keyboard shortcuts panel: Ctrl+/ to view all shortcuts
- Contextual tooltips: ? buttons on key features explaining what they do
- Query Templates: 5 pre-built queries for common consultant tasks
- Export feedback: shows row count after CSV/XLSX export
- Solution Explorer: resolve ALL 13 component types to display names (Entity, Attribute, OptionSet, Relationship, View, Chart, Web Resource, Plugin Type/Assembly, SDK Step, Security Role, Connection Role, Canvas App)
- Relationship Graph: section labels repositioned above cards with count badges
- ~60 new i18n keys (EN + FR)

### Fixed
- 30 production audit fixes (console.error removal, stale closures, missing deps, render-time side effects)
- French text remnants ("Tout", "Inspect un record") replaced with English
- RelationshipGraph labels no longer overlap entity cards
- Entity lists no longer capped at 50 in RelationshipGraph and TranslationManager
- Unused imports/exports cleaned across 7 files
- lang="fr" corrected to lang="en" in panel.html

## [1.7.0] — 2026-03-24
### Added
- Component architecture: split monolithic app.jsx into 15 component files
- Error boundaries: graceful crash recovery per tab
- i18n: English/French locale toggle
- Keyboard navigation: arrow keys in results table, Escape closes modals
- Session expired detection with reconnect banner
- Client-side rate limiting (10 req/sec max)
- System theme detection (prefers-color-scheme)
- Relationship Graph: N:N relationships + depth control (1-2 levels)
- Solution Explorer: component count badges
- Bulk delete safety: CanBeDeleted pre-check + typed confirmation

### Security
- OData injection: sanitizeSearchTerm for search inputs
- Input validation on all new API endpoints
- Rate limiting prevents API abuse

## [1.6.0] — 2026-03-24
### Added
- Relationship Graph tab: visual SVG entity relationship viewer
- Solution Explorer tab: browse D365 solutions and components
- Translation Manager tab: view/edit field labels, CSV export/import
- 6 new API endpoints (getSolutions, getSolutionComponents, getOrgLanguages, getAttributeLabels, updateAttributeLabel, publishEntity)
- Fix isExtension detection (chrome.runtime.id check)

## [1.5.0] — 2026-03-23
### Added
- Dark/Light theme toggle with localStorage persistence
- Query History: auto-save last 20 queries
- Bulk Update: select records and PATCH a field on all
- Bulk Delete: select and delete records with confirmation
- Export All OptionSets: bulk CSV export of Picklist/State/Status values

## [1.0.0] — 2026-03-15
### Added
- Data Explorer: query builder with SELECT, WHERE, EXPAND, LIMIT
- FetchXML mode with templates
- OData URL mode
- Virtual scrolling (60fps on 10,000+ records)
- Show All Data: record inspector
- Metadata Browser: entities, fields, OptionSets
- Login History: audit timeline with CSV export
- Data Loader: 5-step wizard with $batch OData
- XLSX, CSV, JSON export
- Saved queries (chrome.storage)
- Chrome Extension Manifest V3
