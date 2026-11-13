// Deep dive — Metadata: know your data model. Fill rate, dependencies, solution layers, search
// columns and multi-select values of the demo Account table (FLDS / ROWS, deleteImpactDemo,
// solutionLayersDemo, searchConfigDemo). The earlier Metadata features are in deep/metadata.mjs.
// Every action below was checked against demo mode (make-deep --probe).
const btn = (h, re) => h.page.locator("button >> visible=true").filter({ hasText: re }).first();
const fieldRow = (h, logical) => h.page.locator("tbody tr >> visible=true").filter({ has: h.page.locator(`text="${logical}"`) }).first();
const filterCols = async (h, text) => {
  const f = h.page.getByPlaceholder("Filter columns...").first();
  await h.click(f); await f.fill(""); if (text) await f.pressSequentially(text, { delay: 80 });
  await h.wait(900);
};

export default {
  key: "datamodel",
  label: "Metadata",
  tagline: {
    en: "Know your data model — fill rate, dependencies, solution layers, search columns",
    fr: "Connaître son modèle de données — taux de remplissage, dépendances, couches de solution, colonnes de recherche",
  },
  chapters: [
    { key: "fill-rate",
      en: ["1 · Which columns are really used?", "📊 Fill rate counts, for every column, the rows that hold a value — exact counts from aggregate queries, never row by row. Never-filled columns show in red."],
      fr: ["1 · Quelles colonnes sont vraiment utilisées ?", "📊 Fill rate compte, pour chaque colonne, les lignes qui ont une valeur — des comptes exacts par requêtes d'agrégat, jamais ligne à ligne. Les colonnes jamais remplies ressortent en rouge."],
      run: async (h) => {
        await h.open("Metadata");
        await h.type(h.page.getByPlaceholder("Search entity...").first(), "acc"); await h.wait(700);
        await h.click(h.vis("Account")); await h.wait(1200);
        await h.click(btn(h, /📊 Fill rate/)); await h.wait(2200);
        await h.hover(h.page.locator("text=/never filled/ >> visible=true").first()); await h.wait(1500);
        await h.hover(fieldRow(h, "fax").locator("td").nth(5)); await h.wait(1500);
      } },
    { key: "dictionary",
      en: ["2 · A data dictionary for many tables", "📚 Data dictionary writes every column of the custom tables, the tables listed or all of them — type, required, custom, descriptions — to one CSV or Excel file."],
      fr: ["2 · Un dictionnaire de données multi-tables", "📚 Data dictionary écrit chaque colonne des tables custom, des tables listées ou de toutes — type, obligatoire, custom, descriptions — dans un seul fichier CSV ou Excel."],
      run: async (h) => {
        await h.click(btn(h, /📚 Data dictionary/)); await h.wait(1600);
        await h.hover(h.page.locator("text=/^All tables/ >> visible=true").first()); await h.wait(1200);
        await h.hover(h.page.locator("div >> visible=true").filter({ hasText: /^All tables/ }).last().getByRole("button", { name: "Excel" })); await h.wait(1600);
      } },
    { key: "delete-column",
      en: ["3 · 🧨 What blocks deleting this column?", "Dataverse's own dependency check, every component named and grouped — forms, views, business rules, flows, plug-in steps, keys — each with how to remove it."],
      fr: ["3 · 🧨 Qu'est-ce qui bloque la suppression de cette colonne ?", "Le contrôle de dépendances de Dataverse lui-même, chaque composant nommé et groupé — formulaires, vues, règles métier, flows, steps de plug-in, clés — avec comment le retirer."],
      run: async (h) => {
        await h.press("Escape"); await h.wait(400);
        await filterCols(h, "sap");
        await h.click(fieldRow(h, "new_sapid").getByRole("button", { name: "🧨" })); await h.wait(1800);
        await h.hover(h.page.locator("text=/must stop using the column/ >> visible=true").first()); await h.wait(1600);
        await h.hover(h.page.locator("text=/^→ /  >> visible=true").nth(2)); await h.wait(1300);
        const body = h.page.locator("text=/must stop using the column/ >> visible=true").first().locator("xpath=..");
        await body.evaluate(el => el.scrollBy({ top: 330, behavior: "smooth" })); await h.wait(1800);
      } },
    { key: "used-by-table",
      en: ["4 · …and everything that uses the table", "On the table: lookups from other tables, their forms and views, apps, flows, charts — then its own forms, views and columns, set apart: deleted with it."],
      fr: ["4 · …et tout ce qui utilise la table", "Sur la table : lookups des autres tables, leurs formulaires et vues, apps, flows, graphiques — puis ses propres formulaires, vues et colonnes, à part : supprimés avec elle."],
      run: async (h) => {
        await h.press("Escape"); await h.wait(400);
        await h.click(btn(h, /🧨 Dependencies/)); await h.wait(1600);
        await h.hover(h.page.locator("text=/through /  >> visible=true").first()); await h.wait(1300);
        await h.click(btn(h, /^Everything that uses it$/)); await h.wait(1500);
        const own = h.page.locator("text=/its own part — deleted with it/ >> visible=true").first();
        await own.scrollIntoViewIfNeeded(); await h.hover(own); await h.wait(1700);
      } },
    { key: "layers",
      en: ["5 · 📑 Solution layers", "Which solutions change this column, top layer first. Here an unmanaged \"Active\" layer hides the managed ContosoSAP: the 2 values it overrides are struck through — they don't win."],
      fr: ["5 · 📑 Couches de solution", "Quelles solutions modifient cette colonne, couche du dessus d'abord. Ici une couche unmanaged « Active » masque la solution managed ContosoSAP : les 2 valeurs qu'elle écrase sont barrées — elles ne gagnent pas."],
      run: async (h) => {
        await h.press("Escape"); await h.wait(400);
        await h.click(fieldRow(h, "new_sapid").getByRole("button", { name: "📑" })); await h.wait(1500);
        await h.hover(h.page.locator("text=/An unmanaged \"Active\" layer/ >> visible=true").first()); await h.wait(1600);
        await h.click(h.page.locator("b >> visible=true").filter({ hasText: /^ContosoSAP$/ }).first()); await h.wait(1200);
        await h.hover(h.page.locator("span >> visible=true").filter({ hasText: /^SAP ID$/ }).last()); await h.wait(1600);
      } },
    { key: "search-columns",
      en: ["6 · 🔎 What the global search shows and searches", "For every table, from its Quick Find view: the columns shown in the results, the columns the typed text is searched in — and the index: rows indexed, last sync."],
      fr: ["6 · 🔎 Ce que la recherche globale affiche et cherche", "Pour chaque table, d'après sa vue Quick Find : les colonnes affichées dans les résultats, celles où le texte tapé est cherché — et l'index : lignes indexées, dernière synchro."],
      run: async (h) => {
        await h.press("Escape"); await h.wait(400);
        await h.click(btn(h, /🔎 Search result columns/)); await h.wait(1700);
        await h.hover(h.page.locator("text=/tables enabled for Dataverse search/ >> visible=true").first()); await h.wait(1300);
        await h.click(h.page.locator("b >> visible=true").filter({ hasText: /^Account$/ }).first()); await h.wait(1300);
        await h.hover(h.page.locator("text=/rows indexed/ >> visible=true").first()); await h.wait(1500);
      } },
    { key: "search-gaps",
      pos: "top",
      en: ["7 · …and where search falls short", "Flagged: a table enabled with no Quick Find view, one with no Find column, an index sync still running — and tables switched off when you untick \"enabled only\"."],
      fr: ["7 · …et là où la recherche coince", "Signalés : une table activée sans vue Quick Find, une autre sans colonne Find, une synchro d'index en cours — et les tables désactivées en décochant « enabled only »."],
      run: async (h) => {
        const body = h.page.locator("text=/tables enabled for Dataverse search/ >> visible=true").first().locator("xpath=../..");
        await body.evaluate(el => el.scrollBy({ top: 420, behavior: "smooth" })); await h.wait(1200);
        await h.hover(h.page.locator("text=/No Quick Find view/ >> visible=true").first()); await h.wait(1500);
        await h.click(h.page.locator("label >> visible=true").filter({ hasText: /enabled tables only/ }).first()); await h.wait(1200);
        await body.evaluate(el => el.scrollBy({ top: 400, behavior: "smooth" })); await h.wait(1000);
        await h.hover(h.page.locator("text=/^search off$/ >> visible=true").first()); await h.wait(1500);
      } },
    { key: "multiselect",
      en: ["8 · Multi-select choices too", "A multi-select choice column has its Values too: each value with its label, exportable to CSV or Excel — and a row can hold several of them."],
      fr: ["8 · Les choix multiples aussi", "Une colonne à choix multiples a aussi ses Values : chaque valeur avec son libellé, exportables en CSV ou Excel — et une ligne peut en porter plusieurs."],
      run: async (h) => {
        await h.press("Escape"); await h.wait(400);
        await filterCols(h, "channel");
        await h.click(fieldRow(h, "new_channels").getByRole("button", { name: /^Values/ })); await h.wait(1500);
        await h.hover(h.page.locator("text=/a row can hold several/ >> visible=true").first()); await h.wait(1300);
        await h.hover(h.page.locator("td >> visible=true").filter({ hasText: /^SMS$/ }).first()); await h.wait(1500);
      } },
  ],
};
