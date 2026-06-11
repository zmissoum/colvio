// Generates Colvio_Security_Audit.docx — the June 2026 audit report.
// Run: node gen-security.js
const { h1, h2, p, note, bullets, pageBreak, table, img, coverAndToc, buildDoc, writeDoc } = require("./helpers");

const VERSION = "v1.10.26";
const c = [];

c.push(...coverAndToc({
  title: "Security & Data-Handling Audit", subtitle: "Full audit report — scope, methodology, findings and resolutions",
  version: `Audited through ${VERSION}`, date: "June 2026", tocTitle: "Contents",
}));

c.push(h1("1. Executive summary"));
c.push(p("Colvio underwent a **complete four-dimension audit** (security, D365 logic, data handling/privacy, code quality) followed by a **seven-angle code review** of all changes. Result: **zero open critical or high findings**. Every issue identified during the audit was fixed and shipped (versions 1.10.16 through 1.10.25), each fix verified by the project's automated test suite (207 tests)."));
c.push(...bullets([
  "**No critical security vulnerabilities** were found at any point: no XSS, no token handling, no external data egress, no injection path reaching Dataverse unvalidated.",
  "The audit's HIGH findings were **D365 correctness bugs** (not exploitable security flaws) — all fixed.",
  "The **\"zero data collection\" claim was independently verified as true**: every network request targets the user's own Dataverse org.",
]));

c.push(h1("2. Scope & methodology"));
c.push(p("Audited surface: the entire extension — content script (privileged), service worker, React panel (12 modules), bridge layer, storage, exports, and the Data Loader bulk engine."));
c.push(...bullets([
  "**Dimension 1 — Security**: injection paths (OData, CRLF in $batch, XSS), origin enforcement, permissions, messaging surface, secrets handling.",
  "**Dimension 2 — D365 logic**: Web API semantics (upsert/If-Match, alternate keys, EntitySetName, polymorphic lookups), Service Protection limits.",
  "**Dimension 3 — Data handling & privacy**: egress verification, local persistence inventory, silent data-loss paths, export integrity.",
  "**Dimension 4 — Code quality**: error handling, React correctness, duplication, test coverage.",
  "Follow-up: a **7-angle adversarial code review** (line-by-line, removed-behavior, cross-file tracing, reuse, simplification, efficiency, altitude) over every change shipped during the audit, with independent verification of each finding.",
]));

c.push(h1("3. Data flow & egress verification"));
c.push(img("architecture.png", 640, "Architecture"));
c.push(p("Every `fetch` in the codebase was enumerated and verified to target `<org>.dynamics.com` with `credentials:\"same-origin\"`. There is **no analytics, no telemetry, no error reporting service, no CDN, no external font or script**. The only network destination is the user's own Dataverse org, authenticated by the existing browser session — no token is extracted or stored."));
c.push(note("Verified claim: \"No data leaves your browser.\" — CONFIRMED at code level, all call sites reviewed."));

c.push(h1("4. Defense in depth"));
c.push(img("security.png", 620, "Defense in depth"));
c.push(...bullets([
  "**Input validation (content script)** — entity and field names regex-validated; GUIDs format-checked; control characters stripped from key values, making the multipart $batch request line CRLF-injection-proof.",
  "**Same-org enforcement** — the API Tester validates the host when parsing the path and **re-validates the final assembled URL**; protocol-relative or backslash-normalized escapes are caught.",
  "**Update-only guarantee** — UPDATE mode sends `If-Match: *` on every PATCH (batch and serial fallback), rejects empty-key rows client-side, and offers an optional existence pre-check: no code path can create a record in UPDATE mode.",
  "**Messaging surface** — the service worker rejects messages whose `sender.id` differs from the extension; the content-script marker is non-enumerable (anti-fingerprinting).",
  "**Privilege gating** — MSCRM bypass headers (speed boosters) are only exposed after a positive `prvBypassCustomPlugins` (System Administrator) probe; Dataverse re-enforces server-side regardless.",
  "**Export hygiene** — CSV cells are prefixed against spreadsheet formula injection; XLSX exports use typed cells (strings are inert in the xlsx format); filenames are deterministic (`object_YYYYMMDD`).",
  "**Secrets** — API Tester history redacts `Authorization`, `Cookie` and API-key headers before persisting; query history strips filter values.",
]));

