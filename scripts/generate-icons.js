/**
 * generate-icons.js — Create Colvio icon PNGs
 * Pure Node.js, zero dependencies
 * Generates 16x16, 32x32, 48x48, 128x128
 * Design: Lightning bolt (⚡) on dark blue (#1B3A5C) rounded square
 */

import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { deflateSync } from "zlib";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ICONS_DIR = join(__dirname, "..", "icons");

// Colors
const BG = [27, 58, 92, 255];       // #1B3A5C
const BOLT = [74, 158, 255, 255];    // #4A9EFF (accent blue)
const BOLT_HL = [34, 211, 238, 255]; // #22D3EE (cyan highlight)
const TRANSPARENT = [0, 0, 0, 0];

// ── Lightning bolt shape (normalized 0-1 coordinates) ────────
// Simple geometric bolt
const BOLT_POLY = [
  [0.55, 0.10],
  [0.30, 0.48],
  [0.48, 0.48],
  [0.42, 0.90],
  [0.70, 0.45],
  [0.52, 0.45],
  [0.55, 0.10],
];

// Highlight strip (left edge of bolt)
const HL_POLY = [
  [0.55, 0.10],
  [0.30, 0.48],
  [0.38, 0.48],
  [0.55, 0.22],
];

function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function dist(x, y, cx, cy) {
  return Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
}

function generateIcon(size) {
  const pixels = new Uint8Array(size * size * 4);
  const radius = size * 0.18; // corner radius
  const center = size / 2;
  const padding = size * 0.04; // slight inset

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const nx = x / size; // normalized 0-1
      const ny = y / size;

      // Rounded rectangle check
      let inRect = false;
      const left = padding, right = size - padding;
      const top = padding, bottom = size - padding;

      if (x >= left && x < right && y >= top && y < bottom) {
        // Check corners
        const corners = [
          [left + radius, top + radius],
          [right - radius, top + radius],
          [left + radius, bottom - radius],
          [right - radius, bottom - radius],
        ];
        inRect = true;
        // Top-left
        if (x < left + radius && y < top + radius && dist(x, y, corners[0][0], corners[0][1]) > radius) inRect = false;
        // Top-right
        if (x >= right - radius && y < top + radius && dist(x, y, corners[1][0], corners[1][1]) > radius) inRect = false;
        // Bottom-left
        if (x < left + radius && y >= bottom - radius && dist(x, y, corners[2][0], corners[2][1]) > radius) inRect = false;
        // Bottom-right
        if (x >= right - radius && y >= bottom - radius && dist(x, y, corners[3][0], corners[3][1]) > radius) inRect = false;
      }

      if (!inRect) {
        pixels.set(TRANSPARENT, idx);
        continue;
      }

      // Check if in bolt
      if (pointInPolygon(nx, ny, BOLT_POLY)) {
        // Check highlight
        if (pointInPolygon(nx, ny, HL_POLY)) {
          pixels.set(BOLT_HL, idx);
        } else {
          pixels.set(BOLT, idx);
        }
      } else {
        // Background with subtle gradient
        const gradientFactor = 1 - (ny * 0.15);
        pixels.set([
          Math.round(BG[0] * gradientFactor),
          Math.round(BG[1] * gradientFactor),
          Math.round(BG[2] * gradientFactor),
          255
        ], idx);
      }
    }
  }

  return pixels;
}

// ── PNG encoder (minimal, valid) ─────────────────────────────
function createPNG(width, height, pixels) {
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // IDAT: raw pixel data with filter byte (0 = None) per row
  const rawData = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 4)] = 0; // filter: None
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4;
      const dstIdx = y * (1 + width * 4) + 1 + x * 4;
      rawData[dstIdx] = pixels[srcIdx];
      rawData[dstIdx + 1] = pixels[srcIdx + 1];
      rawData[dstIdx + 2] = pixels[srcIdx + 2];
      rawData[dstIdx + 3] = pixels[srcIdx + 3];
    }
  }
  const compressed = deflateSync(rawData);

  // Build chunks
  function makeChunk(type, data) {
    const typeBytes = Buffer.from(type, "ascii");
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);

    const crcInput = Buffer.concat([typeBytes, data]);
    let crc = 0xFFFFFFFF;
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[i] = c;
    }
    for (let i = 0; i < crcInput.length; i++) crc = table[(crc ^ crcInput[i]) & 0xFF] ^ (crc >>> 8);
    crc = (crc ^ 0xFFFFFFFF) >>> 0;

    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc, 0);

    return Buffer.concat([len, typeBytes, data, crcBuf]);
  }

  const ihdrChunk = makeChunk("IHDR", ihdr);
  const idatChunk = makeChunk("IDAT", compressed);
  const iendChunk = makeChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// ── Generate all sizes ───────────────────────────────────────
const SIZES = [16, 32, 48, 128];

for (const size of SIZES) {
  const pixels = generateIcon(size);
  const png = createPNG(size, size, pixels);
  const path = join(ICONS_DIR, `icon${size}.png`);
  writeFileSync(path, png);
  console.log(`  ✓ icon${size}.png (${png.length} bytes)`);
}

console.log("\n✅ All icons generated.\n");
