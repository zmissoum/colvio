/**
 * post-build.js — Copy static files to dist/ after Vite build
 * Fonctionne sur Windows, macOS, Linux
 */
import { cpSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const dist = resolve(root, "dist");

const files = ["manifest.json", "background.js", "content.js"];
const dirs = ["icons"];

console.log("📦 Copy static files to dist/...");

// Copy les fichiers individuels
for (const file of files) {
  const src = resolve(root, file);
  const dest = resolve(dist, file);
  if (existsSync(src)) {
    cpSync(src, dest);
    console.log(`  ✓ ${file}`);
  } else {
    console.warn(`  ⚠ ${file} introuvable`);
  }
}

// Copy les dossiers
for (const dir of dirs) {
  const src = resolve(root, dir);
  const dest = resolve(dist, dir);
  if (existsSync(src)) {
    cpSync(src, dest, { recursive: true });
    console.log(`  ✓ ${dir}/`);
  } else {
    console.warn(`  ⚠ ${dir}/ not found — icons are missing`);
  }
}

console.log("\n✅ Build complete! Load dist/ in chrome://extensions");