c.push(pageBreak(), h1("5. Findings & resolutions"));
c.push(p("All findings from both audit passes, with the version that shipped each fix. Severity reflects the original assessment."));
c.push(table(
  ["#", "Severity", "Finding", "Resolution", "Shipped"],
  [
    ["1", "HIGH (logic)", "Lookup `@odata.bind` built as naive `logical+\"s\"` — broken for irregular plurals (opportunity) and polymorphic targets (owner)", "Real `EntitySetName` resolved from metadata; abstract-target map", "1.10.16"],
    ["2", "HIGH (logic)", "Non-writable fields (calculated/rollup) offered in mapping → per-row 400s", "`IsValidForCreate/Update` surfaced; pre-flight warning per mode", "1.10.16"],
    ["3", "HIGH (data)", "Naive CSV parser mis-split quoted cells (\"Acme, Inc.\") — silent column-shift corruption", "RFC-4180 character-level parser + direct Excel row reading; unit-tested", "1.10.17"],
    ["4", "MED (data)", "EU decimal formats truncated (`1,5` → 1)", "Locale-aware float/int transforms", "1.10.17"],
    ["5", "MED (sec)", "API Tester history stored secret headers in clear", "Redaction before persistence", "1.10.17"],
    ["6", "MED (sec)", "XLSX / LoginHistory exports lacked formula-injection guard", "Guard applied; later refined to typed XLSX cells (see #9)", "1.10.17 / 1.10.25"],
    ["7", "HIGH (logic)", "UPDATE mode could create: serial fallback missing `If-Match`, empty-key rows routed to CREATE", "If-Match on fallback; empty keys rejected; existence pre-check option", "1.10.19 / 1.10.20"],
    ["8", "MED (logic)", "Upsert key duplicated in request body (400 risk on non-writable keys)", "Key is URL-only; content script strips it as defense", "1.10.21"],
    ["9", "HIGH (review)", "XLSX export guard regression turned numbers into text (SUM()=0)", "Raw typed cells restored — guard correctly scoped to CSV only", "1.10.25"],
    ["10", "HIGH (review)", "RFC-4180 rewrite dropped value trimming — stray spaces in keys could create duplicates in UPSERT", "Trim restored at ingestion; normalization both sides of existence check", "1.10.25"],
    ["11", "MED (review)", "Digit-prefixed picklist labels (\"3 - Hot\") truncated by parseInt to wrong option", "Label lookup before strict numeric passthrough; unmatched labels reported", "1.10.25"],
    ["12", "MED (review)", "Cancel didn't reach in-flight 429 retries — writes could continue after cancel", "Run-scoped abort flag in content script; retries and chunks stop immediately", "1.10.25"],
    ["13", "MED (review)", "date transform produced invalid ISO with time components", "Proper time parsing (24h/AM-PM), US format auto-detect", "1.10.25"],
  ],
  [0.5, 1.1, 3.2, 2.6, 0.9]
));

c.push(pageBreak(), h1("6. Local storage inventory"));
c.push(p("Everything Colvio persists, all local to the browser (`chrome.storage.local` / `localStorage`):"));
c.push(table(
  ["Key family", "Contents", "Sensitivity & mitigation"],
  [
    ["`d365_cache_<org>_*`", "Entity/field/OptionSet metadata (TTL 1-24 h)", "No record data; org-scoped keys prevent cross-env bleed"],
    ["`d365_query_history`", "Last 20 query strings", "Filter **values stripped** before saving"],
    ["`d365_saved_queries`", "User-saved query configs", "May contain filter values the user chose to save"],
    ["`colvio_api_tester_history`", "Last 50 requests", "**Secret headers redacted** before saving"],
    ["`colvio_loader_templates`", "Column mappings, key, mode", "Configuration only — no row data"],
    ["Theme / locale / onboarding", "UI preferences", "None"],
  ],
  [1.8, 2.2, 2.6]
));
c.push(note("Imported CSV/Excel contents are processed in memory only — never persisted."));

c.push(h1("7. Residual risks & recommendations"));
c.push(...bullets([
  "**Polymorphic owner lookups** assume systemuser targets; a CSV of team-owner GUIDs would fail per-row (visible, not silent). Recommended evolution: resolve owner targets from relationship metadata or a user/team picker.",
  "**Formula-injection guard duplication** — the CSV guard exists in several export sites; centralizing it in one shared helper would prevent future drift (tracked as cleanup, not a vulnerability).",
  "**Saved queries** may persist business values typed into filters by the user; documented in the privacy policy. Optional future redaction toggle.",
  "Re-run this audit after any change to the content-script action surface or the $batch builders.",
]));

c.push(h1("8. Conclusion"));
c.push(p("Colvio's security posture is **strong where it matters**: a minimal privileged surface, systematic input validation, verified zero egress, secrets redaction, and write paths that respect both Dataverse RBAC and explicit user confirmation. The June 2026 audit found no exploitable vulnerability; the issues it surfaced were correctness defects in Dataverse semantics and data parsing — all resolved and now covered by 207 automated tests."));

(async () => { await writeDoc(buildDoc({ title: "Colvio — Security & Data-Handling Audit", footerText: `Colvio ${VERSION} — Security Audit`, children: c }), "Colvio_Security_Audit.docx"); })();
