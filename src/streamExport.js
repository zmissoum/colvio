// Streamed exports — rows go straight to a file as they arrive (CSV, or XLSX written as a ZIP of
// XML by hand: one deflate stream per part, sizes in data descriptors), never assembled in memory.
// Any number of rows: Excel's own limit (1,048,576 rows per sheet) rolls over to a new sheet.
// `out` is anything with async write(Uint8Array) / close() / abort() — a FileSystemWritableFileStream
// in the browser, a collector in tests. Pure apart from CompressionStream / TextEncoder.

const enc = new TextEncoder();
export const XLSX_MAX_ROWS = 1048576;
export const XLSX_MAX_CELL = 32767;
const FLUSH_CSV = 1 << 20;     // write to the file every ~1 MB of text
const FLUSH_XML = 1 << 18;     // feed the compressor every ~256 KB of XML

// ── values ───────────────────────────────────────────────────
// One cell value from a cleaned record: header column → the first of its candidate keys present.
// CSV writes what the grid shows (the formatted label when there is one); XLSX keeps raw numbers
// and booleans typed (a "$1,380.08" text cell would make SUM() = 0) and labels for the rest.
export function cellValue(record, keys, format) {
  for (const k of keys || []) {
    if (!(k in record) && !((k + "__display") in record)) continue;
    const raw = record[k];
    const disp = record[k + "__display"];
    if (format === "xlsx" && (typeof raw === "number" || typeof raw === "boolean")) return raw;
    const v = disp !== undefined && disp !== null ? disp : raw;
    if (v === undefined || v === null) return "";
    return typeof v === "object" ? JSON.stringify(v) : v;
  }
  return "";
}

