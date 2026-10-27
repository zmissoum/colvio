// Bytes of a text file → its text, by what the bytes say — PURE, unit-tested.
//
// Excel saves CSV / TSV in three ways a user can't tell apart: UTF-8 (with or without BOM),
// "Unicode Text" = UTF-16 LE with BOM, and "CSV (semicolon)" in the Windows code page. Read as
// UTF-8 only, the second turns into NUL-interleaved garbage (headers never match) and the third
// loses every accent. Here: a UTF-16 BOM decodes as UTF-16; a UTF-8 BOM, or bytes that are valid
// UTF-8, as UTF-8; anything else (legacy = true) as Windows-1252. `bom` says a UTF-8 BOM was there.
export function decodeBytes(input, { legacy = true } = {}) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input || new ArrayBuffer(0));
  if (bytes.length >= 2 && ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff))) {
    const encoding = bytes[0] === 0xff ? "utf-16le" : "utf-16be";
    return { text: new TextDecoder(encoding).decode(bytes), bom: false, encoding };
  }
  const bom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const body = bom ? bytes.subarray(3) : bytes;
  if (legacy && !bom) {
    try { return { text: new TextDecoder("utf-8", { fatal: true }).decode(body), bom, encoding: "utf-8" }; }
    catch { return { text: c1ToWindows1252(new TextDecoder("windows-1252").decode(body)), bom: false, encoding: "windows-1252" }; }
  }
  return { text: new TextDecoder("utf-8").decode(body), bom, encoding: "utf-8" };
}

// Bytes 0x80–0x9F of Windows-1252 (€ ‚ ƒ „ … † ‡ ˆ ‰ Š ‹ Œ Ž ‘ ’ “ ” • – — ˜ ™ š › œ ž Ÿ): Chrome's
// decoder follows the WHATWG table, Node's (a latin1 fast path) leaves them as the C1 controls
// U+0080–U+009F — the same file would read differently under test and in the extension. The code
// points are mapped here so the result doesn't depend on the runtime; the five bytes the table
// leaves undefined (0x81, 0x8D, 0x8F, 0x90, 0x9D) stay as they are.
const C1 = "€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f\u0090‘’“”•–—˜™š›œ\u009džŸ";
const c1ToWindows1252 = (s) => s.replace(/[\u0080-\u009f]/g, (c) => C1[c.charCodeAt(0) - 0x80]);

// A File / Blob → its text (see decodeBytes).
export async function readTextFile(file) {
  return decodeBytes(new Uint8Array(await file.arrayBuffer())).text;
}
