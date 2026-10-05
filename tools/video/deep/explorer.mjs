// Deep dive — Data Explorer. Every action below was checked against demo mode (make-deep --probe).
const btn = (h, re) => h.page.locator("button >> visible=true").filter({ hasText: re }).first();
const selectWithOption = (h, value) => h.page.locator("select >> visible=true").filter({ has: h.page.locator(`option[value="${value}"]`) }).first();

export default {
  key: "explorer",
  label: "Data Explorer",
  tagline: {
    en: "Query any Dataverse table — then edit, clean and export the results",
    fr: "Interrogez n'importe quelle table Dataverse — puis éditez, nettoyez et exportez les résultats",
  },
  chapters: [
    { key: "table-columns",
      en: ["1 · Pick a table and its columns", "Every table of the org with its row count. Choose the columns to return — searchable, by type."],
      fr: ["1 · Choisir une table et ses colonnes", "Toutes les tables de l'org avec leur volume. Choisissez les colonnes à renvoyer — recherche et filtre par type."],
      run: async (h) => {
        await h.open("Data Explorer");
        await h.click(h.vis("Account")); await h.wait(1200);
        await h.click(btn(h, /Columns \(\d+\/\d+\)/)); await h.wait(2200);
        await h.click(btn(h, /^Close$/)); await h.wait(600);
      } },
    { key: "builder-filter",
      en: ["2 · Filter visually", "Add conditions with the operators that fit each column type — text, numbers, dates, choices. Groups combine with AND / OR."],
      fr: ["2 · Filtrer visuellement", "Ajoutez des conditions avec les opérateurs adaptés à chaque type de colonne — texte, nombres, dates, choix. Les groupes se combinent en ET / OU."],
      run: async (h) => {
        await h.select(selectWithOption(h, "accountnumber"), "accountnumber");
        await h.select(selectWithOption(h, "startswith"), "startswith");
        await h.type(h.page.getByPlaceholder("text").first(), "ACC"); await h.wait(1600);
      } },
    { key: "run-sort-filter", pos: "top",
      en: ["3 · Run, sort, narrow down", "Ctrl+Enter runs it — no 5,000-row cap. Sort any column, filter the loaded rows instantly."],
      fr: ["3 · Exécuter, trier, affiner", "Ctrl+Entrée lance la requête — sans plafond à 5 000 lignes. Triez n'importe quelle colonne, filtrez les lignes chargées instantanément."],
      run: async (h) => {
        await h.click(h.page.getByRole("button", { name: /Execute/ }).first()); await h.wait(1800);
        await h.click(h.page.locator("th >> visible=true").filter({ hasText: /^name/ }).first()); await h.wait(1200);
        const f = h.page.getByPlaceholder(/Filter results/).first();
        await h.type(f, "Paris"); await h.wait(1600);
        await f.fill(""); await h.wait(700);
      } },
    { key: "languages",
      en: ["4 · Four query languages", "The same query in OData or FetchXML — or write SQL: run natively by Dataverse, or converted to FetchXML."],
      fr: ["4 · Quatre langages de requête", "La même requête en OData ou en FetchXML — ou écrivez du SQL : exécuté nativement par Dataverse, ou converti en FetchXML."],
      run: async (h) => {
        await h.click(h.page.getByRole("button", { name: "OData", exact: true })); await h.wait(1300);
        await h.click(h.page.getByRole("button", { name: "FetchXML", exact: true })); await h.wait(1300);
        await h.click(h.page.getByRole("button", { name: "SQL", exact: true })); await h.wait(700);
        await h.click(btn(h, /Simple$/)); await h.wait(900);
        await h.hover(btn(h, /Transpiled/)); await h.wait(900);
        await h.click(btn(h, /View FetchXML/)); await h.wait(1700);
        await h.click(h.page.getByRole("button", { name: "Builder", exact: true })); await h.wait(700);
      } },
    { key: "inline-edit", pos: "top",
      en: ["5 · Edit in place", "Double-click a cell to change it. Values are checked against the column's type before anything is sent."],
      fr: ["5 · Éditer sur place", "Double-cliquez une cellule pour la modifier. La valeur est vérifiée selon le type de la colonne avant tout envoi."],
      run: async (h) => {
        const cell = h.page.locator("td >> visible=true").filter({ hasText: /^Paris$/ }).first();
        await h.dblclick(cell); await h.wait(500);
        await h.page.keyboard.press("Control+A");
        await h.page.keyboard.type("Lyon", { delay: 110 });
        await h.press("Enter"); await h.wait(1800);
      } },
    { key: "bulk-update", pos: "top",
      en: ["6 · Bulk update", "Tick records, pick a column and a value: one update for all of them, with a confirmation first."],
      fr: ["6 · Mise à jour en masse", "Cochez des enregistrements, choisissez une colonne et une valeur : une mise à jour pour tous, après confirmation."],
      run: async (h) => {
        const boxes = h.page.locator("tbody input[type=checkbox] >> visible=true");
        await h.click(boxes.nth(1)); await h.click(boxes.nth(2)); await h.wait(500);
        await h.click(btn(h, /Update 2$/)); await h.wait(800);  // label is "⚡ Update 2" (icon + space)
        await h.select(h.page.locator('label:text-is("Column") + select >> visible=true').first(), "address1_city");
        await h.type(h.page.getByPlaceholder(/null, true, false/).first(), "Madrid");
        await h.click(h.page.getByRole("button", { name: /Update 2$/ }).last()); await h.wait(1000);
        await h.click(h.page.getByRole("button", { name: "Confirm", exact: true })); await h.wait(2000);
      } },
    { key: "duplicates", pos: "top",
      en: ["7 · Find duplicates", "Choose the columns that define a duplicate: Colvio groups the rows and selects the extras, ready for a bulk delete."],
      fr: ["7 · Trouver les doublons", "Choisissez les colonnes qui définissent un doublon : Colvio regroupe les lignes et sélectionne l'excédent, prêt pour une suppression en masse."],
      run: async (h) => {
        await h.click(btn(h, /Duplicates/)); await h.wait(900);
        await h.click(h.page.locator("label >> visible=true").filter({ hasText: /^statecode$/ }).first()); await h.wait(500);
        await h.click(btn(h, /^Analyze/)); await h.wait(1600);
        await h.click(btn(h, /^Select \d+ duplicates/)); await h.wait(1800);
      } },
    { key: "tabs-history",
      en: ["8 · Tabs, history, exports", "Several queries side by side, a history that reopens Builder queries — values redacted for privacy — and Excel / CSV / JSON exports."],
      fr: ["8 · Onglets, historique, exports", "Plusieurs requêtes côte à côte, un historique qui rouvre les requêtes du Builder — valeurs masquées par confidentialité — et les exports Excel / CSV / JSON."],
      run: async (h) => {
        await h.click(btn(h, /^\+?\s*New$/)); await h.wait(1100);
        await h.click(h.vis("Query 1")); await h.wait(900);
        await h.click(h.page.getByTitle("Query history")); await h.wait(1800);
        await h.click(h.page.getByTitle("Query history")); await h.wait(500);
        await h.hover(h.page.getByRole("button", { name: /Excel/ }).nth(1)); await h.wait(1400);
      } },
  ],
};
