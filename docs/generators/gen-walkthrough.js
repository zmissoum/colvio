// Generates Colvio_Walkthrough.pptx — product walkthrough deck (EN).
// Run: node gen-walkthrough.js
const pptxgen = require("pptxgenjs");
const path = require("path");
const fs = require("fs");

// Height for a given display width, from the PNG's real aspect ratio (no distortion,
// stays correct when diagrams.py output changes).
function imgH(name, w) {
  const b = fs.readFileSync(path.join(__dirname, "img", name));
  return w * b.readUInt32BE(20) / b.readUInt32BE(16);
}

const VI = "5B3FD6", VID = "2A1B66", CY = "0E7490", GN = "1F845A", OR = "B65C02";
const INK = "172B4D", MUT = "6B778C", BG = "FFFFFF", SOFT = "F4F5F7", ICE = "EEEAFB";
const IMG = (n) => path.join(__dirname, "img", n);
const HEAD = "Trebuchet MS", BODY = "Calibri";

const pres = new pptxgen();
pres.layout = "LAYOUT_16x9"; // 10 x 5.625
pres.author = "Colvio";
pres.title = "Colvio — Product Walkthrough";

const W = 10, H = 5.625;

function darkSlide() {
  const s = pres.addSlide();
  s.background = { color: VID };
  return s;
}
function lightSlide(title, kicker) {
  const s = pres.addSlide();
  s.background = { color: BG };
  // motif: thick left bar next to the title
  s.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: 0.42, w: 0.09, h: 0.62, fill: { color: VI } });
  if (kicker) s.addText(kicker.toUpperCase(), { x: 0.72, y: 0.36, w: 8.7, h: 0.26, fontFace: BODY, fontSize: 10.5, color: CY, charSpacing: 2, bold: true, margin: 0 });
  s.addText(title, { x: 0.72, y: kicker ? 0.58 : 0.42, w: 8.7, h: 0.55, fontFace: HEAD, fontSize: 27, bold: true, color: INK, margin: 0 });
  s.addText("Colvio  ·  v1.11.154", { x: 7.9, y: 5.30, w: 1.9, h: 0.25, fontFace: BODY, fontSize: 8.5, color: MUT, align: "right", margin: 0 });
  return s;
}
function bullets(s, items, opts) {
  s.addText(items.map((t, i) => ({ text: t, options: { bullet: { code: "2022", indent: 12 }, breakLine: i < items.length - 1, paraSpaceAfter: 7 } })),
    { fontFace: BODY, fontSize: 12.5, color: INK, valign: "top", margin: 0, ...opts });
}
function card(s, x, y, w, h, color, title, body, bodySize = 11) {
  s.addShape(pres.shapes.RECTANGLE, { x, y, w, h, fill: { color: SOFT } });
  s.addShape(pres.shapes.RECTANGLE, { x, y, w: 0.07, h, fill: { color } });
  s.addText(title, { x: x + 0.18, y: y + 0.10, w: w - 0.3, h: 0.32, fontFace: HEAD, fontSize: 13.5, bold: true, color: INK, margin: 0 });
  // body color darker than MUT: 4.5:1+ contrast on the SOFT card background
  s.addText(body, { x: x + 0.18, y: y + 0.44, w: w - 0.32, h: h - 0.56, fontFace: BODY, fontSize: bodySize, color: "44546A", valign: "top", margin: 0 });
}
function stat(s, x, y, w, value, label, color) {
  s.addText(value, { x, y, w, h: 0.85, fontFace: HEAD, fontSize: 44, bold: true, color, align: "center", margin: 0 });
  s.addText(label, { x, y: y + 0.85, w, h: 0.55, fontFace: BODY, fontSize: 12, color: MUT, align: "center", valign: "top", margin: 0 });
}

// ── 1. Title (dark) ─────────────────────────────────────────────
{
  const s = darkSlide();
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 0.18, h: H, fill: { color: VI } });
  s.addText("Colvio", { x: 1.0, y: 1.55, w: 8, h: 1.1, fontFace: HEAD, fontSize: 64, bold: true, color: "FFFFFF", margin: 0 });
  s.addText("The free in-browser toolkit for Microsoft Dynamics 365 / Dataverse", { x: 1.0, y: 2.75, w: 7.6, h: 0.5, fontFace: BODY, fontSize: 19, color: "CDC4F5", margin: 0 });
  s.addText("Explore · Load · Test · Audit — zero configuration, zero data collection", { x: 1.0, y: 3.35, w: 7.6, h: 0.4, fontFace: BODY, fontSize: 13, italic: true, color: "9D8FE0", margin: 0 });
  s.addText("Product walkthrough  ·  v1.11.154  ·  August 2026", { x: 1.0, y: 4.75, w: 7, h: 0.3, fontFace: BODY, fontSize: 11, color: "9D8FE0", margin: 0 });
}

