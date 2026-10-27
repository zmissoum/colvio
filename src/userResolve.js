// Pasted emails / UPNs → systemuser rows. Shared by Security Audit (bulk assign) and Business
// Units (move INTO): the OData filter for one chunk of tokens, and the per-token resolution. Pure.

// One chunk of tokens → $filter on email OR UPN. Only the OData-level quote is escaped here: the
// content.js query action percent-encodes options.filter as a whole, so a raw "+" or "&" in a
// pasted address reaches Dataverse intact (pre-encoding here would be encoded twice).
export function userLookupFilter(tokens) {
  const lit = (t) => `'${String(t).replace(/'/g, "''")}'`;
  return (tokens || []).map(t => `(internalemailaddress eq ${lit(t)} or domainname eq ${lit(t)})`).join(" or ");
}

// Several users share one address (internalemailaddress is NOT unique — a disabled stale account
// next to the re-provisioned active one): prefer the enabled, non-application user; when that
// still leaves several (or none), null — never pick one silently.
export function pickUser(candidates) {
  const c = candidates || [];
  if (c.length <= 1) return c[0] || null;
  const live = c.filter(u => !u.disabled && !u.isApp);
  return live.length === 1 ? live[0] : null;
}

// Resolve each token to ONE user, matching email or UPN case-insensitively.
// users: [{ id, email, upn, disabled, isApp }] (duplicates by id are fine).
// → { byToken: Map(lower(token) → user), ambiguous: Map(lower(token) → candidate count) }.
// A token in neither map is simply unknown to the org.
export function resolveUsers(users = [], tokens = []) {
  const byAddr = new Map(); // lower(email|upn) → [user…], distinct by id
  for (const u of users) {
    for (const k of [u.email, u.upn]) {
      const key = String(k || "").trim().toLowerCase();
      if (!key) continue;
      const arr = byAddr.get(key) || [];
      if (!arr.some(x => String(x.id).toLowerCase() === String(u.id).toLowerCase())) arr.push(u);
      byAddr.set(key, arr);
    }
  }
  const byToken = new Map(), ambiguous = new Map();
  for (const t of tokens) {
    const key = String(t).trim().toLowerCase();
    const cands = byAddr.get(key);
    if (!cands) continue;
    const u = pickUser(cands);
    if (u) byToken.set(key, u); else ambiguous.set(key, cands.length);
  }
  return { byToken, ambiguous };
}
