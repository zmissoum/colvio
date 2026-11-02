// Automation › Runs as / Sends email as — what a definition says about the identity an
// automation's actions run with and the address its emails leave from.
//  - Cloud flows: the clientdata JSON. A flow does NOT run as its owner: each action runs with
//    the account of ITS connection (or of whoever runs it, for an "invoker" connection). An
//    email action's sender is a parameter of that action when it has one (Outlook's "From (Send
//    as)", a shared mailbox, SMTP's From…), else the connection's account.
//  - Classic workflows, actions, dialogs: the XAML. A Send Email step's From is a user or a queue,
//    fixed in the step or taken from the row (its owner…).
// Pure: parsing and labelling. The accounts behind the connections come from Who runs it's reads.
import { parseFlowConnections, connectorName } from "./identities.js";

const lc = (v) => (v == null ? "" : String(v).toLowerCase());
// "@{variables('x')}", "@triggerOutputs()?['body/emailaddress1']" — a value set at run time
const isExpr = (v) => typeof v === "string" && /^\s*@/.test(v);
const exprText = (v) => String(v).trim().replace(/^@\{?/, "").replace(/\}$/, "").slice(0, 80);
const varRef = (v) => { const m = /^\[(\w+)\]$/.exec(String(v || "").trim()); return m ? m[1] : null; };

// ── cloud flows ──

// Every action of a definition, nested ones included: Scope, Condition (actions + else),
// Foreach, Until and Switch (cases + default) hold other actions.
export function walkActions(actions, visit, depth = 0) {
  if (!actions || typeof actions !== "object" || depth > 12) return;
  for (const [name, a] of Object.entries(actions)) {
    if (!a || typeof a !== "object") continue;
    visit(name, a);
    if (a.actions) walkActions(a.actions, visit, depth + 1);
    if (a.else?.actions) walkActions(a.else.actions, visit, depth + 1);
    if (a.cases && typeof a.cases === "object") for (const c of Object.values(a.cases)) if (c?.actions) walkActions(c.actions, visit, depth + 1);
    if (a.default?.actions) walkActions(a.default.actions, visit, depth + 1);
  }
}

// The email-sending operations per connector (operation ids as the connectors' references list
// them) and where each takes its sender from:
//   from     — an optional sender parameter: set → the mail leaves from that address (Send As)
//   mailbox  — the shared mailbox the mail leaves from (or is replied / forwarded from)
//   fixed    — a required sender parameter (SMTP, SendGrid): the address is in the action
//   sender   — a fixed sender outside the org (the Mail connector's microsoft@powerapps.com)
//   nothing  — the connection's own account sends it
const OUTLOOK = {
  SendEmailV2: { from: "From" }, SendEmail: { from: "From" },
  SharedMailboxSendEmailV2: { mailbox: "MailboxAddress" }, SharedMailboxSendEmail: { mailbox: "MailboxAddress" },
  ReplyToV3: { mailbox: "mailboxAddress", kind: "reply" }, ReplyToV2: { mailbox: "mailboxAddress", kind: "reply" }, ReplyTo: { kind: "reply" },
  ForwardEmail_V2: { mailbox: "mailboxAddress", kind: "forward" }, ForwardEmail: { kind: "forward" },
  SendApprovalMail: {}, SendMailWithOptions: {}, SendDraftEmail: {},
};
const EMAIL_OPS = {
  office365: OUTLOOK,
  outlook: { SendEmailV2: {}, SendEmail: {}, ReplyToV2: { kind: "reply" }, ReplyTo: { kind: "reply" } },
  gmail: { SendEmailV2: {}, SendEmail: {}, ReplyTo: { kind: "reply" } },
  smtp: { SendEmailV3: { fixed: "emailMessage/From" }, SendEmailV2: { fixed: "emailMessage/From" }, SendEmail: { fixed: "emailMessage/From" } },
  sendgrid: { SendEmailV4: { fixed: "from" }, SendEmailV3: { fixed: "from" }, SendEmailV2: { fixed: "from" }, SendEmail: { fixed: "from" } },
  sendmail: { SendEmailV3: { sender: "microsoft@powerapps.com", note: "Mail connector" }, SendEmail: { sender: "microsoft@powerapps.com", note: "Mail connector" } },
  flowpush: { SendEmailNotification: { sender: "Microsoft (Notifications)", toUser: true } },
};
// legacy ApiConnection actions name the operation by the path they call
const legacyOp = (path) => {
  const p = String(path || "").replace(/\?.*$/, "").toLowerCase();
  if (/sharedmailbox\/mail/.test(p)) return "SharedMailboxSendEmail";
  if (/mailwithoptions/.test(p)) return "SendMailWithOptions";
  if (/approvalmail/.test(p)) return "SendApprovalMail";
  if (/replyto/.test(p)) return "ReplyTo";
  if (/forward/.test(p)) return "ForwardEmail";
  if (/\/mail$/.test(p)) return "SendEmail";
  return "";
};

