// Environment-variable logic — PURE functions, no I/O, unit-tested.
//
// A variable = a DEFINITION (carries the default) + at most one VALUE row (the per-environment
// override). Effective value = override ?? default ?? nothing. The classic post-deployment trap
// is NEITHER — a flow or plugin reads an empty string and fails three screens later.

export const ENV_TYPES = {
  100000000: "String",
  100000001: "Number",
  100000002: "Boolean",
  100000003: "JSON",
  100000004: "Data source",
  100000005: "Secret",
};
export const envTypeLabel = (t, apiLabel) => apiLabel || ENV_TYPES[t] || `Type ${t}`;

/** Effective value + where it comes from. */
export function effectiveValue(v) {
  if (v.value != null && v.value !== "") return { value: v.value, source: "override" };
  if (v.defaultValue != null && v.defaultValue !== "") return { value: v.defaultValue, source: "default" };
  return { value: null, source: "none" };
}

/**
 * Validate a candidate override for the definition's type.
 * @returns {ok, error?} — Boolean env vars are the strings "yes"/"no" (documented convention);
 * JSON must parse; Number must be finite. Secret values are Key Vault REFERENCE paths
 * (/subscriptions/…/vaults/…/secrets/…) — required non-empty, content not further validated.
 */
export function validateEnvValue(type, raw) {
  const s = String(raw ?? "").trim();
  if (s === "") return { ok: false, error: "Empty value — use 'Clear override' to fall back to the default instead." };
  switch (type) {
    case 100000002:
      return /^(yes|no)$/i.test(s) ? { ok: true } : { ok: false, error: 'Boolean environment variables take the strings "yes" or "no".' };
    case 100000001:
      return Number.isFinite(Number(s)) ? { ok: true } : { ok: false, error: "Not a valid number." };
    case 100000003:
    case 100000004: // data-source values are JSON payloads too
      try { JSON.parse(s); return { ok: true }; } catch (e) { return { ok: false, error: `Invalid JSON: ${e.message}` }; }
    default:
      return { ok: true };
  }
}
