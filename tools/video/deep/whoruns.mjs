// Deep dive — Automation › Who runs it, Runs as / Sends email as, 🎯 Fires on, plug-in step writes.
// Demo mode: a fake org with identities of every kind, connection references with and without a
// stored account, flow definitions and workflow XAML. Demo writes change nothing outside the page.
// The enable / disable and filtering writes ask a native confirm() first — it doesn't show in a
// screencast, so the script accepts it and the captions only claim what the page then shows.
// Every action below was checked with --probe.
const btn = (h, re) => h.page.locator("button >> visible=true").filter({ hasText: re }).first();
const row = (h, re) => h.page.locator("tbody tr >> visible=true").filter({ hasText: re }).first();
const cell = (h, re) => h.page.locator("td >> visible=true").filter({ hasText: re }).first();
const filterBox = (h) => h.page.getByPlaceholder(/Filter by name, entity, message/);
const firesTable = (h) => h.page.getByPlaceholder(/account, contact/);
const firesColumn = (h) => h.page.getByPlaceholder(/logical name|reading the table|pick a table/);
const accept = (h) => h.page.once("dialog", d => d.accept());
// sideways wheel over a wide table (its own scroll box), the cursor riding along
async function hscroll(h, dx) {
  const b = await h.page.locator("table >> visible=true").first().boundingBox();
  const x = b.x + b.width / 2, y = b.y + Math.min(b.height / 2, 160);
  await h.page.evaluate(([x, y]) => window.__cv.cursor(x, y), [x, y]); await h.wait(400);
  await h.page.mouse.move(x, y);
  for (let i = 0; i < 6; i++) { await h.page.mouse.wheel(dx / 6, 0); await h.wait(70); }
}

