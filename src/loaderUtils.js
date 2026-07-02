// Pure, dependency-free helpers used by the Data Loader. Extracted so they can be unit-tested
// (the component itself isn't easily testable). No React, no DOM, no network.

// Migration mode — map an overridable audit field + value to the exact Web API key/value to send
// on a CREATE (POST). createdby/modifiedby are systemuser lookups → @odata.bind; createdon maps to
// overriddencreatedon (the only writable created-date attribute — setting createdon directly is a
// no-op in Dataverse); modifiedon / overriddencreatedon are written as direct values. Requires the
// prvOverrideCreatedOnCreatedBy privilege at runtime.
export function migrationOverridePair(logical, value) {
  const ln = String(logical || "").toLowerCase();
  if (ln === "createdby" || ln === "modifiedby") return { key: `${ln}@odata.bind`, value: `/systemusers(${String(value).trim()})` };
  if (ln === "createdon" || ln === "overriddencreatedon") return { key: "overriddencreatedon", value };
  return { key: ln, value };
}

// Classify a per-row load error as TRANSIENT (worth retrying as-is) vs deterministic. Transient =
// timeouts / aborts, throttling (429 / service-protection limits), 5xx, SQL deadlocks/locks, network
// blips. Deterministic 400/403/404 (bad data, no privilege, not found) are NOT matched — a blind
// retry sends the same payload and fails identically. Patterns avoid bare 3-digit numbers (a "max 504
// chars" length error must not read as a 504 gateway timeout) by anchoring 5xx/429 on "HTTP <code>".
export function isTransientError(msg) {
  const s = String(msg || "").toLowerCase();
  if (!s) return false;
  return (
    /timeout|timed out|\baborted?\b|operation was aborted/.test(s) ||
    /http 429|too many requests|service protection|0x8007232[123]|number of requests|request limit|throttl|re-run to retry/.test(s) ||
    /http 50[234]|service unavailable|bad gateway|gateway timeout/.test(s) ||
    /deadlock|generic sql error|lock request time/.test(s) ||
    /failed to fetch|network error|connection reset|econnreset|socket hang up/.test(s)
  );
}

// Explicit "clear this field" token for the Data Loader. An EMPTY cell always means "leave the
// field untouched" (so partial files can't wipe data) — typing NULL (any case) is the opt-in way
// to actually erase a value. For lookups the request sends the bare navigation property set to
// null, the documented Web API disassociate.
export function isNullToken(v) {
  return typeof v === "string" && /^null$/i.test(v.trim());
}

// RFC-4180 delimited parser — handles quoted fields, embedded delimiters/newlines, and ""
// escaping. Preserves every value as its exact string (no number coercion → leading zeros and
// SAP-style codes survive). Returns an array of string arrays.
export function parseDelimited(text, sep) {
  const rows = []; let row = []; let field = ""; let inQ = false; const n = text.length;
  for (let i = 0; i < n; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === sep) { row.push(field); field = ""; }
      else if (c === '\r') { /* skip */ }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ""; }
      else field += c;
    }
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// Detect the most likely delimiter from the first (unquoted) line.
export function detectSep(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const counts = { ",": 0, "\t": 0, ";": 0 };
  let inQ = false;
  for (const c of firstLine) { if (c === '"') inQ = !inQ; else if (!inQ && counts[c] !== undefined) counts[c]++; }
  // An unquoted tab is decisive: pasted Excel/TSV always tab-separates cells, while commas and
  // semicolons commonly appear INSIDE cell content ("Revenue, gross" would out-count the tab).
  if (counts["\t"] > 0) return "\t";
  return counts[";"] > counts[","] ? ";" : ",";
}

export const STATECODE_MAP = { active: 0, inactive: 1, actif: 0, inactif: 1, "0": 0, "1": 1 };
export const BOOLEAN_YESNO = { yes: true, no: false, oui: true, non: false, true: true, false: false, "1": true, "0": false, vrai: true, faux: false };

