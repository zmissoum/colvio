// Metadata › 📑 Layers — the solution layers of a column or a table (msdyn_componentlayers, the
// virtual table behind the maker portal's "See solution layers"): which solutions touch it, in which
// order, what each one changed, and the classic trap — an unmanaged "Active" layer on top of a
// managed solution, which hides what the next import of that solution changes. Pure: shaping.

const MAX_VALUE = 240;
const short = (v) => {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s == null ? "" : s.length > MAX_VALUE ? s.slice(0, MAX_VALUE) + "…" : s;
};

// msdyn_changes → [{ key, value }]. Usually { Attributes: [{ Key, Value }] }; any other JSON object
// is read as key/value pairs; text that isn't JSON is kept as one raw entry.
export function parseChanges(text) {
  if (text == null || text === "") return [];
  let o;
  try { o = typeof text === "string" ? JSON.parse(text) : text; } catch { return [{ key: "(raw)", value: short(String(text)) }]; }
  if (o && Array.isArray(o.Attributes)) return o.Attributes.filter(a => a && a.Key != null).map(a => ({ key: String(a.Key), value: short(a.Value) }));
  if (Array.isArray(o)) return o.map((v, i) => ({ key: String(v?.Key ?? i), value: short(v?.Value ?? v) }));
  if (o && typeof o === "object") return Object.entries(o).map(([k, v]) => ({ key: k, value: short(v) }));
  return [{ key: "(value)", value: short(o) }];
}

export const isActiveLayer = (name) => /^active$/i.test(String(name || "").trim());
export const isSystemLayer = (name) => /^system$/i.test(String(name || "").trim());

// Rows → layers, top (highest order) first.
export function normalizeLayers(rows) {
  return (rows || []).map(r => ({
    order: Number(r.msdyn_order) || 0,
    solution: r.msdyn_solutionname || "",
    publisher: r.msdyn_publishername || "",
    at: r.msdyn_overwritetime || null,
    changes: parseChanges(r.msdyn_changes),
    active: isActiveLayer(r.msdyn_solutionname),
    system: isSystemLayer(r.msdyn_solutionname),
  })).sort((a, b) => b.order - a.order);
}

// The verdict: what the stack means for whoever deploys solutions to this environment.
export function layerSummary(layers) {
  const list = layers || [];
  if (!list.length) return { level: "info", text: "No layer returned — the component may not be solution-aware, or the org doesn't expose solution layers." };
  const top = list[0];
  const managed = list.filter(l => !l.active && !l.system);
  if (top.active && managed.length) {
    const keys = top.changes.map(c => c.key);
    return {
      level: "warn",
      text: `An unmanaged "Active" layer sits on top of the managed solution ${managed[0].solution}${keys.length ? ` and overrides ${keys.length} propert${keys.length === 1 ? "y" : "ies"} (${keys.slice(0, 6).join(", ")}${keys.length > 6 ? "…" : ""})` : ""}: what the next import of ${managed[0].solution} changes there stays hidden until the Active layer is removed.`,
    };
  }
  if (top.active) return { level: "info", text: "Unmanaged (\"Active\") on top of the system layer only — the normal state of a component created or customized in this environment." };
  if (managed.length > 1) return { level: "info", text: `${managed.length} managed solutions layer it; the top one, ${top.solution}, wins for every property it sets.` };
  if (managed.length === 1) return { level: "ok", text: `Managed by ${managed[0].solution}, no unmanaged change on top.` };
  return { level: "ok", text: "Only the system layer — no solution customizes it." };
}

// Which properties each layer changes that a higher layer changes again (overridden below the top).
export function overriddenKeys(layers) {
  const seenAbove = new Set(), out = new Map();
  for (const l of layers || []) {
    out.set(l, l.changes.filter(c => seenAbove.has(c.key)).map(c => c.key));
    for (const c of l.changes) seenAbove.add(c.key);
  }
  return out;
}
