import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: { panel: resolve(__dirname, "panel.html") },
      output: {
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name].[ext]",
      },
    },
    sourcemap: false,
    target: "es2020",
  },
  test: {
    // Only this checkout's tests. Without the exclude, Vitest also picks up STALE copies of the
    // suite inside .claude/worktrees/* (session worktrees pinned to old branches), inflating the
    // counts with duplicate old tests — and a stale test could fail a perfectly green build.
    include: ["src/**/*.test.js"],
  },
});