// Convert a raw CSV value into the Dataverse-ready value for the chosen transform.
// optionMap (optional): { "<label lowercased>": <int value> } enables label→value for option sets.
export function applyTransform(val, transform, optionMap, dateMD = false) {
  if (val === undefined || val === null || val === "") return null;
  const low = String(val).toLowerCase().trim();
  switch (transform) {
    case "statecode": {
      if (STATECODE_MAP[low] !== undefined) return STATECODE_MAP[low];
      if (optionMap && optionMap[low] !== undefined) return optionMap[low];
      if (/^-?\d+$/.test(low)) return parseInt(low, 10);
      return null;
    }
    case "picklist": {
      // Label lookup FIRST: a label like "3 - Hot" must map to its real option value, not be
      // truncated to 3 by a loose parseInt. Numeric passthrough only for strictly-numeric strings.
      if (optionMap && optionMap[low] !== undefined) return optionMap[low];
      if (/^-?\d+$/.test(low)) return parseInt(low, 10);
      return null;
    }
    case "boolean_yesno": {
      if (BOOLEAN_YESNO[low] !== undefined) return BOOLEAN_YESNO[low];
      return null;
    }
    case "boolean": return low === "true" || low === "1" || low === "oui" || low === "yes";
    case "int": {
      // Strip whitespace (incl. NBSP/narrow-NBSP) and thousands-grouping commas, THEN require a clean
      // number - avoids parseInt silent partial parse: "1,000"->1 (comma stops parse), "12abc"->12;
      // now "1,000"/"1 000"->1000 and garbage -> null.
      const s = String(val).trim().replace(/[\s  ]/g, "").replace(/,/g, "");
      if (!/^[+-]?\d+(\.\d+)?$/.test(s)) return null;
      return Math.trunc(parseFloat(s));
    }
    case "float": {
      let s = String(val).trim().replace(/[\s ]/g, "");
      if (s.includes(",") && s.includes(".")) {
        if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
        else s = s.replace(/,/g, "");
      } else if (s.includes(",")) {
        s = s.replace(",", ".");
      }
      const n = parseFloat(s); return isNaN(n) ? null : n;
    }
    case "date_iso": {
      const s = String(val).trim();
      // ISO date-only: keep verbatim — avoids the UTC-midnight shift on DateOnly fields.
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
      const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:[T\s]+(.*))?$/);
      if (m) {
        // Day-first by default (EU d/m); dateMD forces month-first (US m/d). Either way, if the chosen
        // order is impossible (the "month" part is >12), swap — that case is unambiguous.
        let dd = dateMD ? +m[2] : +m[1];
        let mm = dateMD ? +m[1] : +m[2];
        if (mm > 12 && dd <= 12) { const t = dd; dd = mm; mm = t; }
        if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
        const dateStr = `${m[3]}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
        const rest = (m[4] || "").trim();
        if (!rest) return dateStr; // DateOnly — no time, no TZ shift
        // Time part: HH:mm[:ss] with optional AM/PM → build a LOCAL Date, emit UTC ISO.
        const t = rest.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i);
        if (!t) return null; // unrecognized time → explicit null beats sending invalid ISO (400)
        let hh = +t[1];
        if (t[4]) { const pm = /p/i.test(t[4]); if (pm && hh < 12) hh += 12; if (!pm && hh === 12) hh = 0; }
        const d = new Date(`${dateStr}T${String(hh).padStart(2, "0")}:${t[2]}:${t[3] || "00"}`);
        return isNaN(d.getTime()) ? null : d.toISOString();
      }
      try { const d = new Date(s); return isNaN(d.getTime()) ? null : d.toISOString(); } catch { return null; }
    }
    case "upper": return String(val).toUpperCase();
    case "lower": return String(val).toLowerCase();
    default: return val;
  }
}

// Default match key for UPSERT / UPDATE / DELETE. Prefers the first registered alternate key over
// the primary key. The CSV column is auto-paired ONLY when a header actually matches the key name
// (case-insensitive) — it must NEVER fall back to the first column: doing so silently matched on the
// wrong column, which fails as 404 in UPDATE-only and, far worse, creates mass duplicates in UPSERT
// (no match on the wrong column → "create"). An unmatched key returns c:"" so the UI warns instead.
export function defaultMatchKey(altKeys, pkField, headers) {
  const d = (altKeys && altKeys[0]) || pkField || "";
  const c = (headers || []).find(h => String(h).toLowerCase() === String(d).toLowerCase()) || "";
  return { d, c };
}

// Abstract / polymorphic owner-like targets that can't be bound directly.
export const ABSTRACT_ENTITY_SETS = { owner: "systemusers", principal: "systemusers" };

// Resolve the real EntitySetName for @odata.bind. `entities` is the loaded entity list
// (objects with { l: logicalName, p: entitySetName }). Falls back to logical+"s" only when unknown.
export function resolveEntitySet(logical, entities, abstractMap = ABSTRACT_ENTITY_SETS) {
  if (!logical) return "";
  const found = (entities || []).find(e => e.l === logical);
  if (found && found.p) return found.p;
  if (abstractMap[logical]) return abstractMap[logical];
  return logical + "s";
}

// Tolerant equality for delta mode: compares a value we are about to send with the value
// currently in the org. Coerces number-vs-string, boolean-vs-string, null/undefined-vs-"",
// and datetimes that differ only in representation (offset/ms).
export function deltaEqual(orgVal, newVal) {
  let a = orgVal, b = newVal;
  if (a === null || a === undefined) a = "";
  if (b === null || b === undefined) b = "";
  if (a === b) return true;
  if (typeof a === "number" || typeof b === "number") {
    const na = Number(a), nb = Number(b);
    if (!isNaN(na) && !isNaN(nb)) return na === nb;
  }
  if (typeof a === "boolean" || typeof b === "boolean") return String(a) === String(b);
  const sa = String(a), sb = String(b);
  if (sa === sb) return true;
  if (/^\d{4}-\d{2}-\d{2}/.test(sa) && /^\d{4}-\d{2}-\d{2}/.test(sb)) {
    const da = new Date(sa), db = new Date(sb);
    if (!isNaN(da.getTime()) && !isNaN(db.getTime())) return da.getTime() === db.getTime();
  }
  return false;
}