// one action → { connector, operation, params, connectionKey } or null for a built-in action
function connectorAction(a) {
  const t = a?.type;
  if (t === "OpenApiConnection" || t === "OpenApiConnectionWebhook" || t === "OpenApiConnectionNotification") {
    const h = a.inputs?.host || {};
    return { connector: connectorName(h.apiId || h.connectionName || ""), operation: String(h.operationId || ""), params: a.inputs?.parameters || {}, connectionKey: String(h.connectionName || "") };
  }
  if (t === "ApiConnection" || t === "ApiConnectionWebhook") {
    const h = a.inputs?.host || {};
    const key = /\['(shared_[^']+)'\]/.exec(String(h.connection?.name || ""))?.[1] || "";
    return { connector: connectorName(h.api?.runtimeUrl || h.api?.id || h.apiId || key), operation: legacyOp(a.inputs?.path), params: a.inputs?.body || {}, connectionKey: key };
  }
  return null;
}

// A Dataverse "email" row created by the flow: its sender is the activity party with
// participationtypemask 1 (From) — a user, a queue, or a bare address.
function dataverseEmailFrom(item) {
  const parties = item?.["item/email_activity_parties"] ?? item?.email_activity_parties;
  if (!Array.isArray(parties)) return null;
  for (const p of parties) {
    if (!p || typeof p !== "object" || Number(p.participationtypemask) !== 1) continue;
    for (const [k, v] of Object.entries(p)) {
      const m = /^partyid_(\w+)@odata\.bind$/.exec(k);
      if (m) return { text: `${m[1]} ${String(v).replace(/^.*\(|\)$/g, "")}`, dynamic: isExpr(v) };
    }
    if (p.addressused) return { text: String(p.addressused), dynamic: isExpr(p.addressused) };
  }
  return null;
}

// one action → an email entry, or null when it sends none
function emailOf(name, a) {
  const c = connectorAction(a);
  if (!c || !c.connector) return null;
  const base = { action: name, connector: c.connector, operation: c.operation, connectionKey: c.connectionKey };
  if (c.connector === "commondataserviceforapps") {
    const p = c.params || {};
    if (/^PerformBoundAction/.test(c.operation) && lc(p.actionName) === "sendemail" && lc(p.entityName) === "emails") return { ...base, via: "dataverse", from: "" };
    if (/^(CreateRecord|UpdateRecord)/.test(c.operation) && lc(p.entityName) === "emails") {
      const f = dataverseEmailFrom(p);
      return { ...base, via: "dataverse", from: f?.text || "", dynamic: !!f?.dynamic, created: true };
    }
    return null;
  }
  if (c.connector === "approvals") return /^(Create|StartAndWait|Start)/i.test(c.operation) ? { ...base, via: "approvals", from: "" } : null;
  const rule = EMAIL_OPS[c.connector]?.[c.operation];
  if (!rule) return null;
  const p = c.params || {};
  if (rule.sender) return { ...base, via: "microsoft", from: rule.sender, note: rule.note || "", toUser: !!rule.toUser };
  if (rule.fixed) { const v = pick(p, rule.fixed); return { ...base, via: "fixed", from: v == null ? "" : String(v), dynamic: isExpr(v) }; }
  const mb = rule.mailbox ? pick(p, rule.mailbox) : undefined;
  if (mb != null && String(mb).trim() !== "") return { ...base, via: "shared", from: String(mb), dynamic: isExpr(mb), kind: rule.kind || "send" };
  const fr = rule.from ? pick(p, rule.from) : undefined;
  if (fr != null && String(fr).trim() !== "") return { ...base, via: "sendas", from: String(fr), dynamic: isExpr(fr) };
  return { ...base, via: "connection", from: "", kind: rule.kind || "send" };
}

