// Deep dive — Storage. Every action below was checked against demo mode (make-deep --probe).
// Facts kept honest: row counts = Dataverse's RetrieveTotalRecordCount snapshot (≤ 24 h old); the
// billed GB (Database / File / Log) are only in the Power Platform admin center.
const btn = (h, re) => h.page.locator("button >> visible=true").filter({ hasText: re }).first();
// Like h.scroll, but wheeling at y=150: h.scroll wheels at y=520, where the rows-per-table list (its
// own scroll box) ends up under the pointer and swallows the wheel instead of the page.
const scrollAt = async (h, dy, y = 150) => {
  const x = 1000;
  await h.page.evaluate(([x, y]) => window.__cv.cursor(x, y), [x, y]); await h.wait(400);
  await h.page.mouse.move(x, y);
  for (let i = 0; i < 6; i++) { await h.page.mouse.wheel(0, dy / 6); await h.wait(70); }
};

export default {
  key: "storage",
  label: "Storage",
  tagline: {
    en: "Find which tables fill your Dataverse capacity — rows, file bytes, silent growers",
    fr: "Trouvez les tables qui remplissent votre capacité Dataverse — lignes, octets de fichiers, croissance silencieuse",
  },
  chapters: [
    { key: "overview",
      en: ["1 · Where your capacity goes", "Rows per table from Dataverse's own snapshot (≤ 24 h old). The billed GB live only in the Power Platform admin center — linked here."],
      fr: ["1 · Où part votre capacité", "Les lignes par table, issues du snapshot de Dataverse (≤ 24 h). Les Go facturés ne sont visibles que dans le Power Platform admin center — lien ici."],
      run: async (h) => {
        await h.open("Storage"); await h.wait(1200);
        await h.hover(h.page.getByRole("link", { name: /Power Platform admin center/ }).first()); await h.wait(1800);
        await h.hover(h.vis("ROWS (ALL TABLES)")); await h.wait(1200);
        await h.hover(h.vis("BIGGEST TABLE")); await h.wait(1400);
      } },
    { key: "silent-growth",
      en: ["2 · Tables that grow silently", "System tables that fill up unnoticed — audit, system jobs, workflow logs, traces — each with how to clean it up."],
      fr: ["2 · Les tables qui grossissent en silence", "Les tables système qui se remplissent sans bruit — audit, travaux système, journaux de workflow, traces — chacune avec sa méthode de nettoyage."],
      run: async (h) => {
        await h.hover(h.vis("Auditing")); await h.wait(1800);
        await h.hover(h.vis("System Job")); await h.wait(1600);
        await h.hover(h.vis("Plug-in Trace Log")); await h.wait(1600);
      } },
    { key: "file-storage", pos: "top",
      en: ["3 · Real file bytes per table", "Summed in the background from notes, file & image columns and email attachments — split by the table they belong to."],
      fr: ["3 · Les vrais octets de fichiers par table", "Additionnés en arrière-plan à partir des notes, colonnes fichier & image et pièces jointes d'e-mails — ventilés par table d'origine."],
      run: async (h) => {
        await scrollAt(h, 400); await h.wait(1800);
        await h.hover(h.page.locator("td >> visible=true").filter({ hasText: /^Account/ }).first()); await h.wait(1500);
        await h.hover(h.page.locator("button >> visible=true").filter({ hasText: /Excel$/ }).first()); await h.wait(1300);
      } },
    { key: "classes", pos: "top",
      en: ["4 · Filter by storage class", "Each table is tagged Database, File or Log, following Microsoft's split. Filter on one class, or on the system tables that grow."],
      fr: ["4 · Filtrer par type de stockage", "Chaque table est classée Database, File ou Log, selon la répartition de Microsoft. Filtrez une classe, ou les tables système qui grossissent."],
      run: async (h) => {
        await scrollAt(h, 240); await h.wait(800);
        await h.click(btn(h, /^System growth \(/)); await h.wait(1700);
        await h.click(btn(h, /^Log \(/)); await h.wait(1600);
        await h.click(btn(h, /^File \(/)); await h.wait(1700);
      } },
    { key: "search", pos: "top",
      en: ["5 · Find any table", "Search by display or logical name — each table shows its storage class, row count and share of all rows."],
      fr: ["5 · Retrouver n'importe quelle table", "Recherchez par nom d'affichage ou logique — chaque table affiche son type de stockage, son nombre de lignes et sa part du total."],
      run: async (h) => {
        await h.click(btn(h, /^All \(/)); await h.wait(1200);
        await h.type(h.page.getByPlaceholder("Filter tables…").first(), "log"); await h.wait(2000);
        await h.hover(h.page.locator("button >> visible=true").filter({ hasText: /CSV$/ }).last()); await h.wait(1400);
      } },
    { key: "refresh",
      en: ["6 · Refresh on demand", "Refresh re-reads the row counts and re-runs the file analysis — the “Loaded” time tells you how fresh the view is."],
      fr: ["6 · Actualiser à la demande", "Refresh relit les volumes et relance l'analyse des fichiers — l'heure « Loaded » indique la fraîcheur de la vue."],
      run: async (h) => {
        await scrollAt(h, -2400); await h.wait(700);
        await h.click(btn(h, /Refresh$/)); await h.wait(1600);
        await h.hover(h.page.getByText(/^Loaded /).first()); await h.wait(1600);
      } },
  ],
};
