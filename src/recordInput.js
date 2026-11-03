// Show All Data › what the user pastes to open a record: a D365 form URL (etn= & id=), the legacy
// hash form (#/<table>/<guid>), a Web API URL — …/api/data/v9.2/accounts(<guid>), absolute or
// relative, what the Explorer, the API Tester's OData-EntityId header and Record activity links
// produce — "account/<guid>", "accounts(<guid>)" or a bare GUID; braces literal or %-encoded.
// Pure — no React, no bridge.

const GUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const NAME = "[A-Za-z_][A-Za-z0-9_]*";
const re = (src) => new RegExp(src.replace(/GUID/g, GUID).replace(/NAME/g, NAME), "i");
const API_RECORD = re("\\/?api\\/data\\/v\\d+(?:\\.\\d+)?\\/(NAME)\\(\\{?(GUID)\\}?\\)");
const ETN = re("[?&]etn=(NAME)(?=[&#]|$)"), ETN_ID = re("[?&]id=\\{?(GUID)\\}?(?=[&#]|$)");
const HASH = re("#.*?\\/(NAME)\\/\\{?(GUID)\\}?(?=[/?&#]|$)");
const SLASH = re("^(NAME)\\/\\{?(GUID)\\}?$");
const PAREN = re("^(NAME)\\(\\{?(GUID)\\}?\\)(?:[?/].*)?$");
const BARE = re("^\\{?(GUID)\\}?$");
const lc = (v) => String(v || "").toLowerCase();

// → { id, kind, name } or null. kind: "entity" (name is a table's logical name — etn=, hash),
// "set" (an entity set — Web API path), "name" (either — "account/…", "accounts(…)"), "id" (a bare
// GUID, name null). The table list resolves "set" / "name" to a logical name (resolveRecordTable).
export function parseRecordInput(text) {
  const s = String(text || "").trim().replace(/%7b/gi, "{").replace(/%7d/gi, "}");
  if (!s) return null;
  let m;
  if ((m = s.match(API_RECORD))) return { id: lc(m[2]), kind: "set", name: lc(m[1]) };
  const etn = s.match(ETN), id = s.match(ETN_ID);
  if (etn && id) return { id: lc(id[1]), kind: "entity", name: lc(etn[1]) };
  if ((m = s.match(HASH))) return { id: lc(m[2]), kind: "entity", name: lc(m[1]) };
  if ((m = s.match(SLASH)) || (m = s.match(PAREN))) return { id: lc(m[2]), kind: "name", name: lc(m[1]) };
  if ((m = s.match(BARE))) return { id: lc(m[1]), kind: "id", name: null };
  return null;
}

// The table (logical name) a parsed input points at, checked against the org's table list
// ([{ logical, entitySet }] from the bridge, or the UI's { l, p } rows). → { entity, verified } or
// { error }. Without a list (demo, or the read failed) the name is taken as typed and the metadata
// read decides — "verified: false" says so.
export function resolveRecordTable(parsed, entities) {
  const name = lc(parsed?.name);
  if (!name) return { error: "Cannot detect the table from a GUID alone. Use table/GUID or a full record URL." };
  const list = Array.isArray(entities) ? entities.filter(Boolean) : [];
  if (!list.length) return { entity: name, verified: false };
  const logical = (e) => lc(e.logical ?? e.l), set = (e) => lc(e.entitySet ?? e.p);
  const byLogical = list.find(e => logical(e) === name), bySet = list.find(e => set(e) === name);
  const hit = parsed.kind === "set" ? (bySet || byLogical) : (byLogical || bySet);
  if (hit) return { entity: logical(hit), verified: true };
  return { error: `table '${name}' not found on this org` };
}
