// Web resources — list, read, edit (text types), publish, and search a name inside every script
// (what Dataverse's dependency tracking can't see). Pure: types, base64 <-> text, search.

export const WR_TYPES = {
  1: { label: "HTML", ext: "html", text: true, mime: "text/html" },
  2: { label: "CSS", ext: "css", text: true, mime: "text/css" },
  3: { label: "JavaScript", ext: "js", text: true, mime: "text/javascript" },
  4: { label: "XML", ext: "xml", text: true, mime: "text/xml" },
  5: { label: "PNG", ext: "png", text: false, mime: "image/png" },
  6: { label: "JPG", ext: "jpg", text: false, mime: "image/jpeg" },
  7: { label: "GIF", ext: "gif", text: false, mime: "image/gif" },
  8: { label: "Silverlight", ext: "xap", text: false, mime: "application/octet-stream" },
  9: { label: "XSL", ext: "xsl", text: true, mime: "text/xml" },
  10: { label: "ICO", ext: "ico", text: false, mime: "image/x-icon" },
  11: { label: "SVG", ext: "svg", text: true, mime: "image/svg+xml" },
  12: { label: "RESX", ext: "resx", text: true, mime: "text/xml" },
};
export const isTextType = (t) => !!WR_TYPES[t]?.text;
export const typeLabel = (t) => WR_TYPES[t]?.label || `Type ${t}`;
export const isImageType = (t) => [5, 6, 7, 10, 11].includes(Number(t));

// base64 (Dataverse's content) → text, remembering a UTF-8 BOM so a save writes it back the same.
export function decodeContent(b64) {
  if (!b64) return { text: "", bom: false };
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const bom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  return { text: new TextDecoder("utf-8").decode(bom ? bytes.subarray(3) : bytes), bom };
}
export function encodeContent(text, bom = false) {
  const body = new TextEncoder().encode(String(text ?? ""));
  const bytes = bom ? new Uint8Array([0xef, 0xbb, 0xbf, ...body]) : body;
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
// base64 → bytes (downloads, image previews of binary types).
export function contentBytes(b64) {
  const bin = atob(b64 || "");
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
export const byteSize = (b64) => (b64 ? Math.floor((b64.length * 3) / 4) - (b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0) : 0);

export function publishXmlFor(ids) {
  const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const list = (ids || []).filter(id => GUID.test(String(id)));
  if (!list.length) throw new Error("Nothing to publish.");
  return `<importexportxml><webresources>${list.map(id => `<webresource>{${id}}</webresource>`).join("")}</webresources></importexportxml>`;
}

// The list: search on name and display name, a type filter, Microsoft / hidden ones on demand.
export function filterResources(list, { search = "", type = "all", showSystem = false } = {}) {
  const s = search.trim().toLowerCase();
  return (list || []).filter(r => {
    if (!showSystem && (r.hidden || /^(msdyn|mscrm|msdynce|adx|msfp|mspp|Microsoft)[_./]/i.test(r.name || ""))) return false;
    if (type !== "all" && String(r.type) !== String(type)) return false;
    return !s || String(r.name || "").toLowerCase().includes(s) || String(r.displayName || "").toLowerCase().includes(s);
  });
}

// Every line of every text holding the query: [{ id, name, line, col, preview }]. Plain text by
// default (a column name), case-insensitive; whole word when asked (so "name" skips "fullname").
export function searchContents(items, query, { caseSensitive = false, wholeWord = false } = {}) {
  const q = String(query || "");
  if (!q) return [];
  const esc = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(wholeWord ? `(^|[^A-Za-z0-9_])(${esc})(?![A-Za-z0-9_])` : `(${esc})`, caseSensitive ? "g" : "gi");
  const out = [];
  for (const it of items || []) {
    const lines = String(it.text || "").split(/\r?\n/);
    lines.forEach((line, i) => {
      re.lastIndex = 0;
      const m = re.exec(line);
      if (!m) return;
      const col = m.index + (wholeWord ? m[1].length : 0);
      const from = Math.max(0, col - 60);
      out.push({ id: it.id, name: it.name, line: i + 1, col: col + 1, preview: (from ? "…" : "") + line.slice(from, col + q.length + 80).trim() });
    });
  }
  return out;
}

// Position (character offset) of a line in a text — to put the cursor on a search hit.
export function offsetOfLine(text, line) {
  let off = 0, n = 1;
  const s = String(text || "");
  while (n < line) { const i = s.indexOf("\n", off); if (i < 0) return s.length; off = i + 1; n++; }
  return off;
}