export default {
  key: "whoruns",
  label: "Who runs it",
  tagline: {
    en: "The identity behind every flow, workflow and plug-in step — and what fires when a column changes",
    fr: "L'identité derrière chaque flow, workflow et step de plug-in — et ce qui se déclenche quand une colonne change",
  },
  chapters: [
    { key: "identities",
      en: ["1 · Who runs it", "Every identity behind a cloud flow, workflow or plug-in step, by kind — person, team, app registration, service account, built-in — and what it runs."],
      fr: ["1 · Qui l'exécute", "Chaque identité derrière un cloud flow, un workflow ou un step de plug-in, par type — personne, équipe, app registration, compte de service, intégré — et ce qu'elle exécute."],
      run: async (h) => {
        await h.open("Automation");
        await h.wait(1000);
        await h.click(btn(h, /Who runs it/)); await h.wait(1800);
        await h.hover(cell(h, /^runs as 1 plug-in step$/)); await h.wait(1400);
      } },
    { key: "flags",
      en: ["2 · What stops when someone leaves", "Flags first: a disabled user still behind active automation, and people — not service accounts — whose flows and workflows break when they leave."],
      fr: ["2 · Ce qui s'arrête quand quelqu'un part", "Les alertes d'abord : un utilisateur désactivé encore derrière de l'automatisation active, et des personnes — pas des comptes de service — dont les flows et workflows cassent à leur départ."],
      run: async (h) => {
        await h.hover(cell(h, /^Disabled$/)); await h.wait(1200);
        await hscroll(h, 900); await h.wait(1200);
        await h.hover(cell(h, /^⚠ Disabled, yet/)); await h.wait(1500);
        await h.hover(cell(h, /^⚠ A person/)); await h.wait(1500);
      } },
    { key: "connections",
      en: ["3 · The account behind each connection", "Each connection reference: its connector, the account it's signed in with — a service account, a person — or no connection at all, and the flows using it."],
      fr: ["3 · Le compte derrière chaque connexion", "Chaque référence de connexion : son connecteur, le compte avec lequel elle est connectée — compte de service, personne — ou aucune connexion, et les flows qui l'utilisent."],
      run: async (h) => {
        await h.click(btn(h, /^Connections \(/)); await h.wait(1500);
        await h.hover(cell(h, /^svc-integration@contoso\.example/)); await h.wait(1300);
        await h.hover(cell(h, /^no connection/)); await h.wait(1500);
      } },
    { key: "flow-runs-as",
      pos: "top",
      en: ["4 · A flow doesn't run as its owner", "Cloud flows › Runs as: the account of each connection, or whoever runs it. Sends email as: each email action followed to its sender — a From, a shared mailbox."],
      fr: ["4 · Un flow ne s'exécute pas en tant que son propriétaire", "Cloud flows › Runs as : le compte de chaque connexion, ou celui qui le lance. Sends email as : chaque action d'e-mail suivie jusqu'à l'expéditeur — un From, une boîte partagée."],
      run: async (h) => {
        await h.click(btn(h, /^Cloud flows/)); await h.wait(1800);
        await h.hover(cell(h, /^svc-integration@contoso\.examplesap: no connection/)); await h.wait(1500);
        await h.hover(cell(h, /^noreply@contoso\.example/)); await h.wait(1500);
      } },
    { key: "workflow-runs-as",
      en: ["5 · Classic workflows too", "Runs as: the owner when real-time set to Execute as owner, or when an event starts a background one. Sends email as: each Send Email step's From — the record's owner, a fixed user (ℹ)."],
      fr: ["5 · Les workflows classiques aussi", "Runs as : le propriétaire en temps réel avec Execute as owner, ou quand un événement lance un workflow en arrière-plan. Sends email as : le From de chaque étape Send Email — le propriétaire de la ligne, un utilisateur fixe (ℹ)."],
      run: async (h) => {
        await h.click(btn(h, /^Workflows/)); await h.wait(1800);
        await h.hover(cell(h, /^Owner \(Execute as\)$/)); await h.wait(1300);
        await h.hover(cell(h, /^svc-integration \(user\)/)); await h.wait(1400);
      } },
    { key: "fires-on",
      en: ["6 · 🎯 What fires when a column changes", "Pick a table, then a column: every step, workflow and flow that runs when telephone1 of account changes — here only one flow."],
      fr: ["6 · 🎯 Ce qui se déclenche quand une colonne change", "Choisissez une table, puis une colonne : chaque step, workflow et flow qui s'exécute quand telephone1 d'account change — ici un seul flow."],
      run: async (h) => {
        await h.click(btn(h, /Fires on/)); await h.wait(1000);
        await h.type(firesTable(h), "account"); await h.wait(1300);
        await h.type(firesColumn(h), "telephone1"); await h.wait(1200);
        await h.hover(cell(h, /^CreateUpdatenamenew_sapidtelephone1$/)); await h.wait(1300);
      } },
    { key: "disable",
      en: ["7 · Switch steps off", "Filter on an assembly, tick every step shown, Disable — before a data migration, say. The rows now read Disabled."],
      fr: ["7 · Désactiver des steps", "Filtrez sur une assembly, cochez tous les steps affichés, Disable — avant une migration de données, par exemple. Les lignes affichent Disabled."],
      run: async (h) => {
        await h.click(btn(h, /^Plug-in steps/)); await h.wait(1200);
        await h.type(filterBox(h), "Contoso.Plugins"); await h.wait(1000);
        await h.click(h.page.locator('th input[type="checkbox"] >> visible=true').first()); await h.wait(1000);
        accept(h);
        await h.click(btn(h, /^Disable$/)); await h.wait(1500);
        await h.hover(h.page.locator("span >> visible=true").filter({ hasText: /^✓ 2 steps disabled/ }).first()); await h.wait(1500);
      } },
    { key: "filtering",
      en: ["8 · Set a step's filtering attributes", "The step runs only when an update carries a ticked column. Add telephone1 to the SAP sync — +1 — and Save."],
      fr: ["8 · Régler les attributs de filtrage", "Le step ne s'exécute que si une mise à jour porte une colonne cochée. Ajoutez telephone1 au sync SAP — +1 — puis Save."],
      run: async (h) => {
        await filterBox(h).fill(""); await h.wait(500);
        await hscroll(h, 900); await h.wait(800);
        await h.click(row(h, /SapSync/).locator("button", { hasText: /col\.$/ })); await h.wait(1300);
        await h.type(h.page.getByPlaceholder("Filter columns…"), "telephone"); await h.wait(900);
        await h.click(h.page.locator("label >> visible=true").filter({ hasText: /^telephone1/ }).first()); await h.wait(1300);
        accept(h);
        await h.click(btn(h, /^Save$/)); await h.wait(1500);
      } },
    { key: "fires-again",
      en: ["9 · Ask again", "telephone1 of account now fires two registrations: the flow, and the SAP sync step — async, post-operation, running as the SAP app."],
      fr: ["9 · Reposez la question", "telephone1 d'account déclenche maintenant deux enregistrements : le flow, et le step de sync SAP — async, post-opération, exécuté en tant que l'app SAP."],
      run: async (h) => {
        await h.click(btn(h, /Fires on/)); await h.wait(900);
        await h.type(firesTable(h), "account"); await h.wait(900);
        await h.type(firesColumn(h), "telephone1"); await h.wait(1500);
        await h.hover(cell(h, /^Contoso\.Integration\.SapSync/)); await h.wait(1500);
      } },
  ],
};
