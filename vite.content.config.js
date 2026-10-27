// The content script: src/content/ (core.js, the action modules, index.js) bundled into ONE
// classic script, dist/content.js — what the manifest injects on the Dataverse hosts and what
// background.js re-injects after a tab slept. Not minified: the store reviewer and the user read
// the same code as the repository. Runs after the panel build (which empties dist/).
import { defineConfig } from "vite";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // no esbuild pass at all (no minify, no transpile): Rollup alone, so every comment of the source
  // reaches dist/content.js — the file a reviewer reads is the file in the repository
  esbuild: false,
  build: {
    outDir: "dist",
    emptyOutDir: false,
    minify: false,
    sourcemap: false,
    target: "esnext",
    lib: {
      entry: resolve(__dirname, "src/content/index.js"),
      formats: ["iife"],
      name: "colvioContent",
      fileName: () => "content.js",
    },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