// a parameter by its name, wherever the connector nests it ("emailMessage/From", "From",
// "replyParameters/mailboxAddress"): the last segment of the key, case-insensitive
function pick(p, key) {
  if (!p || typeof p !== "object") return undefined;
  if (p[key] !== undefined) return p[key];
  const k = lc(key);
  for (const [n, v] of Object.entries(p)) if (lc(String(n).split("/").pop()) === k) return v;
  return undefined;
}

// the trigger: what starts the flow and, for a Dataverse trigger, its "Run as" setting
function describeTrigger(name, t) {
  const c = connectorAction(t);
  const out = { name, type: String(t?.type || ""), kind: String(t?.kind || ""), connector: c?.connector || "", operation: c?.operation || "", runAs: null };
  const ra = c?.params?.["subscriptionRequest/runas"];
  if (ra != null && ra !== "") out.runAs = Number.isFinite(Number(ra)) ? Number(ra) : String(ra);
  return out;
}

// A cloud flow's clientdata → { trigger, connections, emails, connectionKeys, actionCount } (null: not parseable).
export function parseFlowIdentity(clientdata) {
  let o;
  try { o = typeof clientdata === "string" ? JSON.parse(clientdata) : clientdata; } catch { return null; }
  if (!o || typeof o !== "object") return null;
  const def = o.properties?.definition || o.definition || {};
  const connections = parseFlowConnections(o);
  const trig = Object.entries(def.triggers || {})[0];
  const trigger = trig ? describeTrigger(trig[0], trig[1]) : null;
  const emails = [], keys = new Set();
  let actionCount = 0;
  walkActions(def.actions, (name, a) => {
    actionCount++;
    const c = connectorAction(a);
    if (c?.connectionKey) keys.add(c.connectionKey);
    const e = emailOf(name, a);
    if (e) emails.push(e);
  });
  return { trigger, connections, emails, connectionKeys: [...keys], actionCount };
}

// The account each connection of a flow resolves to, from Who runs it's reads: the connection
// reference (by logical name) → the connection instance Dataverse stores (the account it is
// signed in as). { [key]: { connector, invoker, refName, connected, account, known } }
export function flowConnectionAccounts(connections, base) {
  const refByLogical = new Map((base?.refs || []).map(r => [lc(r.logicalName), r]));
  const instByRef = new Map(), instByInternal = new Map();
  for (const i of base?.instances || []) { if (i.refId) instByRef.set(lc(i.refId), i); if (i.internalId) instByInternal.set(lc(i.internalId), i); }
  const out = {};
  for (const c of connections || []) {
    const ref = c.refLogicalName ? refByLogical.get(c.refLogicalName) : null;
    const inst = ref ? (instByRef.get(lc(ref.id)) || (ref.connectionId ? instByInternal.get(lc(ref.connectionId)) : null)) : (c.connectionName ? instByInternal.get(c.connectionName) : null);
    out[c.key] = { connector: connectorName(c.api), invoker: c.source === "invoker", refName: ref?.name || "", connected: ref ? !!ref.connectionId : null, account: inst?.accountName || "", known: !!inst };
  }
  return out;
}

export const RUNAS_HINT = "the trigger's \"Run as\" setting (Flow owner, Row owner or Modifying user) applies to the actions using the invoker's connection";

