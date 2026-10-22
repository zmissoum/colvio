/**
 * sandbox.js — Script Console runner (manifest "sandbox" page)
 *
 * Manifest V3 forbids eval in extension pages; a sandbox page may run it, but it has no chrome.*
 * API, a unique origin, and (manifest CSP) no network access at all. One fresh iframe per run;
 * Stop removes it, which ends the script outright.
 *
 * The user's code runs in a Web Worker created by this page (blob URL, same sandbox CSP): its own
 * thread, so even `while (true) {}` can't freeze the panel, and removing the iframe terminates it.
 * The code never runs in this page itself (it could navigate the frame away).
 *
 * Every `dv.*` call is posted to the panel, which executes it through the Script Console runtime
 * (dry run, journal, 429 retries) and the content script's host-locked request. Neither this page
 * nor the worker ever sees the D365 session.
 */
(function () {
  "use strict";

  // The runner: everything that executes user code, stringified into the worker. `send` posts a
  // message out; returns the handler for messages coming in.
  function runner(send) {
    var pending = new Map();
    var nextId = 0;
    var started = false;
    function plain(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
    function show(v) {
      if (typeof v === "string") return v;
      if (v instanceof Error) return v.stack || v.message;
      try { return JSON.stringify(v, null, 2); } catch (e) { return String(v); }
    }
    function rpc(method, args, headers) {
      // The Error is created HERE, inside the script's own call stack, so its stack carries the
      // script line that made the call; the message is filled in when the answer comes back.
      var err = new Error("dv." + method);
      return new Promise(function (resolve, reject) {
        var id = ++nextId;
        pending.set(id, { resolve: resolve, reject: reject, err: err });
        try { send({ type: "call", id: id, method: method, args: plain(args), headers: headers }); }
        catch (e) { pending.delete(id); err.message = "dv." + method + ": arguments must be plain data (" + e.message + ")"; reject(err); }
      });
    }
    function makeDv(methods, headers, dryRun) {
      var dv = {};
      methods.forEach(function (m) { dv[m] = function () { return rpc(m, Array.prototype.slice.call(arguments), headers); }; });
      dv.withHeaders = function (h) { return makeDv(methods, Object.assign({}, headers, h || {}), dryRun); };
      dv.dryRun = dryRun;
      return Object.freeze(dv);
    }
    return function onMessage(d) {
      if (d.type === "result") {
        var p = pending.get(d.id);
        if (!p) return;
        pending.delete(d.id);
        if (d.error) {
          var e = p.err;
          e.message = d.error.message; e.status = d.error.status; e.code = d.error.code;
          if (d.error.results) e.results = d.error.results;
          p.reject(e);
        } else p.resolve(d.value);
        return;
      }
      if (d.type !== "run" || started) return;
      started = true;
      var line = function (level) { return function () { send({ type: "log", level: level, text: Array.prototype.map.call(arguments, show).join(" ") }); }; };
      var log = line("info"), warn = line("warn"), error = line("error");
      var table = function (rows, title) {
        try { send({ type: "table", title: title == null ? "" : String(title), rows: plain(Array.isArray(rows) ? rows : [rows]) }); }
        catch (e) { warn("table(): rows must be plain data — " + e.message); }
      };
      var progress = function (done, total, label) { send({ type: "progress", done: Number(done) || 0, total: Number(total) || 0, label: label == null ? "" : String(label) }); };
      var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, Math.max(0, Number(ms) || 0)); }); };
      var konsole = { log: log, info: log, debug: log, warn: warn, error: error, table: function (r) { table(r); } };
      var dv = makeDv(d.methods || [], {}, !!d.dryRun);
      var fn;
      try {
        var AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
        // 2 header lines before the body: the panel maps stack lines back with scriptLine().
        fn = new AsyncFunction("dv", "log", "table", "progress", "sleep", "input", "console", d.code);
      } catch (e) {
        send({ type: "done", ok: false, error: { message: "Syntax error: " + e.message, stack: "" } });
        return;
      }
      Promise.resolve()
        .then(function () { return fn(dv, log, table, progress, sleep, d.input || [], konsole); })
        .then(function (value) {
          var out;
          try { out = plain(value); } catch (e) { out = String(value); }
          send({ type: "done", ok: true, value: out });
        })
        .catch(function (e) {
          send({ type: "done", ok: false, error: { message: (e && e.message) || String(e), stack: (e && e.stack) || "", status: e && e.status, code: e && e.code } });
        });
    };
  }

  var host = window.parent;
  var runId = null;
  function out(msg) { msg.__colvioScript = true; msg.runId = runId; host.postMessage(msg, "*"); }

  // No in-page fallback: code running in this page could navigate the frame away and leak data.
  // Without a worker the run fails, readably.
  var toRunner;
  try {
    var src = "var handle = (" + runner.toString() + ")(function (m) { self.postMessage(m); });\nself.onmessage = function (e) { handle(e.data); };";
    var worker = new Worker(URL.createObjectURL(new Blob([src], { type: "text/javascript" })));
    worker.onmessage = function (e) { out(e.data); };
    worker.onerror = function (e) { e.preventDefault(); out({ type: "done", ok: false, error: { message: e.message || "Script error", stack: "" } }); };
    toRunner = function (d) { worker.postMessage(d); };
  } catch (e) {
    toRunner = function (d) { if (d.type === "run") out({ type: "done", ok: false, error: { message: "The script runner couldn't start (Web Worker unavailable: " + e.message + ")", stack: "" } }); };
  }

  window.addEventListener("message", function (ev) {
    if (ev.source !== host) return;
    var d = ev.data;
    if (!d || !d.__colvioScript) return;
    if (d.type === "run") { if (runId !== null) return; runId = d.runId; }
    toRunner({ type: d.type, id: d.id, value: d.value, error: d.error, code: d.code, input: d.input, methods: d.methods, dryRun: d.dryRun });
  });

  out({ type: "ready" });
})();
