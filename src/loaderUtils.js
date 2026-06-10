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
  return Object.keys(counts).reduce((a, b) => counts[b] > counts[a] ? b : a, ",");
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
      const n = parseInt(val, 10); return isNaN(n) ? null : n;
    }
    case "picklist": {
      const n = parseInt(val, 10);
      if (!isNaN(n)) return n;
      if (optionMap && optionMap[low] !== undefined) return optionMap[low];
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
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
      const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(.*)$/);
      if (m) {
        const dd = m[1].padStart(2, "0"), mm = m[2].padStart(2, "0"), yyyy = m[3], rest = (m[4] || "").trim();
        return rest ? `${yyyy}-${mm}-${dd}T${rest.replace(/^[T\s]/, "")}` : `${yyyy}-${mm}-${dd}`;
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