// "Runs as" of a cloud flow: one line per distinct identity its actions run with.
// kinds: invoker | account | unknown | unbound | none | runas
export function flowRunsAs(fi, accounts) {
  if (!fi) return [];
  const out = [], seen = new Set();
  const push = (kind, text, connector) => { if (!seen.has(text)) { seen.add(text); out.push({ kind, text, connector }); } };
  for (const c of fi.connections || []) {
    const a = accounts?.[c.key] || { connector: connectorName(c.api), invoker: c.source === "invoker" };
    if (a.invoker) push("invoker", `whoever runs it (their own ${a.connector} connection)`, a.connector);
    else if (a.account) push("account", a.account, a.connector);
    else if (a.connected === false) push("unbound", `${a.connector}: no connection bound — can't run`, a.connector);
    else push("unknown", `${a.connector}: account not stored in Dataverse`, a.connector);
  }
  if (!out.length) push("none", fi.actionCount ? "no connector — built-in actions only" : "no action");
  if (fi.trigger?.runAs != null) push("runas", `Dataverse trigger "Run as" set (value ${fi.trigger.runAs})`);
  return out;
}

// "Sends email as" of a cloud flow: one line per distinct sender its email actions use.
// kinds: sendas | shared | connection | invoker | unknown | fixed | microsoft | dataverse | approvals
export function flowEmailSenders(fi, accounts) {
  if (!fi) return [];
  const out = [], seen = new Set();
  const push = (kind, text, e) => { if (!seen.has(text)) { seen.add(text); out.push({ kind, text, action: e.action, connector: e.connector }); } };
  for (const e of fi.emails || []) {
    const a = accounts?.[e.connectionKey];
    const dyn = (v) => (e.dynamic ? `set at run time (${exprText(v)})` : v);
    if (e.via === "sendas") push("sendas", `${dyn(e.from)} — "From (Send as)" of ${e.action}`, e);
    else if (e.via === "shared") push("shared", `shared mailbox ${dyn(e.from)}${e.kind === "reply" ? " (reply)" : e.kind === "forward" ? " (forward)" : ""}`, e);
    else if (e.via === "fixed") push("fixed", `${e.from ? dyn(e.from) : "no sender set"} (${e.connector})`, e);
    else if (e.via === "microsoft") push("microsoft", `${e.from}${e.toUser ? ", to the connection's user" : e.note ? ` (${e.note})` : ""}`, e);
    else if (e.via === "dataverse") push("dataverse", e.from ? `Dataverse email from ${dyn(e.from)}, sent by server-side sync` : `a Dataverse email activity — its own From (a user or a queue), sent by server-side sync`, e);
    else if (e.via === "approvals") push("approvals", "Microsoft, the approval notification", e);
    else if (a?.invoker) push("invoker", `whoever runs it (their ${e.connector} mailbox)`, e);
    else if (a?.account) push("connection", `${a.account}${e.kind === "reply" ? " (reply)" : ""} — the ${e.connector} connection`, e);
    else push("unknown", `the ${e.connector} connection's account (not stored in Dataverse)`, e);
  }
  return out;
}

// ── classic workflows (XAML) ──

const LEAF_RE = /AssemblyQualifiedName="Microsoft\.Crm\.Workflow\.Activities\.(SendEmail|SetEntityProperty|GetEntityProperty|CreateCrmType|CreateEntity)\b[^"]*"([^>]*)>/g;
const ARG_RE = /<(?:In|Out)Argument\b[^>]*x:Key="([^"]+)"[^>]*?(?:\/>|>([\s\S]*?)<\/(?:In|Out)Argument>)/g;

// the leaf activities that build and send emails, each with its arguments { key: value }
function leafActivities(xaml) {
  const out = [];
  LEAF_RE.lastIndex = 0;
  let m;
  while ((m = LEAF_RE.exec(xaml))) {
    const start = m.index + m[0].length;
    const end = xaml.indexOf("</mxswa:ActivityReference.Arguments>", start);
    const next = xaml.indexOf("AssemblyQualifiedName=", start);
    const args = {};
    if (end >= 0 && (next < 0 || next > end)) {
      const slice = xaml.slice(start, end);
      ARG_RE.lastIndex = 0;
      let a;
      while ((a = ARG_RE.exec(slice))) args[a[1]] = (a[2] || "").trim();
    }
    out.push({ type: m[1], displayName: /DisplayName="([^"]*)"/.exec(m[2])?.[1] || "", args });
  }
  return out;
}

