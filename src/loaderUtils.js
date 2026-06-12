// Pure, dependency-free helpers used by the Data Loader. Extracted so they can be unit-tested
// (the component itself isn't easily testable). No React, no DOM, no network.

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
export function applyTransform(val, transform, optionMap) {
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
    case "int": { const n = parseInt(String(val).replace(/[\s ]/g, ""), 10); return isNaN(n) ? null : n; }
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
        let dd = +m[1], mm = +m[2];
        // Day-first by default (EU); if the middle part can't be a month, it's US m/d → swap.
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
