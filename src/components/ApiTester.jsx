import { useState, useEffect, useRef } from "react";
import { bridge } from "../d365-bridge.js";
import { C, I, Spin, mono, inp, bt, crd, copyText } from "../shared.jsx";
import { t } from "../i18n.js";

const METHODS = ["GET", "POST", "PATCH", "PUT", "DELETE"];
const METHOD_COLORS = {
  GET: C.cy, POST: C.gn, PATCH: C.or, PUT: C.yw, DELETE: C.rd,
};

const DEFAULT_HEADERS = [
  { key: "OData-MaxVersion", value: "4.0" },
  { key: "OData-Version", value: "4.0" },
  { key: "Accept", value: "application/json" },
];

const TEMPLATES = [
  { name: "Sample GET", method: "GET", path: "accounts?$select=name,accountnumber&$top=5", body: "" },
  { name: "Create record", method: "POST", path: "accounts", body: '{\n  "name": "Test Account from API Tester"\n}' },
  { name: "Update record", method: "PATCH", path: "accounts(00000000-0000-0000-0000-000000000000)", body: '{\n  "name": "Updated name"\n}' },
  { name: "Upsert by alt-key", method: "PATCH", path: "accounts(accountnumber='ABC123')", body: '{\n  "name": "Upserted via alt-key"\n}' },
  { name: "Delete record", method: "DELETE", path: "accounts(00000000-0000-0000-0000-000000000000)", body: "" },
  { name: "WhoAmI", method: "GET", path: "WhoAmI()", body: "" },
  { name: "RetrievePrivilegeSet (current user)", method: "GET", path: "RetrieveCurrentOrganization(AccessType=Microsoft.Dynamics.CRM.EndpointAccessType'Default')", body: "" },
];

const API_PREFIX = "/api/data/v9.2/";