// what a workflow variable holds, followed through the activities that build it:
// GetEntityProperty → a value of the row (dynamic); CreateCrmType of an EntityReference → a fixed
// user / queue / team; a party list → the parties it holds (SetEntityProperty partyid on each).
function resolveVar(name, acts, depth, seen) {
  if (!name || depth > 6 || seen.has(name)) return [];
  seen.add(name);
  const out = [];
  for (const a of acts) {
    const res = varRef(a.args.Result) || varRef(a.args.Value && a.type === "GetEntityProperty" ? a.args.Value : "");
    if (a.type === "GetEntityProperty" && res === name) {
      out.push({ kind: "dynamic", entity: a.args.EntityName || "", attribute: a.args.Attribute || "" });
    } else if (a.type === "CreateCrmType" && res === name) {
      const logical = a.args.LogicalName || "";
      if (/EntityReference$/.test(a.args.Type || "") || (a.args.Id && logical)) {
        out.push({ kind: "static", logical, name: a.args.Name || "", id: a.args.Id || "" });
      } else {
        for (const [k, v] of Object.entries(a.args)) { const r = varRef(v); if (k !== "Result" && r) out.push(...resolveVar(r, acts, depth + 1, seen)); }
        for (const s of acts) if (s.type === "SetEntityProperty" && varRef(s.args.Entity) === name && /^partyid$/i.test(s.args.Attribute || "")) out.push(...resolveVar(varRef(s.args.Value), acts, depth + 1, seen));
      }
    }
  }
  return out;
}

// A classic workflow's XAML → { emailSteps: [{ step, from: [...], template }] } (null: no xaml).
export function parseWorkflowXaml(xaml) {
  if (!xaml || typeof xaml !== "string") return null;
  if (!/Activities\.SendEmail\b/.test(xaml)) return { emailSteps: [] };
  const acts = leafActivities(xaml);
  const emailSteps = [];
  for (const a of acts) {
    if (a.type !== "SendEmail") continue;
    const ent = varRef(a.args.Entity);
    const froms = [];
    for (const s of acts) {
      if (s.type !== "SetEntityProperty" || /^from$/i.test(s.args.Attribute || "") === false) continue;
      if (ent && varRef(s.args.Entity) !== ent) continue;
      const v = varRef(s.args.Value);
      if (v) froms.push(...resolveVar(v, acts, 0, new Set()));
    }
    emailSteps.push({ step: a.displayName || "Send Email", from: froms, template: /true/i.test(a.args.UseTemplate || "") });
  }
  return { emailSteps };
}

const ATTR_WORDS = { ownerid: "owner", createdby: "creator", modifiedby: "last modifier", owninguser: "owning user" };
export const partyLabel = (p) => {
  if (!p) return "";
  if (p.kind === "dynamic") return `the ${p.entity || "row"}'s ${ATTR_WORDS[lc(p.attribute)] || p.attribute || "value"}`;
  return `${p.name || p.id || "?"} (${p.logical === "queue" ? "queue" : p.logical === "team" ? "team" : p.logical ? "user" : "?"})`;
};

// "Sends email as" of a classic workflow: one line per distinct From its Send Email steps use.
// kinds: static | dynamic | unknown
export function workflowEmailSenders(parsed) {
  if (!parsed) return [];
  const out = [], seen = new Set();
  for (const s of parsed.emailSteps || []) {
    if (!s.from.length) { const t = `From not readable in "${s.step}"`; if (!seen.has(t)) { seen.add(t); out.push({ kind: "unknown", text: t, step: s.step }); } continue; }
    for (const p of s.from) {
      const t = partyLabel(p);
      if (seen.has(t)) continue;
      seen.add(t);
      out.push({ kind: p.kind, text: t, step: s.step, logical: p.logical || "", onBehalf: p.kind === "static" && lc(p.logical) === "systemuser" });
    }
  }
  return out;
}

export const ON_BEHALF_HINT = "A fixed user as From: the workflow's owner needs the \"Send Email as Another User\" privilege and that user must allow others to send email on their behalf (personal options › Email).";

// the one-line text of a list of sender / identity entries (exports, tooltips)
export const linesText = (lines) => (lines || []).map(l => l.text).join("; ");