// ── 2. Why Colvio (stats) ───────────────────────────────────────
{
  const s = lightSlide("Why Colvio?", "The pitch");
  s.addText("D365 has always lacked a free, fast, in-browser tool for data exploration and debugging. Colvio rides your existing browser session — open a D365 page, click the icon, work.",
    { x: 0.72, y: 1.25, w: 8.6, h: 0.65, fontFace: BODY, fontSize: 13.5, color: INK, margin: 0 });
  stat(s, 0.6, 2.55, 2.9, "0", "API keys, app registrations,\naccounts or subscriptions", VI);
  stat(s, 3.55, 2.55, 2.9, "19", "modules — from query builder\nto adoption analytics to security audit", CY);
  stat(s, 6.5, 2.55, 2.9, "100%", "local — no telemetry, no external\nservers, open source (MIT)", GN);
  s.addText("Free forever — no freemium, no “Pro” tier.", { x: 0.72, y: 4.55, w: 8.6, h: 0.4, fontFace: BODY, fontSize: 13, italic: true, color: CY, align: "center", margin: 0 });
}

// ── 3. Module map ───────────────────────────────────────────────
{
  const s = lightSlide("One panel, nineteen modules", "Overview");
  s.addImage({ path: IMG("modules.png"), x: 1.2, y: 1.30, w: 7.6, h: imgH("modules.png", 7.6) });
}

// ── 4. Architecture ─────────────────────────────────────────────
{
  const s = lightSlide("Zero backend, zero egress", "Architecture");
  s.addImage({ path: IMG("architecture.png"), x: 0.55, y: 1.45, w: 6.4, h: imgH("architecture.png", 6.4) });
  bullets(s, [
    "Manifest V3 — React 18 panel, relay-only service worker, one privileged content script",
    "Auth = your session cookies. No token is ever extracted or stored",
    "42 validated actions; every fetch is same-origin to your org",
    "Org-scoped metadata cache (chrome.storage.local)",
  ], { x: 7.15, y: 1.55, w: 2.5, h: 3.4 });
}

// ── 5. Data Explorer ────────────────────────────────────────────
{
  const s = lightSlide("Query anything, four ways", "Data Explorer");
  card(s, 0.6, 1.35, 4.25, 1.45, VI, "Builder", "Visual columns, AND/OR filter groups (14 operators), parent & child $expand with per-expand filters, sort, limit.");
  card(s, 5.15, 1.35, 4.25, 1.45, CY, "SQL", "SELECT / JOIN / WHERE / GROUP BY / TOP — auto-translated to FetchXML: reliable pagination, link-entity joins.");
  card(s, 0.6, 3.15, 4.25, 1.45, CY, "FetchXML & OData", "Raw editors with templates and paging-cookie pagination. Copy the OData URL for Postman or a browser.");
  card(s, 5.15, 3.15, 4.25, 1.45, GN, "Results that work", "No 5,000-row cap, 60fps virtual scrolling, inline cell edit (PATCH), bulk update/delete, CSV/XLSX/JSON exports.");
}

// ── 6. API Tester ───────────────────────────────────────────────
{
  const s = lightSlide("A Postman for Dataverse — built in", "API Tester");
  bullets(s, [
    "GET / POST / PATCH / PUT / DELETE on your org — auth rides the active session, zero OAuth setup",
    "Header autocomplete: Prefer, If-Match, MSCRM.* bypass headers",
    "JSON body editor with live validation pointing at the exact error line",
    "Templates: WhoAmI, CREATE, PATCH, UPSERT by alternate key, DELETE",
    "History ×50 with secret headers redacted · Copy as cURL · multiple tabs",
  ], { x: 0.72, y: 1.6, w: 5.3, h: 3.2 });
  card(s, 6.3, 1.6, 3.1, 2.45, OR, "Use it for", "Testing a call before wiring it into a plugin or Flow.\n\nReproducing a support ticket payload.\n\nChecking how an MSCRM header changes behavior.", 11.5);
}

// ── 7. Data Loader wizard ───────────────────────────────────────
{
  const s = lightSlide("Bulk loading, wizard-guided", "Data Loader");
  s.addImage({ path: IMG("wizard.png"), x: 0.55, y: 1.55, w: 8.9, h: imgH("wizard.png", 8.9) });
  bullets(s, [
    "CSV / TSV / Excel or paste — RFC-4180 parser (quoted cells, embedded commas & line breaks), delimiter auto-detect",
    "Auto-mapping, label→value picklist transforms, locale-aware dates & numbers, mapping templates per entity",
  ], { x: 0.72, y: 4.3, w: 8.8, h: 1.0 });
}

