import { describe, it, expect } from "vitest";
import { walkActions, parseFlowIdentity, flowConnectionAccounts, flowRunsAs, flowEmailSenders, parseWorkflowXaml, workflowEmailSenders, partyLabel, linesText } from "../flowIdentity.js";
import { DEMO_FLOW_DEFS, DEMO_XAML_DEFS, DEMO_REFS, DEMO_INSTANCES, DEMO_IDENT as I } from "../identitiesDemo.js";

const host = (api, operationId) => ({ apiId: `/providers/Microsoft.PowerApps/apis/shared_${api}`, connectionName: `shared_${api}`, operationId });
const op = (api, operationId, parameters) => ({ type: "OpenApiConnection", inputs: { host: host(api, operationId), parameters } });
const flow = (actions, triggers = { manual: { type: "Request", kind: "Button" } }, refs = {}) => JSON.stringify({ properties: { connectionReferences: refs, definition: { triggers, actions } } });

describe("cloud flow identity - the definition", () => {
  it("walks nested actions: scope, condition and its else, foreach, until, switch cases and default", () => {
    const seen = [];
    walkActions({
      A: { type: "Compose" },
      S: { type: "Scope", actions: { B: { type: "Compose" }, C: { type: "If", actions: { D: { type: "Compose" } }, else: { actions: { E: { type: "Compose" } } } } } },
      F: { type: "Foreach", actions: { G: { type: "Until", actions: { H: { type: "Compose" } } } } },
      W: { type: "Switch", cases: { c1: { actions: { X: { type: "Compose" } } } }, default: { actions: { Y: { type: "Compose" } } } },
    }, (n) => seen.push(n));
    expect(seen).toEqual(["A", "S", "B", "C", "D", "E", "F", "G", "H", "W", "X", "Y"]);
  });
  it("reads the trigger (kind, connector, the Dataverse Run as value) and the connections the actions use", () => {
    const fi = parseFlowIdentity(flow({ Get: op("commondataserviceforapps", "GetItem", { entityName: "accounts" }), Note: op("office365", "SendEmailV2", {}) },
      { When_a_row_changes: { type: "OpenApiConnectionWebhook", inputs: { host: host("commondataserviceforapps", "SubscribeWebhookTrigger"), parameters: { "subscriptionRequest/message": 3, "subscriptionRequest/entityname": "account", "subscriptionRequest/runas": 3 } } } }));
    expect(fi.trigger).toEqual({ name: "When_a_row_changes", type: "OpenApiConnectionWebhook", kind: "", connector: "commondataserviceforapps", operation: "SubscribeWebhookTrigger", runAs: 3 });
    expect(fi.connectionKeys).toEqual(["shared_commondataserviceforapps", "shared_office365"]);
    expect(fi.actionCount).toBe(2);
    const manual = parseFlowIdentity(flow({}));
    expect(manual.trigger).toMatchObject({ name: "manual", type: "Request", kind: "Button", runAs: null });
    expect(manual.emails).toEqual([]);
    expect(parseFlowIdentity("{bad")).toBe(null);
    expect(parseFlowIdentity(null)).toBe(null);
  });
  it("finds every email-sending action and where its sender comes from", () => {
    const fi = parseFlowIdentity(flow({
      A: op("office365", "SendEmailV2", { "emailMessage/To": "x@y", "emailMessage/From": "noreply@contoso.example" }),
      B: op("office365", "SendEmailV2", { "emailMessage/To": "x@y" }),
      C: op("office365", "SendEmailV2", { "emailMessage/From": "@variables('sender')" }),
      D: op("office365", "SharedMailboxSendEmailV2", { "emailMessage/MailboxAddress": "sales@contoso.example" }),
      E: op("office365", "ReplyToV3", { "replyParameters/mailboxAddress": "support@contoso.example" }),
      E2: op("office365", "ReplyToV3", { "replyParameters/mailboxAddress": "" }),
      F: op("sendmail", "SendEmailV3", { to: "x@y" }),
      G: op("smtp", "SendEmailV3", { "emailMessage/From": "alerts@contoso.example" }),
      H: op("sendgrid", "SendEmailV4", { from: "news@contoso.example" }),
      J: op("commondataserviceforapps", "PerformBoundAction", { entityName: "emails", actionName: "SendEmail", recordId: "x" }),
      K: op("commondataserviceforapps", "CreateRecord", { entityName: "emails", "item/subject": "Hi", "item/email_activity_parties": [{ participationtypemask: 1, "partyid_queue@odata.bind": "/queues(00000000-0000-0000-0000-000000000001)" }, { participationtypemask: 2, addressused: "x@y" }] }),
      L: op("commondataserviceforapps", "CreateRecord", { entityName: "accounts", "item/name": "not an email" }),
      M: op("approvals", "StartAndWaitForAnApproval", {}),
      N: op("flowpush", "SendEmailNotification", {}),
      P: op("teams", "PostMessageToConversation", {}),
      Q: { type: "Compose", inputs: "x" },
      Legacy: { type: "ApiConnection", inputs: { host: { api: { runtimeUrl: "https://x/apim/office365" }, connection: { name: "@parameters('$connections')['shared_office365']['connectionId']" } }, method: "post", path: "/v2/Mail", body: { To: "x@y", From: "legacy@contoso.example" } } },
      Legacy2: { type: "ApiConnection", inputs: { host: { api: { runtimeUrl: "https://x/apim/office365" }, connection: { name: "@parameters('$connections')['shared_office365']['connectionId']" } }, method: "post", path: "/SharedMailbox/Mail", body: { MailboxAddress: "team@contoso.example" } } },
    }));
    const by = Object.fromEntries(fi.emails.map(e => [e.action, e]));
    expect(Object.keys(by)).toEqual(["A", "B", "C", "D", "E", "E2", "F", "G", "H", "J", "K", "M", "N", "Legacy", "Legacy2"]);
    expect(by.A).toMatchObject({ via: "sendas", from: "noreply@contoso.example", dynamic: false, connectionKey: "shared_office365" });
    expect(by.B).toMatchObject({ via: "connection", from: "" });
    expect(by.C).toMatchObject({ via: "sendas", dynamic: true });
    expect(by.D).toMatchObject({ via: "shared", from: "sales@contoso.example" });
    expect(by.E).toMatchObject({ via: "shared", from: "support@contoso.example", kind: "reply" });
    expect(by.E2).toMatchObject({ via: "connection", kind: "reply" });
    expect(by.F).toMatchObject({ via: "microsoft", from: "microsoft@powerapps.com" });
    expect(by.G).toMatchObject({ via: "fixed", from: "alerts@contoso.example" });
    expect(by.H).toMatchObject({ via: "fixed", from: "news@contoso.example" });
    expect(by.J).toMatchObject({ via: "dataverse", from: "" });
    expect(by.K).toMatchObject({ via: "dataverse", from: "queue 00000000-0000-0000-0000-000000000001", created: true });
    expect(by.M.via).toBe("approvals");
    expect(by.N).toMatchObject({ via: "microsoft", toUser: true });
    expect(by.Legacy).toMatchObject({ via: "sendas", from: "legacy@contoso.example", connector: "office365", connectionKey: "shared_office365" });
    expect(by.Legacy2).toMatchObject({ via: "shared", from: "team@contoso.example" });
  });
});

