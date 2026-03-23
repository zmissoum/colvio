/**
 * pack.js — Package dist/ into a .zip for Chrome Web Store
 *
 * Usage: npm run pack (runs build + this script)
 * Output: colvio-v{version}.zip in project root
 */

import { readFileSync, readdirSync, statSync, createWriteStream, existsSync } from "fs";
import { join, dirname, relative } from "path";
import { fileURLToPath } from "url";
import { createDeflateRaw } from "zlib";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DIST = join(ROOT, "dist");

// Read version from manifest.json
const manifest = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));
const version = manifest.version;
const zipName = `colvio-v${version}.zip`;
const zipPath = join(ROOT, zipName);

if (!existsSync(DIST)) {
  console.error("❌ dist/ not found. Run `npm run build` first.");
  process.exit(1);
}

// Collect all files in dist/
function walkDir(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) results.push(...walkDir(full));
    else results.push(full);
  }
  return results;
}

const files = walkDir(DIST);

// ── Minimal ZIP writer (no external deps) ───────────────────
// ZIP format: local file headers + file data + central directory + end record

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[i] = c;
  }
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function dosDateTime(date) {
  const time = ((date.getHours() & 0x1F) << 11) | ((date.getMinutes() & 0x3F) << 5) | ((date.getSeconds() >> 1) & 0x1F);
  const day = (((date.getFullYear() - 1980) & 0x7F) << 9) | (((date.getMonth() + 1) & 0x0F) << 5) | (date.getDate() & 0x1F);
  return { time, date: day };
}

async function createZip() {
  const entries = [];
  const buffers = [];
  let offset = 0;
  const now = new Date();
  const { time: dosTime, date: dosDate } = dosDateTime(now);

  for (const filePath of files) {
    const name = relative(DIST, filePath).replace(/\\/g, "/");
    const data = readFileSync(filePath);
    const crc = crc32(data);
    const nameBytes = Buffer.from(name, "utf8");

    // Local file header (store, no compression for simplicity)
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034B50, 0);  // signature
    localHeader.writeUInt16LE(20, 4);            // version needed
    localHeader.writeUInt16LE(0, 6);             // flags
    localHeader.writeUInt16LE(0, 8);             // compression: store
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(data.length, 18);  // compressed size
    localHeader.writeUInt32LE(data.length, 22);  // uncompressed size
    localHeader.writeUInt16LE(nameBytes.length, 26);
    localHeader.writeUInt16LE(0, 28);            // extra field length

    entries.push({ name: nameBytes, crc, size: data.length, offset });
    buffers.push(localHeader, nameBytes, data);
    offset += localHeader.length + nameBytes.length + data.length;
  }

  // Central directory
  const centralStart = offset;
  for (const entry of entries) {
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014B50, 0);  // signature
    central.writeUInt16LE(20, 4);           // version made by
    central.writeUInt16LE(20, 6);           // version needed
    central.writeUInt16LE(0, 8);            // flags
    central.writeUInt16LE(0, 10);           // compression: store
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(entry.crc, 16);
    central.writeUInt32LE(entry.size, 20);
    central.writeUInt32LE(entry.size, 24);
    central.writeUInt16LE(entry.name.length, 28);
    central.writeUInt16LE(0, 30);           // extra field length
    central.writeUInt16LE(0, 32);           // comment length
    central.writeUInt16LE(0, 34);           // disk number
    central.writeUInt16LE(0, 36);           // internal attrs
    central.writeUInt32LE(0, 38);           // external attrs
    central.writeUInt32LE(entry.offset, 42);

    buffers.push(central, entry.name);
    offset += central.length + entry.name.length;
  }

  const centralSize = offset - centralStart;

  // End of central directory
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054B50, 0);  // signature
  endRecord.writeUInt16LE(0, 4);            // disk number
  endRecord.writeUInt16LE(0, 6);            // central dir disk
  endRecord.writeUInt16LE(entries.length, 8);
  endRecord.writeUInt16LE(entries.length, 10);
  endRecord.writeUInt32LE(centralSize, 12);
  endRecord.writeUInt32LE(centralStart, 16);
  endRecord.writeUInt16LE(0, 20);           // comment length

  buffers.push(endRecord);

  const zip = Buffer.concat(buffers);
  const { writeFileSync } = await import("fs");
  writeFileSync(zipPath, zip);

  console.log(`\n⚡ Colvio packed: ${zipName}`);
  console.log(`   ${files.length} files, ${(zip.length / 1024).toFixed(1)} KB`);
  console.log(`   Ready for Chrome Web Store upload.\n`);
}

createZip().catch((e) => { console.error("Pack failed:", e.message); process.exit(1); });
