// Deep dive — Automation. Every action below was checked against demo mode (make-deep --probe).
const btn = (h, re) => h.page.locator("button >> visible=true").filter({ hasText: re }).first();
const selectWithOption = (h, value) => h.page.locator("select >> visible=true").filter({ has: h.page.locator(`option[value="${value}"]`) }).first();
const stateSel = (h) => selectWithOption(h, "inactive");
const sourceSel = (h) => selectWithOption(h, "microsoft");
const filterBox = (h) => h.page.getByPlaceholder(/Filter by name, entity, message/);
const row = (h, re) => h.page.locator("tbody tr >> visible=true").filter({ hasText: re }).first();

export default {
  key: "automation",
  label: "Automation",
  tagline: {
    en: "Everything registered to run in the org — plug-in steps, workflows, flows, business rules, BPFs",
    fr: "Tout ce qui est enregistré pour s'exécuter dans l'org — steps de plug-in, workflows, flows, règles métier, BPF",
  },
  chapters: [
    { key: "plugin-steps",
      en: ["1 · Every plug-in step", "Each registered step with its plug-in type, message, table, stage, sync / async mode, state and source — read-only, in one table."],
      fr: ["1 · Tous les steps de plug-in", "Chaque step enregistré : type de plug-in, message, table, stage, mode sync / async, état et source — en lecture seule, dans un seul tableau."],
      run: async (h) => {
        await h.open("Automation");
        await h.wait(1200);
        await h.hover(row(h, /AccountPreCreate/)); await h.wait(900);
        await h.hover(h.vis("Pre-operation")); await h.wait(900);
        await h.hover(h.page.locator("tbody >> visible=true").getByText("Async", { exact: true }).first()); await h.wait(1400);
      } },
    { key: "search",
      en: ["2 · Find a step in seconds", "Filter by name, table, message or assembly — here every step of one assembly, then every step on contact."],
      fr: ["2 · Retrouver un step en quelques secondes", "Filtrez par nom, table, message ou assembly — ici tous les steps d'une assembly, puis tous les steps sur contact."],
      run: async (h) => {
        const f = filterBox(h);
        await h.type(f, "Contoso.Plugins"); await h.wait(1800);
        await f.fill(""); await h.wait(300);
        await f.pressSequentially("contact", { delay: 90 }); await h.wait(2000);
      } },
    { key: "state",
      en: ["3 · Spot what's switched off", "Show only disabled steps — the first thing to check when \"my plug-in doesn't fire\"."],
      fr: ["3 · Repérer ce qui est désactivé", "N'affichez que les steps désactivés — le premier réflexe quand « mon plug-in ne se déclenche pas »."],
      run: async (h) => {
        await filterBox(h).fill(""); await h.wait(600);
        await h.select(stateSel(h), "inactive"); await h.wait(2200);
      } },
    { key: "source",
      en: ["4 · Custom, managed or Microsoft", "Filter by source: your unmanaged customizations, managed solutions or Microsoft's — best-effort, from publisher prefixes and the managed flag."],
      fr: ["4 · Custom, managed ou Microsoft", "Filtrez par source : vos personnalisations unmanaged, les solutions managed ou Microsoft — une estimation via les préfixes d'éditeur et le flag managed."],
      run: async (h) => {
        await h.select(stateSel(h), "all"); await h.wait(700);
        await h.select(sourceSel(h), "custom"); await h.wait(1800);
        await h.select(sourceSel(h), "microsoft"); await h.wait(1200);
        await h.hover(h.page.locator("tbody >> visible=true").getByText("Microsoft", { exact: true }).first()); await h.wait(1200);
      } },
    { key: "workflows",
      en: ["5 · Classic workflows and their triggers", "Each workflow with its table, state, background or real-time mode, triggers — create, update (watched columns count), delete — and owner."],
      fr: ["5 · Les workflows classiques et leurs déclencheurs", "Chaque workflow : table, état, arrière-plan ou temps réel, déclencheurs (création, mise à jour + colonnes surveillées, suppression) et propriétaire."],
      run: async (h) => {
        await h.select(sourceSel(h), "all"); await h.wait(600);
        await h.click(btn(h, /^Workflows/)); await h.wait(1500);
        await h.hover(h.vis("Create · Update(1)")); await h.wait(1300);
        await h.hover(h.vis("Background")); await h.wait(1300);
      } },
    { key: "process-types",
      en: ["6 · Every process type", "Cloud flows, business rules, actions, BPFs, dialogs, desktop flows — each tab counts its type, so a zero answers \"do we have any?\" at a glance."],
      fr: ["6 · Tous les types de processus", "Cloud flows, règles métier, actions, BPF, dialogues, desktop flows — chaque onglet compte son type : un zéro répond d'un coup d'œil à « en a-t-on ? »."],
      run: async (h) => {
        await h.click(btn(h, /^Cloud flows/)); await h.wait(1500);
        await h.click(btn(h, /^Business rules/)); await h.wait(1500);
        await h.click(btn(h, /^BPFs/)); await h.wait(1500);
        await h.hover(btn(h, /^Desktop flows/)); await h.wait(1200);
      } },
    { key: "export",
      en: ["7 · Export for the audit", "Filter, then export what's shown to CSV or Excel — for plug-in steps with stage, mode, rank, filtering attributes, source and last change."],
      fr: ["7 · Exporter pour l'audit", "Filtrez, puis exportez l'affichage en CSV ou Excel — pour les steps : stage, mode, rang, attributs de filtrage, source et dernière modification."],
      run: async (h) => {
        await h.click(btn(h, /^Plug-in steps/)); await h.wait(1000);
        await h.select(stateSel(h), "active"); await h.wait(1500);
        await h.hover(h.page.getByRole("button", { name: /CSV$/ }).first()); await h.wait(1100);
        await h.hover(h.page.getByRole("button", { name: /Excel$/ }).first()); await h.wait(1600);
      } },
  ],
};