// ── 8. Import modes ─────────────────────────────────────────────
{
  const s = lightSlide("CREATE · UPSERT · UPDATE · DELETE", "Import modes");
  s.addImage({ path: IMG("modes.png"), x: 0.55, y: 1.35, w: 7.0, h: imgH("modes.png", 7.0) });
  card(s, 7.75, 1.45, 1.8, 2.7, OR, "UPDATE", "Never creates:\n\nIf-Match: * on every PATCH.\n\nMissing key → 404, row fails.\n\nEmpty key → rejected.", 10);
}

// ── 9. Bulk engine ──────────────────────────────────────────────
{
  const s = lightSlide("Built for hundreds of thousands of rows", "Performance");
  s.addImage({ path: IMG("batch.png"), x: 0.45, y: 1.40, w: 6.3, h: imgH("batch.png", 6.3) });
  stat(s, 7.0, 1.45, 2.6, "3-4k", "records / second\n(default 200 × 6 threads)", VI);
  bullets(s, [
    "One changeset per record — a bad row never rolls back its batch",
    "429 throttling retried with Retry-After",
    "Cancel = hard stop, no writes after",
    "Live per-row log + exact request sent",
  ], { x: 7.0, y: 3.0, w: 2.55, h: 2.2 });
}

// ── 10. Security ────────────────────────────────────────────────
{
  const s = lightSlide("Audited, defense in depth", "Security & privacy");
  s.addImage({ path: IMG("security.png"), x: 0.45, y: 1.40, w: 6.3, h: imgH("security.png", 6.3) });
  bullets(s, [
    "Full 4-dimension audit + 7-angle code review: 0 open critical/high findings",
    "Zero egress verified at code level",
    "Secrets redacted in saved history; CSV formula-injection guards",
    "260 automated tests",
  ], { x: 7.0, y: 1.55, w: 2.55, h: 3.2 });
}

// ── 11. Admin modules ───────────────────────────────────────────
{
  const s = lightSlide("Insight for admins", "Governance");
  card(s, 0.6, 1.5, 2.73, 2.8, VI, "Users & Licenses", "Every user with Access Mode, CAL type, BU, roles and last login (from audit).\n\nSpot unused licenses: disabled users, never-logged-in accounts.\n\nFull CSV export.", 11.5);
  card(s, 3.63, 1.5, 2.73, 2.8, CY, "Security Audit", "All roles with readable privilege labels and depth badges (User / BU / Org).\n\n30+ sensitive privileges flagged automatically.\n\nOrg-level grants highlighted in red.", 11.5);
  card(s, 6.66, 1.5, 2.73, 2.8, GN, "Login History", "Login/logout timeline per user from the audit log.\n\nSession durations and access-type breakdown.\n\nCSV export for compliance reviews.", 11.5);
}

// ── 12. Closing (dark) ──────────────────────────────────────────
{
  const s = darkSlide();
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 0.18, h: H, fill: { color: VI } }); // mirrors the title slide
  s.addText("Get Colvio", { x: 1.0, y: 1.35, w: 8, h: 0.9, fontFace: HEAD, fontSize: 44, bold: true, color: "FFFFFF", margin: 0 });
  s.addText([
    { text: "Chrome Web Store", options: { bold: true, color: "FFFFFF", breakLine: true } },
    { text: "Search “Colvio for Dynamics 365” — installs in one click.", options: { color: "CDC4F5", breakLine: true } },
    { text: "", options: { breakLine: true } },
    { text: "Open source", options: { bold: true, color: "FFFFFF", breakLine: true } },
    { text: "github.com/zmissoum/colvio — MIT license. Audit it, fork it, contribute.", options: { color: "CDC4F5" } },
  ], { x: 1.0, y: 2.5, w: 7.8, h: 1.7, fontFace: BODY, fontSize: 15, margin: 0 });
  s.addText("Free forever. No accounts. Your data never leaves your browser.", { x: 1.0, y: 4.45, w: 7.8, h: 0.4, fontFace: BODY, fontSize: 13, italic: true, color: "9D8FE0", margin: 0 });
}

pres.writeFile({ fileName: path.join(__dirname, "..", "Colvio_Walkthrough.pptx") })
  .then(() => console.log("wrote Colvio_Walkthrough.pptx"));