export default function ApiTester({ bp, orgInfo, theme }) {
  const [method, setMethod] = useState("GET");
  const [path, setPath] = useState("accounts?$select=name&$top=5");
  const [headers, setHeaders] = useState(DEFAULT_HEADERS);
  const [body, setBody] = useState("");
  const [resp, setResp] = useState(null); // { ok, status, statusText, headers, body, bodyParsed, elapsed }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [respTab, setRespTab] = useState("body");
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [bodyError, setBodyError] = useState("");
  const [copied, setCopied] = useState("");
  const [loadFlash, setLoadFlash] = useState(false); // brief highlight when a template/history entry is loaded into the form
  const abortRef = useRef(null);
  const gutterRef = useRef(null);

  // Load history from storage on mount
  useEffect(() => {
    if (typeof chrome === "undefined" || !chrome.storage?.local) return;
    chrome.storage.local.get(["colvio_api_tester_history"], (r) => {
      // Guard against corrupted / older-shape storage — a non-array would crash history.map on render.
      const h = r?.colvio_api_tester_history;
      if (Array.isArray(h)) setHistory(h.filter(e => e && typeof e === "object"));
    });
  }, []);

  // Convert a 0-based character position into a 1-based line number.
  // The native JSON parser reports errors as "at position N" — translating to a
  // line number lets the user jump straight to the issue using the gutter.
  const positionToLine = (s, pos) => {
    if (typeof pos !== "number" || pos < 0) return null;
    return s.substring(0, pos).split("\n").length;
  };

  // Live JSON body validation — augment error message with line number when available.
  useEffect(() => {
    if (!body.trim() || method === "GET" || method === "DELETE" || method === "HEAD") {
      setBodyError("");
      return;
    }
    try { JSON.parse(body); setBodyError(""); }
    catch (e) {
      const msg = e.message || String(e);
      const m = msg.match(/position (\d+)/i);
      const line = m ? positionToLine(body, parseInt(m[1], 10)) : null;
      setBodyError(line ? `${msg} (line ${line})` : msg);
    }
  }, [body, method]);

  const hasBody = method !== "GET" && method !== "DELETE" && method !== "HEAD";
  // app.jsx exposes the org base as `orgUrl` in the extension; `clientUrl` only exists on the
  // standalone mock. Fall back through both so the URL preview + cURL export show the real origin.
  const orgBase = orgInfo?.orgUrl || orgInfo?.clientUrl || "";
  const fullUrl = `${orgBase}${API_PREFIX}${path}`;

  const sendRequest = async () => {
    setLoading(true); setError(""); setResp(null);
    const startTime = Date.now();
    const headersObj = {};
    for (const h of headers) {
      if (h.key && h.key.trim()) headersObj[h.key.trim()] = h.value || "";
    }
    try {
      const cleanPath = path.startsWith("http") ? path : `${API_PREFIX}${path.replace(/^\//, "")}`;
      const r = await bridge.customRequest({
        method,
        path: cleanPath,
        headers: headersObj,
        body: hasBody ? body : undefined,
      });
      setResp(r);
      // Redact secret-bearing headers before persisting history (a pasted token shouldn't be
      // written to local storage). The live request already went out with the real value.
      const SECRET_HDR = /^(authorization|cookie|x-api-key|x-functions-key|api-key)$/i;
      const safeHeaders = {};
      for (const [k, v] of Object.entries(headersObj)) safeHeaders[k] = SECRET_HDR.test(k) ? "***redacted***" : v;
      // Save to history
      const entry = {
        id: Date.now(),
        method, path, headers: safeHeaders, body: hasBody ? body : "",
        status: r.status, ok: r.ok,
        elapsed: r.elapsed, at: new Date().toISOString(),
      };
      // Functional updater avoids dropping entries when two sends race before a re-render flush.
      setHistory(prev => {
        const updated = [entry, ...prev].slice(0, 50);
        try { chrome.storage?.local?.set({ colvio_api_tester_history: updated }); } catch {}
        return updated;
      });
    } catch (e) {
      setError(e.message || String(e));
    }
    setLoading(false);
  };

  const exportAsCurl = () => {
    const url = fullUrl;
    const parts = [`curl -X ${method} '${url}'`];
    for (const h of headers) {
      if (h.key && h.key.trim()) parts.push(`  -H '${h.key}: ${h.value || ""}'`);
    }
    parts.push(`  --cookie 'YOUR_D365_AUTH_COOKIE'`);
    if (hasBody && body.trim()) {
      const oneLine = body.replace(/\n/g, "").replace(/'/g, "'\\''");
      parts.push(`  -d '${oneLine}'`);
    }
    const txt = parts.join(" \\\n");
    copyText(txt);
    setCopied("curl"); setTimeout(() => setCopied(""), 1500);
  };

  // Brief visual confirmation that a template/history entry was loaded into the form.
  // Without it, on small viewports the user can miss that the form scrolled or that fields updated.
  const flashFormLoaded = () => {
    setLoadFlash(true);
    setTimeout(() => setLoadFlash(false), 700);
  };

  const loadTemplate = (tpl) => {
    setMethod(tpl.method || "GET");
    setPath(tpl.path || "");
    setBody(tpl.body || "");
    setShowTemplates(false); setResp(null); setError("");
    flashFormLoaded();
  };

  const loadHistory = (entry) => {
    if (!entry) return;
    // Defensive: guarantee strings even if entry has missing fields from older storage
    setMethod(typeof entry.method === "string" ? entry.method : "GET");
    setPath(typeof entry.path === "string" ? entry.path : "");
    setBody(typeof entry.body === "string" ? entry.body : "");
    const hArr = Object.entries(entry.headers || {}).map(([key, value]) => ({ key, value: String(value ?? "") }));
    setHeaders(hArr.length ? hArr : DEFAULT_HEADERS);
    setShowHistory(false); setResp(null); setError("");
    flashFormLoaded();
  };

  const clearHistory = () => {
    setHistory([]);
    try { chrome.storage?.local?.remove("colvio_api_tester_history"); } catch {}
  };

  const updateHeader = (i, k, v) => {
    const u = [...headers]; u[i] = { ...u[i], [k]: v }; setHeaders(u);
  };
  const addHeader = () => setHeaders([...headers, { key: "", value: "" }]);
  const removeHeader = (i) => setHeaders(headers.filter((_, j) => j !== i));

  const cp = (txt, key) => { copyText(txt); setCopied(key); setTimeout(() => setCopied(""), 1200); };

  const formatBody = () => {
    if (!body.trim()) return;
    try { setBody(JSON.stringify(JSON.parse(body), null, 2)); }
    catch {}
  };

  const statusColor = (s) => {
    if (!s) return C.txd;
    if (s >= 200 && s < 300) return C.gn;
    if (s >= 300 && s < 400) return C.cy;
    if (s >= 400 && s < 500) return C.or;
    return C.rd;
  };

  return (
    <div style={{ padding: bp.mobile ? 10 : 16, maxWidth: 1200, margin: "0 auto" }}>
      {/* Method + URL bar */}
      <div style={{ ...crd({ padding: 10, borderColor: loadFlash ? C.cy : C.bd, boxShadow: loadFlash ? `0 0 0 2px ${C.cy}44` : "none", transition: "border-color .2s ease, box-shadow .2s ease" }), marginBottom: 10 }}>
        <div style={{ display: "flex", gap: 6, alignItems: "stretch", flexWrap: bp.mobile ? "wrap" : "nowrap" }}>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            style={inp({
              width: 110, fontSize: 14, fontWeight: 700, ...mono,
              color: METHOD_COLORS[method] || C.tx,
              border: `1px solid ${METHOD_COLORS[method] || C.bd}`,
            })}
          >
            {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <div style={{ flex: 1, display: "flex", alignItems: "stretch", border: `1px solid ${C.bd}`, borderRadius: 6, background: C.bg, overflow: "hidden" }}>
            <span style={{ padding: "8px 10px", color: C.txd, fontSize: 12, ...mono, background: C.sfh, borderRight: `1px solid ${C.bd}`, whiteSpace: "nowrap", display: "flex", alignItems: "center" }}>
              {API_PREFIX}
            </span>
            <input
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="accounts?$select=name&$top=5"
              style={{ flex: 1, padding: "8px 12px", background: "transparent", border: "none", color: C.tx, fontSize: 13, ...mono, outline: "none" }}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) sendRequest(); }}
            />
          </div>
          <button
            onClick={sendRequest}
            disabled={loading || (hasBody && bodyError && body.trim())}
            style={{ ...bt(`linear-gradient(135deg,${C.vi},${C.vid})`, { fontSize: 14, fontWeight: 700, padding: "8px 18px", opacity: loading ? 0.6 : 1 }) }}
            title="Ctrl/Cmd + Enter"
          >
            {loading ? <><Spin s={12} /> Sending...</> : <><I.Zap /> Send</>}
          </button>
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button onClick={() => setShowTemplates(!showTemplates)} style={{ padding: "3px 9px", fontSize: 11, background: showTemplates ? C.vi : "transparent", color: showTemplates ? "white" : C.txm, border: `1px solid ${C.bd}`, borderRadius: 4, cursor: "pointer" }}>
            📋 Templates ({TEMPLATES.length})
          </button>
          <button onClick={() => setShowHistory(!showHistory)} style={{ padding: "3px 9px", fontSize: 11, background: showHistory ? C.vi : "transparent", color: showHistory ? "white" : C.txm, border: `1px solid ${C.bd}`, borderRadius: 4, cursor: "pointer" }}>
            🕐 History ({history.length})
          </button>
          <button onClick={exportAsCurl} style={{ padding: "3px 9px", fontSize: 11, background: "transparent", color: C.txm, border: `1px solid ${C.bd}`, borderRadius: 4, cursor: "pointer" }}>
            {copied === "curl" ? "✓ Copied" : "Copy as cURL"}
          </button>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: C.txd, ...mono, maxWidth: bp.mobile ? "100%" : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={fullUrl}>{fullUrl}</span>
        </div>
      </div>

      {/* Templates panel */}
      {showTemplates && (
        <div style={{ ...crd({ padding: 10 }), marginBottom: 10 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {TEMPLATES.map(tpl => (
              <button key={tpl.name} onClick={() => loadTemplate(tpl)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "transparent", border: `1px solid ${C.bd}`, borderRadius: 5, cursor: "pointer", textAlign: "left" }}>
                <span style={{ minWidth: 64, fontSize: 11, fontWeight: 700, ...mono, color: METHOD_COLORS[tpl.method] || C.tx }}>{tpl.method}</span>
                <span style={{ flex: 1, ...mono, fontSize: 12, color: C.txm, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tpl.path}</span>
                <span style={{ fontSize: 11, color: C.txd }}>{tpl.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* History panel */}
      {showHistory && (
        <div style={{ ...crd({ padding: 10 }), marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: C.txd }}>Last {history.length} requests (saved locally)</span>
            {history.length > 0 && <button onClick={clearHistory} style={{ padding: "2px 8px", fontSize: 10, background: "transparent", color: C.rd, border: `1px solid ${C.rd}55`, borderRadius: 3, cursor: "pointer" }}>Clear history</button>}
          </div>
          <div style={{ maxHeight: 240, overflow: "auto", display: "flex", flexDirection: "column", gap: 3 }}>
            {history.length === 0 ? (
              <div style={{ padding: 20, textAlign: "center", color: C.txd, fontSize: 12 }}>No requests yet. Send one to start building your history.</div>
            ) : history.map(h => (
              <button key={h.id} onClick={() => loadHistory(h)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", background: "transparent", border: `1px solid ${C.bd}`, borderRadius: 4, cursor: "pointer", textAlign: "left" }}>
                <span style={{ minWidth: 52, fontSize: 10, fontWeight: 700, ...mono, color: METHOD_COLORS[h.method] || C.tx }}>{h.method}</span>
                <span style={{ minWidth: 38, fontSize: 10, fontWeight: 600, ...mono, color: statusColor(h.status) }}>{h.status || "—"}</span>
                <span style={{ flex: 1, ...mono, fontSize: 11, color: C.txm, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.path}</span>
                <span style={{ fontSize: 10, color: C.txd }}>{h.elapsed}ms</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Headers */}
      <div style={{ ...crd({ padding: 10 }), marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Headers ({headers.filter(h => h.key).length})</span>
          <button onClick={addHeader} style={{ padding: "3px 8px", fontSize: 11, background: "transparent", color: C.cy, border: `1px dashed ${C.bd}`, borderRadius: 3, cursor: "pointer" }}><I.Plus /> Add</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {headers.map((h, i) => (
            <div key={i} style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <input value={h.key} onChange={(e) => updateHeader(i, "key", e.target.value)} placeholder="Header name" style={inp({ flex: bp.mobile ? "1" : "0 0 35%", fontSize: 12, ...mono, padding: "4px 8px" })} list="dl_headers" />
              <input value={h.value} onChange={(e) => updateHeader(i, "value", e.target.value)} placeholder="value" style={inp({ flex: 1, fontSize: 12, ...mono, padding: "4px 8px" })} />
              <button onClick={() => removeHeader(i)} style={{ padding: 4, background: "transparent", border: "none", color: C.txd, cursor: "pointer" }}><I.X /></button>
            </div>
          ))}
        </div>
        <datalist id="dl_headers">
          <option value="Content-Type" />
          <option value="Prefer" />
          <option value="If-Match" />
          <option value="If-None-Match" />
          <option value="MSCRM.SuppressDuplicateDetection" />
          <option value="MSCRM.BypassCustomPluginExecution" />
          <option value="MSCRM.SolutionUniqueName" />
          <option value="x-ms-client-session-id" />
        </datalist>
      </div>

      {/* Body */}
      {hasBody && (
        <div style={{ ...crd({ padding: 10 }), marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Body (JSON)</span>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {bodyError ? (
                <span style={{ fontSize: 11, color: C.rd, ...mono }}>⚠ {bodyError}</span>
              ) : body.trim() ? (
                <span style={{ fontSize: 11, color: C.gn }}>✓ Valid JSON · {body.split("\n").length} lines</span>
              ) : null}
              <button onClick={formatBody} disabled={!body.trim() || !!bodyError} style={{ padding: "2px 8px", fontSize: 11, background: "transparent", color: bodyError || !body.trim() ? C.txd : C.cy, border: `1px solid ${C.bd}`, borderRadius: 3, cursor: bodyError || !body.trim() ? "default" : "pointer" }}>Format</button>
            </div>
          </div>
          {/* Editor with line numbers gutter. Wrapper is the resizable element; both gutter and textarea share line-height/font-size for vertical alignment. */}
          <div style={{ display: "flex", border: `1px solid ${bodyError ? C.rd : C.bd}`, borderRadius: 5, overflow: "hidden", background: C.bg, height: 180, minHeight: 140, resize: "vertical" }}>
            <pre
              ref={gutterRef}
              aria-hidden="true"
              style={{
                margin: 0,
                padding: "10px 8px 10px 10px",
                background: C.sfh,
                color: C.txd,
                fontSize: 13,
                ...mono,
                textAlign: "right",
                userSelect: "none",
                lineHeight: "1.5",
                borderRight: `1px solid ${C.bd}`,
                overflow: "hidden",
                flexShrink: 0,
                minWidth: 32,
                whiteSpace: "pre",
              }}
            >
              {Array.from({ length: Math.max(1, body.split("\n").length) }, (_, i) => i + 1).join("\n")}
            </pre>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onScroll={(e) => { if (gutterRef.current) gutterRef.current.scrollTop = e.target.scrollTop; }}
              placeholder='{\n  "name": "Test"\n}'
              spellCheck={false}
              style={{
                flex: 1,
                padding: 10,
                background: "transparent",
                border: "none",
                color: C.tx,
                fontSize: 13,
                ...mono,
                lineHeight: "1.5",
                outline: "none",
                resize: "none",
                boxSizing: "border-box",
              }}
            />
          </div>
        </div>
      )}

      {/* Response */}
      {(loading || resp || error) && (
        <div style={{ ...crd({ overflow: "hidden" }), marginBottom: 10 }}>
          <div style={{ padding: "8px 10px", borderBottom: `1px solid ${C.bd}`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Response</span>
            {loading && <><Spin s={12} /><span style={{ fontSize: 12, color: C.txd }}>Sending...</span></>}
            {resp && (
              <>
                <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 3, background: statusColor(resp.status) + "22", color: statusColor(resp.status), fontWeight: 700 }}>
                  {resp.status} {resp.statusText}
                </span>
                <span style={{ fontSize: 11, color: C.txd, ...mono }}>{resp.elapsed}ms</span>
                {resp.body && <span style={{ fontSize: 11, color: C.txd }}>{(new Blob([resp.body]).size / 1024).toFixed(1)} KB</span>}
              </>
            )}
            <div style={{ flex: 1 }} />
            {resp && (
              <>
                <button onClick={() => { setRespTab("body"); }} style={{ padding: "2px 8px", fontSize: 11, background: respTab === "body" ? C.vi : "transparent", color: respTab === "body" ? "white" : C.txm, border: `1px solid ${C.bd}`, borderRadius: 3, cursor: "pointer" }}>Body</button>
                <button onClick={() => { setRespTab("headers"); }} style={{ padding: "2px 8px", fontSize: 11, background: respTab === "headers" ? C.vi : "transparent", color: respTab === "headers" ? "white" : C.txm, border: `1px solid ${C.bd}`, borderRadius: 3, cursor: "pointer" }}>Headers ({Object.keys(resp.headers || {}).length})</button>
                <button onClick={() => cp(resp.bodyParsed ? JSON.stringify(resp.bodyParsed, null, 2) : (resp.body || ""), "resp")} style={{ padding: "2px 8px", fontSize: 11, background: "transparent", color: C.cy, border: `1px solid ${C.bd}`, borderRadius: 3, cursor: "pointer" }}>{copied === "resp" ? "✓ Copied" : "Copy"}</button>
              </>
            )}
          </div>
          <div style={{ padding: 10, maxHeight: 500, overflow: "auto" }}>
            {error && <div style={{ color: C.rd, fontSize: 12, ...mono }}>{error}</div>}
            {resp && respTab === "body" && (
              <pre style={{ margin: 0, ...mono, fontSize: 12, color: resp.ok ? C.tx : C.rd, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {resp.bodyParsed ? JSON.stringify(resp.bodyParsed, null, 2) : (resp.body || "(empty)")}
              </pre>
            )}
            {resp && respTab === "headers" && (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, ...mono }}>
                <tbody>
                  {Object.entries(resp.headers || {}).map(([k, v]) => (
                    <tr key={k} style={{ borderBottom: `1px solid ${C.bd}` }}>
                      <td style={{ padding: "4px 8px", color: C.cy, verticalAlign: "top", width: "30%" }}>{k}</td>
                      <td style={{ padding: "4px 8px", color: C.txm, wordBreak: "break-all" }}>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Help footer */}
      <div style={{ fontSize: 11, color: C.txd, padding: "6px 10px", lineHeight: 1.6 }}>
        💡 Auth is automatic via your D365 session cookies — no token to manage. Requests are scoped to your active org ({orgInfo?.orgName || "unknown"}). Press Ctrl+Enter in the URL field to send.
      </div>
    </div>
  );
}
