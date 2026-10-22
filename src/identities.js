// Automation › 👤 Who runs it — every identity that makes something run in the org, what kind of
// identity it is (a person, a service account, an app registration, a built-in system user, a
// team…) and what it runs: the cloud flows and processes it owns, the plug-in steps and real-time
// workflows that run as it, the connections signed in with its account. Pure: classification,
// flow-definition parsing, the who-runs-what join. Reads come from set-based content actions.

const lc = (v) => (v == null ? "" : String(v).toLowerCase());

export const KIND = {
  app: { label: "App registration", hint: "Application user — a Microsoft Entra app (client credentials), no person behind it" },
  msapp: { label: "Microsoft app", hint: "Application user created by Microsoft for a platform service" },
  builtin: { label: "Built-in", hint: "Dataverse's own SYSTEM / INTEGRATION user" },
  noninteractive: { label: "Service account", hint: "Non-interactive access mode — a service account by design (can't sign in to the apps)" },
  service: { label: "Service account?", hint: "Looks like a service account from its name or address (svc, integration, noreply…) — a guess, check it" },
  person: { label: "Person", hint: "A regular user — what it runs stops or breaks when this person leaves" },
  support: { label: "Microsoft support", hint: "Support user access mode" },
  delegated: { label: "Delegated admin", hint: "Partner delegated administrator" },
  team: { label: "Team", hint: "An owner team — automation owned by a team survives people leaving" },
  external: { label: "Not a Dataverse user", hint: "The connection's account matches no user of this environment — an external account or a service principal" },
  unknown: { label: "Unknown", hint: "Not readable" },
};

const SERVICE_RE = /(^|[^a-z0-9])(svc|srv|service|services|integration|integ|interface|automation|auto|robot|bot|noreply|no-reply|donotreply|sync|api|batch|daemon|system|admin[-_.]?crm|crm[-_.]?admin|flow|powerautomate|etl|middleware)([^a-z0-9]|$)/i;

// One systemuser row → { kind, label, hint }.
export function classifyIdentity(u) {
  if (!u) return { kind: "unknown", ...KIND.unknown };
  const name = String(u.fullname || u.name || "");
  if (u.applicationid) {
    const k = name.startsWith("#") ? "msapp" : "app";
    return { kind: k, ...KIND[k] };
  }
  if (/^(system|integration)$/i.test(name.trim()) && !u.domainname) return { kind: "builtin", ...KIND.builtin };
  const mode = Number(u.accessmode);
  if (mode === 4) return { kind: "noninteractive", ...KIND.noninteractive };
  if (mode === 3) return { kind: "support", ...KIND.support };
  if (mode === 5) return { kind: "delegated", ...KIND.delegated };
  if (SERVICE_RE.test(name) || SERVICE_RE.test(String(u.domainname || "").split("@")[0]) || SERVICE_RE.test(String(u.internalemailaddress || "").split("@")[0])) return { kind: "service", ...KIND.service };
  return { kind: "person", ...KIND.person };
}