describe("cloud flow identity - who it runs as, who sends its emails", () => {
  const base = { refs: DEMO_REFS, instances: DEMO_INSTANCES };
  const parsed = Object.fromEntries(DEMO_FLOW_DEFS.map(d => [d.id, parseFlowIdentity(d.clientdata)]));
  it("resolves each connection to the account Dataverse stores for it", () => {
    const acc = flowConnectionAccounts(parsed[I.flowDigest].connections, base);
    expect(acc.shared_commondataserviceforapps).toMatchObject({ connector: "commondataserviceforapps", invoker: false, account: "svc-integration@contoso.example", known: true, connected: true });
    expect(acc.shared_office365).toMatchObject({ account: "alex@contoso.example", known: true });
    const sap = flowConnectionAccounts(parsed[I.flowSap].connections, base);
    expect(sap.shared_sap).toMatchObject({ connected: false, account: "", known: false }); // the reference has no connection bound
    const inv = flowConnectionAccounts(parsed[I.flowNotify].connections, base);
    expect(inv.shared_office365.invoker).toBe(true);
    expect(flowConnectionAccounts(parsed[I.flowDigest].connections, null).shared_office365).toMatchObject({ account: "", known: false, connected: null });
  });
  it("Runs as: one line per identity, invoker connections and an unbound reference said as such, the trigger's Run as noted", () => {
    const digest = flowRunsAs(parsed[I.flowDigest], flowConnectionAccounts(parsed[I.flowDigest].connections, base));
    expect(digest.map(l => [l.kind, l.text])).toEqual([["account", "svc-integration@contoso.example"], ["account", "alex@contoso.example"]]);
    const sap = flowRunsAs(parsed[I.flowSap], flowConnectionAccounts(parsed[I.flowSap].connections, base));
    expect(sap.map(l => l.kind)).toEqual(["account", "unbound"]);
    expect(sap[1].text).toBe("sap: no connection bound — can't run");
    const notify = flowRunsAs(parsed[I.flowNotify], flowConnectionAccounts(parsed[I.flowNotify].connections, base));
    expect(notify.map(l => l.kind)).toEqual(["invoker", "runas"]);
    expect(notify[0].text).toBe("whoever runs it (their own office365 connection)");
    expect(notify[1].text).toBe('Dataverse trigger "Run as" set (value 2)');
    expect(flowRunsAs(parseFlowIdentity(flow({ A: { type: "Compose" } })), {})).toEqual([{ kind: "none", text: "no connector — built-in actions only", connector: undefined }]);
    expect(flowRunsAs(null, {})).toEqual([]);
  });
  it("Sends email as: the From set in the action, the shared mailbox, else the connection's account or whoever runs it", () => {
    const digest = flowEmailSenders(parsed[I.flowDigest], flowConnectionAccounts(parsed[I.flowDigest].connections, base));
    expect(digest.map(l => [l.kind, l.text])).toEqual([
      ["sendas", 'noreply@contoso.example — "From (Send as)" of Send_the_digest'],
      ["shared", "shared mailbox sales-ops@contoso.example"],
      ["dataverse", "a Dataverse email activity — its own From (a user or a queue), sent by server-side sync"],
    ]);
    const notify = flowEmailSenders(parsed[I.flowNotify], flowConnectionAccounts(parsed[I.flowNotify].connections, base));
    expect(notify.map(l => l.kind)).toEqual(["invoker"]);
    expect(notify[0].text).toBe("whoever runs it (their office365 mailbox)");
    // the same action on a stored connection → that account; unknown → said so
    const fi = parseFlowIdentity(flow({ A: op("office365", "SendEmailV2", {}), B: op("gmail", "SendEmailV2", {}) }));
    expect(flowEmailSenders(fi, { shared_office365: { account: "alex@contoso.example", connector: "office365" } }).map(l => l.text)).toEqual(["alex@contoso.example — the office365 connection", "the gmail connection's account (not stored in Dataverse)"]);
    expect(flowEmailSenders(parsed[I.flowSap], {})).toEqual([]);
    expect(linesText(digest)).toContain("noreply@contoso.example");
  });
});

