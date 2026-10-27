// Explorer › OData — turn whatever the user pastes into a path Colvio can run on the CURRENT org:
// "GET /api/data/v9.2/accounts?$select=name", a full URL copied from the browser, Postman or
// XrmToolBox (any host, %-encoded or not), "/api/data/v9.0/…", or a bare "accounts?$select=name".
// Pure — no React, no bridge.

const SET_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const API_RE_START = /^\/?api\/data\/v\d+(?:\.\d+)?\//i;

// → { path, entitySet, host, foreignHost } or { error }. `path` is what the raw query action takes
// ("accounts?$select=name"); `host` is set when a full URL was pasted, `foreignHost` when that URL
// points at another environment than the panel's (the query then runs on THIS one — say so).
export function normalizeODataInput(text, orgUrl) {
  // A wrapped query, indentation included: a break next to a URL delimiter (& ? = , parens) is pure
  // wrapping and goes; elsewhere it stood for a space ("statecode eq 0⏎and …" must not become "0and").
  const GLUE = "&?=,()";
  let s = String(text || "").replace(/\s*[\r\n]+\s*/g, (m, at, str) => (GLUE.includes(str[at - 1] || "&") || GLUE.includes(str[at + m.length] || "&")) ? "" : " ").trim();
  if (!s) return { error: "The OData query is empty." };
  s = s.replace(/^GET\s+/i, "");
  let host = null;
  if (/^https?:\/\//i.test(s)) {
    let u;
    try { u = new URL(s); } catch { return { error: "That URL can't be read." }; }
    host = u.host;
    const m = u.pathname.match(/\/api\/data\/v\d+(?:\.\d+)?\/(.+)$/i);
    if (!m) return { error: "That isn't a Dataverse Web API URL — it should contain /api/data/v9.x/ followed by a table." };
    s = m[1] + u.search;
  } else {
    s = s.replace(API_RE_START, "").replace(/^\/+/, "");
  }
  const raw = s.split(/[(?/]/)[0];
  let entitySet = raw;
  try { entitySet = decodeURIComponent(raw); } catch { /* keep as is */ }
  if (!SET_RE.test(entitySet)) return { error: `"${entitySet || s}" isn't a table name (entity set) — the query should start with one, e.g. accounts?$select=name.` };
  let current = null;
  try { current = orgUrl ? new URL(orgUrl).host.toLowerCase() : null; } catch { /* unknown */ }
  return { path: s, entitySet, host, foreignHost: !!(host && current && host.toLowerCase() !== current) };
}

// How the OData box shows a path.
export const displayODataPath = (path) => `GET /api/data/v9.2/${path}`;

// The table behind an entity set name (accounts → account).
export function entityForSet(entities, set) {
  const s = String(set || "").toLowerCase();
  return (entities || []).find(e => String(e?.p || "").toLowerCase() === s) || null;
}

// Does this look like an OData query or URL (to treat a paste as one)?
export const looksLikeOData = (text) => /^\s*(GET\s+)?(https?:\/\/[^\s]+\/api\/data\/v\d|\/?api\/data\/v\d)/i.test(String(text || ""));