// A cloud flow's clientdata → the connections it uses: [{ key, api, refLogicalName, connectionName, source }].
// source "invoker" = the run-only user's own connection ("provided by the user who runs it").
export function parseFlowConnections(clientdata) {
  let o;
  try { o = typeof clientdata === "string" ? JSON.parse(clientdata) : clientdata; } catch { return []; }
  const refs = o?.properties?.connectionReferences || o?.connectionReferences || {};
  const out = [];
  for (const [key, v] of Object.entries(refs)) {
    if (!v || typeof v !== "object") continue;
    const src = lc(v.runtimeSource || v.source || "");
    out.push({
      key,
      api: String(v.api?.name || v.apiName || key).replace(/^.*\/apis\//, ""),
      refLogicalName: lc(v.connection?.connectionReferenceLogicalName || ""),
      connectionName: lc(v.connection?.name || v.connectionName || ""),
      source: src === "invoker" ? "invoker" : "embedded",
    });
  }
  return out;
}

// "/providers/Microsoft.PowerApps/apis/shared_sharepointonline" → "sharepointonline"
export const connectorName = (id) => String(id || "").split("/").pop().replace(/^shared_/, "") || "";

// The join. Inputs (all optional):
//   procs:   [{ id, name, category, state, mode, runAs, ownerId, ownerType, owner, createdById, createdBy }]
//   steps:   [{ id, name, state, stage, runAsId, runAs }]
//   refs:    [{ id, name, logicalName, connectorId, connectionId, state, ownerId, ownerType, owner }]
//   instances: [{ id, name, accountName, internalId, connectorInternalId, status, state, refId, ownerId, owner }]
//   flowConns: { [flowId]: [parseFlowConnections rows] }
//   users:   { [systemuserid]: systemuser row }, usersByAccount: { [lower upn/email]: systemuser row }
// → { identities: [...], connections: [...] }
export function buildWhoRunsWhat({ procs = [], steps = [], refs = [], instances = [], flowConns = {}, users = {}, usersByAccount = {}, teams = {}, integrationUsers = [] } = {}) {
  const ids = new Map();
  const ident = (id, type, name) => {
    const k = `${type === "team" ? "team" : "user"}|${lc(id)}`;
    if (!ids.has(k)) {
      const u = type === "team" ? null : users[lc(id)];
      const cls = type === "team" ? { kind: "team", ...KIND.team } : classifyIdentity(u || (name ? { fullname: name } : null));
      ids.set(k, { key: k, id: lc(id), type: type === "team" ? "team" : "user", name: (u?.fullname) || name || (type === "team" ? teams[lc(id)] : "") || lc(id), email: u?.internalemailaddress || u?.domainname || "", appId: u?.applicationid || "", disabled: !!u?.isdisabled, accessMode: u?.accessmode, ...cls, uses: [] });
    }
    return ids.get(k);
  };
  const CAT = { 0: "Classic workflow", 1: "Dialog", 2: "Business rule", 3: "Custom action", 4: "Business process flow", 5: "Cloud flow", 6: "Desktop flow" };
  const isActiveProc = (p) => Number(p.state) === 1;

  for (const p of procs) {
    if (p.ownerId) ident(p.ownerId, p.ownerType, p.owner).uses.push({ what: "owns", kind: CAT[p.category] || "Process", name: p.name, id: p.id, active: isActiveProc(p) });
    // a real-time classic workflow runs as its owner (runas 0) or as whoever triggers it (1)
    if (Number(p.category) === 0 && Number(p.mode) === 1 && Number(p.runAs) === 0 && p.ownerId)
      ident(p.ownerId, p.ownerType, p.owner).uses.push({ what: "runs as", kind: "Real-time workflow", name: p.name, id: p.id, active: isActiveProc(p) });
  }
  for (const s of steps) {
    if (s.runAsId) ident(s.runAsId, "systemuser", s.runAs).uses.push({ what: "runs as", kind: "Plug-in step", name: s.name, id: s.id, active: Number(s.state) === 0 });
  }

  // connections: reference → instance (account) → flows using it
  const instByRef = new Map(), instByInternal = new Map();
  for (const i of instances) {
    if (i.refId) instByRef.set(lc(i.refId), i);
    if (i.internalId) instByInternal.set(lc(i.internalId), i);
  }
  const flowsByRef = new Map(), flowsByConnName = new Map(), invokerFlows = [];
  const procById = new Map(procs.map(p => [lc(p.id), p]));
  for (const [flowId, conns] of Object.entries(flowConns || {})) {
    const f = procById.get(lc(flowId));
    for (const c of conns || []) {
      const entry = { id: flowId, name: f?.name || flowId, active: f ? isActiveProc(f) : null, api: c.api };
      if (c.source === "invoker") invokerFlows.push(entry);
      if (c.refLogicalName) (flowsByRef.get(c.refLogicalName) || flowsByRef.set(c.refLogicalName, []).get(c.refLogicalName)).push(entry);
      else if (c.connectionName) (flowsByConnName.get(c.connectionName) || flowsByConnName.set(c.connectionName, []).get(c.connectionName)).push(entry);
    }
  }
  const connections = refs.map(r => {
    const inst = instByRef.get(lc(r.id)) || (r.connectionId ? instByInternal.get(lc(r.connectionId)) : null) || null;
    const account = inst?.accountName || "";
    const accUser = account ? usersByAccount[lc(account)] : null;
    const flows = flowsByRef.get(lc(r.logicalName)) || [];
    const row = {
      id: r.id, name: r.name || r.logicalName, logicalName: r.logicalName, connector: connectorName(r.connectorId),
      connected: !!r.connectionId, account, accountKind: account ? (accUser ? classifyIdentity(accUser) : { kind: "external", ...KIND.external }) : null,
      accountKnown: !!inst, status: inst?.status || "", owner: r.owner || "", flows,
    };
    if (account) {
      const who = accUser ? ident(accUser.systemuserid, "systemuser", accUser.fullname) : (() => {
        const k = `account|${lc(account)}`;
        if (!ids.has(k)) ids.set(k, { key: k, id: lc(account), type: "account", name: account, email: account, appId: "", disabled: false, kind: "external", ...KIND.external, uses: [] });
        return ids.get(k);
      })();
      who.uses.push({ what: "is the account of", kind: `connection (${row.connector || "connector"})`, name: row.name, id: r.id, active: flows.some(f => f.active) || null, flows: flows.length });
    }
    if (r.ownerId) ident(r.ownerId, r.ownerType, r.owner).uses.push({ what: "owns", kind: "Connection reference", name: row.name, id: r.id, active: null });
    return row;
  });

  // integration identities (app registrations, non-interactive users) that run nothing visible here:
  // if they are used, it's from outside — an integration calling the Web API
  for (const u of integrationUsers || []) {
    const cls = classifyIdentity(u);
    if (!["app", "msapp", "noninteractive"].includes(cls.kind)) continue;
    ident(u.systemuserid, "systemuser", u.fullname);
  }
  const identities = [...ids.values()].map(i => {
    const active = i.uses.filter(u => u.active === true).length;
    const flags = [];
    if (i.disabled && active) flags.push({ level: "error", text: `Disabled, yet ${active} active item${active === 1 ? "" : "s"} run${active === 1 ? "s" : ""} through it` });
    if (i.kind === "person" && i.uses.some(u => u.active && (u.what === "runs as" || u.what === "is the account of" || /Cloud flow|workflow/i.test(u.kind)))) flags.push({ level: "warn", text: "A person — this automation stops or breaks when they leave" });
    if (i.kind === "external" && i.uses.length) flags.push({ level: "info", text: "The connection's account isn't a user of this environment" });
    if (!i.uses.length && (i.kind === "app" || i.kind === "noninteractive")) flags.push({ level: "info", text: i.disabled ? "Disabled, runs nothing here" : "Runs nothing inside Dataverse — if it's in use, an integration calls the Web API with it from outside" });
    return { ...i, active, total: i.uses.length, flags };
  });
  const ORDER = { error: 0, warn: 1, info: 2 };
  identities.sort((a, b) => (Math.min(...a.flags.map(f => ORDER[f.level]), 9) - Math.min(...b.flags.map(f => ORDER[f.level]), 9)) || b.active - a.active || String(a.name).localeCompare(String(b.name)));
  return { identities, connections, invokerFlows, unmatchedFlowConnections: [...flowsByConnName.entries()].map(([name, flows]) => ({ name, flows })) };
}

export function kindCounts(identities) {
  const out = {};
  for (const i of identities || []) out[i.kind] = (out[i.kind] || 0) + 1;
  return out;
}

export const IDENTITY_HEADERS = ["Identity", "Email / UPN", "Kind", "Status", "What", "Item kind", "Item", "Active"];
export function identityExportRows(identities) {
  const rows = [];
  for (const i of identities || []) {
    const base = [i.name, i.email, i.label, i.disabled ? "Disabled" : "Enabled"];
    if (!i.uses.length) rows.push([...base, "", "", "", ""]);
    for (const u of i.uses) rows.push([...base, u.what, u.kind, u.name, u.active === true ? "Yes" : u.active === false ? "No" : ""]);
  }
  return rows;
}
export const CONNECTION_HEADERS = ["Connection reference", "Logical name", "Connector", "Connected", "Signed-in account", "Account kind", "Status", "Owner", "Flows using it"];
export const connectionExportRows = (conns) => (conns || []).map(c => [c.name, c.logicalName, c.connector, c.connected ? "Yes" : "No", c.account || (c.accountKnown ? "" : "not stored in Dataverse"), c.accountKind?.label || "", c.status, c.owner, c.flows.map(f => f.name).join("; ")]);