describe("classic workflow identity - the XAML", () => {
  it("reads a Send Email step's From taken from the row (its owner) through the party list", () => {
    const p = parseWorkflowXaml(DEMO_XAML_DEFS[0].xaml);
    expect(p.emailSteps).toHaveLength(1);
    expect(p.emailSteps[0]).toMatchObject({ step: "Send email: Big opportunity", template: false });
    expect(p.emailSteps[0].from).toEqual([{ kind: "dynamic", entity: "opportunity", attribute: "ownerid" }]);
    const lines = workflowEmailSenders(p);
    expect(lines).toEqual([{ kind: "dynamic", text: "the opportunity's owner", step: "Send email: Big opportunity", logical: "", onBehalf: false }]);
  });
  it("reads a fixed user as From and flags it (send on behalf needs the privilege and the user's option)", () => {
    const p = parseWorkflowXaml(DEMO_XAML_DEFS[1].xaml);
    expect(p.emailSteps[0].from).toEqual([{ kind: "static", logical: "systemuser", name: "svc-integration", id: I.svc }]);
    expect(workflowEmailSenders(p)).toEqual([{ kind: "static", text: "svc-integration (user)", step: "Send email: Welcome", logical: "systemuser", onBehalf: true }]);
    expect(partyLabel({ kind: "static", logical: "queue", name: "Support" })).toBe("Support (queue)");
    expect(partyLabel({ kind: "dynamic", entity: "account", attribute: "new_custom" })).toBe("the account's new_custom");
  });
  it("a party set straight from a variable, two email steps, a From it can't follow, no email at all, no xaml", () => {
    const direct = DEMO_XAML_DEFS[0].xaml
      .replace('x:Key="Item1">[CreateStep1_4]', 'x:Key="Item1">[CreateStep1_2]')
      .replace(/<OutArgument x:TypeArguments="x:Object" x:Key="Value">\[CreateStep1_2\]<\/OutArgument>/, '<OutArgument x:TypeArguments="x:Object" x:Key="Value">[CreateStep1_2]</OutArgument>');
    expect(parseWorkflowXaml(direct).emailSteps[0].from).toEqual([{ kind: "dynamic", entity: "opportunity", attribute: "ownerid" }]);
    const two = DEMO_XAML_DEFS[0].xaml.replace("</mxswa:Workflow>", DEMO_XAML_DEFS[1].xaml.replace(/[\s\S]*<mxswa:Workflow>/, "").replace(/<\/mxswa:Workflow>[\s\S]*/, "").replace(/CreateStep1_/g, "CreateStep2_") + "</mxswa:Workflow>");
    const p2 = parseWorkflowXaml(two);
    expect(p2.emailSteps.map(s => s.step)).toEqual(["Send email: Big opportunity", "Send email: Welcome"]);
    expect(workflowEmailSenders(p2).map(l => l.text)).toEqual(["the opportunity's owner", "svc-integration (user)"]);
    const lost = DEMO_XAML_DEFS[0].xaml.replace('x:Key="Value">[CreateStep1_3]', 'x:Key="Value">[Nowhere]');
    expect(workflowEmailSenders(parseWorkflowXaml(lost))).toEqual([{ kind: "unknown", text: 'From not readable in "Send email: Big opportunity"', step: "Send email: Big opportunity" }]);
    expect(parseWorkflowXaml("<Activity><mxswa:Workflow/></Activity>")).toEqual({ emailSteps: [] });
    expect(parseWorkflowXaml("")).toBe(null);
    expect(workflowEmailSenders(null)).toEqual([]);
  });
});