// ── CSV ──────────────────────────────────────────────────────
// Formula-triggering first characters get a leading apostrophe (CSV injection), as in every export.
export function csvCell(v) {
  let s = v === undefined || v === null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export const csvLine = (values) => values.map(csvCell).join(",") + "\n";

// ── XLSX pieces ──────────────────────────────────────────────
export function colLetter(i) {
  let n = i + 1, s = "";
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
// XML text: escaped, characters XML 1.0 forbids removed.
export function xmlText(s) {
  return String(s)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
// → [xml, truncated?]
export function xlsxCell(v, ref) {
  if (v === undefined || v === null || v === "") return ["", false];
  if (typeof v === "number" && Number.isFinite(v)) return [`<c r="${ref}"><v>${v}</v></c>`, false];
  if (typeof v === "boolean") return [`<c r="${ref}" t="b"><v>${v ? 1 : 0}</v></c>`, false];
  let s = typeof v === "object" ? JSON.stringify(v) : String(v);
  let cut = false;
  if (s.length > XLSX_MAX_CELL) { s = s.slice(0, XLSX_MAX_CELL); cut = true; }
  return [`<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlText(s)}</t></is></c>`, cut];
}
export function xlsxRow(values, rowNum) {
  let xml = `<row r="${rowNum}">`, cut = 0;
  for (let i = 0; i < values.length; i++) { const [c, t] = xlsxCell(values[i], colLetter(i) + rowNum); xml += c; if (t) cut++; }
  return [xml + "</row>", cut];
}
export function sheetName(base, n) {
  const clean = String(base || "Sheet").replace(/[\\/?*[\]:]/g, " ").trim() || "Sheet";
  return n <= 1 ? clean.slice(0, 31) : `${clean.slice(0, 31 - ` (${n})`.length)} (${n})`;
}

// ── CRC-32 (ZIP) ─────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
export function crc32(bytes, crc = 0) {
  let c = (crc ^ 0xFFFFFFFF) >>> 0;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// ── ZIP writer (streaming, data descriptors, deflate) ─────────
function u16(v) { return [v & 0xFF, (v >>> 8) & 0xFF]; }
function u32(v) { return [v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF]; }
function dosTime(d) { return ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF; }
function dosDate(d) { return (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF; }
const FLAGS = 0x0808; // bit 3: sizes in the data descriptor · bit 11: UTF-8 names

function createZip(out) {
  let offset = 0;
  const entries = [];
  const now = new Date();
  const T = dosTime(now), D = dosDate(now);
  const raw = async (bytes) => { await out.write(bytes); offset += bytes.length; };
  const guard = (n) => { if (n > 0xFFFFFFFF) throw new Error("The Excel file would pass 4 GB — export to CSV instead (no size limit)."); };
  async function open(name) {
    const nameB = enc.encode(name);
    const e = { nameB, offset, crc: 0, size: 0, csize: 0 };
    await raw(Uint8Array.from([...u32(0x04034b50), ...u16(20), ...u16(FLAGS), ...u16(8), ...u16(T), ...u16(D), ...u32(0), ...u32(0), ...u32(0), ...u16(nameB.length), ...u16(0), ...nameB]));
    const cs = new CompressionStream("deflate-raw");
    const writer = cs.writable.getWriter();
    const reader = cs.readable.getReader();
    const pump = (async () => { for (;;) { const { value, done } = await reader.read(); if (done) return; e.csize += value.length; await raw(value); } })();
    return {
      async write(bytes) { e.crc = crc32(bytes, e.crc); e.size += bytes.length; guard(e.size); await writer.write(bytes); },
      async close() {
        await writer.close(); await pump; guard(e.csize); guard(offset);
        await raw(Uint8Array.from([...u32(0x08074b50), ...u32(e.crc), ...u32(e.csize), ...u32(e.size)]));
        entries.push(e);
      },
    };
  }
  async function add(name, text) { const w = await open(name); await w.write(enc.encode(text)); await w.close(); }
  async function finish() {
    const cdStart = offset;
    for (const e of entries) {
      await raw(Uint8Array.from([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(FLAGS), ...u16(8), ...u16(T), ...u16(D), ...u32(e.crc), ...u32(e.csize), ...u32(e.size), ...u16(e.nameB.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(e.offset), ...e.nameB]));
    }
    guard(offset);
    await raw(Uint8Array.from([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(entries.length), ...u16(entries.length), ...u32(offset - cdStart), ...u32(cdStart), ...u16(0)]));
  }
  return { open, add, finish };
}

const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const SHEET_HEAD = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="${NS}"><sheetData>`;
const SHEET_TAIL = "</sheetData></worksheet>";
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="${NS}"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

// ── sinks ────────────────────────────────────────────────────
// createSink(out, "csv" | "xlsx", { headers, sheetBase }) → { add(rows), close(), abort(), rows, truncatedCells, sheets }
// rows = arrays of values in header order.
export async function createSink(out, format, { headers, sheetBase = "Export" } = {}) {
  const state = { rows: 0, truncatedCells: 0, sheets: 1 };
  if (format === "csv") {
    let buf = "﻿" + csvLine(headers);
    const flush = async () => { if (buf) { await out.write(enc.encode(buf)); buf = ""; } };
    return {
      get rows() { return state.rows; }, truncatedCells: 0, sheets: 1,
      async add(rows) { for (const r of rows) { buf += csvLine(r); state.rows++; if (buf.length > FLUSH_CSV) await flush(); } },
      async close() { await flush(); await out.close(); },
      async abort() { try { await out.abort?.(); } catch { /* already closed */ } },
    };
  }
  const zip = createZip(out);
  let sheet = null, rowInSheet = 0, buf = "";
  const startSheet = async () => {
    sheet = await zip.open(`xl/worksheets/sheet${state.sheets}.xml`);
    buf = SHEET_HEAD + xlsxRow(headers, 1)[0];
    rowInSheet = 1;
  };
  const flush = async () => { if (buf) { await sheet.write(enc.encode(buf)); buf = ""; } };
  const endSheet = async () => { buf += SHEET_TAIL; await flush(); await sheet.close(); };
  await startSheet();
  return {
    get rows() { return state.rows; },
    get truncatedCells() { return state.truncatedCells; },
    get sheets() { return state.sheets; },
    async add(rows) {
      for (const r of rows) {
        if (rowInSheet >= XLSX_MAX_ROWS) { await endSheet(); state.sheets++; await startSheet(); }
        rowInSheet++;
        const [xml, cut] = xlsxRow(r, rowInSheet);
        buf += xml; state.truncatedCells += cut; state.rows++;
        if (buf.length > FLUSH_XML) await flush();
      }
    },
    async close() {
      await endSheet();
      const n = state.sheets;
      const sheets = Array.from({ length: n }, (_, i) => i + 1);
      await zip.add("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map(i => `<Override PartName="/xl/worksheets/sheet${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`);
      await zip.add("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
      await zip.add("xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="${NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map(i => `<sheet name="${xmlText(sheetName(sheetBase, i))}" sheetId="${i}" r:id="rId${i}"/>`).join("")}</sheets></workbook>`);
      await zip.add("xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map(i => `<Relationship Id="rId${i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i}.xml"/>`).join("")}<Relationship Id="rId${n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
      await zip.add("xl/styles.xml", STYLES);
      await zip.finish();
      await out.close();
    },
    async abort() { try { await out.abort?.(); } catch { /* already closed */ } },
  };
}

// ── where the file goes ──────────────────────────────────────
// The browser's save dialog when it has one (the file is written in place, nothing held in memory);
// otherwise the extension's private disk (OPFS), then a normal download of that file. Call it from
// the click handler itself — the save dialog needs the user's gesture. null = the user cancelled.
export async function openOutput(suggestedName, format) {
  const types = format === "xlsx"
    ? [{ description: "Excel workbook", accept: { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"] } }]
    : [{ description: "CSV file", accept: { "text/csv": [".csv"] } }];
  if (typeof window !== "undefined" && typeof window.showSaveFilePicker === "function") {
    let handle;
    try { handle = await window.showSaveFilePicker({ suggestedName, types }); }
    catch (e) { if (e && e.name === "AbortError") return null; throw e; }
    const w = await handle.createWritable();
    return { name: handle.name, write: (b) => w.write(b), close: () => w.close(), abort: () => w.abort() };
  }
  const dir = await navigator.storage.getDirectory();
  const tmp = `colvio-export-${Date.now()}-${suggestedName}`;
  const fh = await dir.getFileHandle(tmp, { create: true });
  const w = await fh.createWritable();
  return {
    name: suggestedName,
    write: (b) => w.write(b),
    abort: async () => { try { await w.abort(); } catch { /* closed */ } try { await dir.removeEntry(tmp); } catch { /* gone */ } },
    close: async () => {
      await w.close();
      const file = await fh.getFile(); // disk-backed: the download streams from it
      const url = URL.createObjectURL(file);
      const a = document.createElement("a"); a.href = url; a.download = suggestedName; a.click();
      setTimeout(() => { URL.revokeObjectURL(url); dir.removeEntry(tmp).catch(() => {}); }, 120000);
    },
  };
}
