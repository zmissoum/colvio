// In-page confirmations. A native window.confirm() freezes the whole page, can't be styled, reads
// "<extension> says" — and never shows in a screen capture (the product videos had to fake it).
// confirmAsk() asks the app's own dialog instead: <ConfirmHost/> (shared.jsx), mounted once at the
// app's root, registers itself as the sink and resolves each request true (OK) or false (Cancel,
// Escape, a click outside). Requests made while another is open wait their turn.
// Every caller AWAITS the answer: `if (!(await confirmAsk(text))) return;` — a Promise is truthy,
// so a caller that forgot the await would proceed without asking (a source scan in the tests
// forbids the old synchronous helpers).
// Pure: no React, no DOM besides the window.confirm fallback used when no host is mounted.

let sink = null;
const waiting = [];

// The host registers (fn) / unregisters (null). Requests made before it mounted are handed over.
export function setConfirmSink(fn) {
  sink = typeof fn === "function" ? fn : null;
  if (sink) while (waiting.length) sink(waiting.shift());
}

// → Promise<boolean>. message: plain text (line breaks kept); opts: { title, ok, cancel, danger }
export function confirmAsk(message, opts = {}) {
  const req = {
    message: String(message ?? ""),
    title: opts.title || "Please confirm",
    ok: opts.ok || "OK",
    cancel: opts.cancel || "Cancel",
    danger: !!opts.danger,
  };
  return new Promise((resolve) => {
    req.resolve = (v) => resolve(v === true);
    if (sink) { sink(req); return; }
    // no host mounted (a page without the app shell): the native dialog, never a silent yes
    if (typeof window !== "undefined" && typeof window.confirm === "function") { resolve(window.confirm(`${req.title}\n\n${req.message}`) === true); return; }
    waiting.push(req);
  });
}

// The gate before a write on a PRODUCTION org: asks there, proceeds silently elsewhere. Same text as
// the native prompt it replaces.
export function confirmProdAsk(isProduction, actionLabel) {
  if (!isProduction) return Promise.resolve(true);
  return confirmAsk(`${actionLabel}\n\nThis affects live production data. Continue?`, { title: "⚠ PRODUCTION environment", ok: "Continue", danger: true });
}
