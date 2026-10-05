// Deep dive — Metadata browser. Demo tables/columns come from the built-in mock (ENTS / FLDS);
// demo option-set fetches return Active / Inactive, so the values chapter uses statecode, where
// that is the real answer.
const btn = (h, re) => h.page.locator("button >> visible=true").filter({ hasText: re }).first();

// A schema snapshot as Colvio exports it (colvioSchema: 1), "taken on DEV": one table and three
// columns the current (demo) org doesn't have.
const SNAPSHOT = {
  colvioSchema: 1, org: "org-dev", takenAt: "2026-10-02T08:30:00Z", entityCount: 2,
  entities: {
    new_sapcredit: { d: "SAP Credit", fields: {
      new_creditlimit: { t: "Money", r: true, c: true },
      new_sapcustomerno: { t: "String", r: false, c: true },
      new_blocked: { t: "Boolean", r: false, c: true },
    } },
    new_project: { d: "Project", fields: { new_name: { t: "String", r: true, c: true } } },
  },
};

export default {
  key: "metadata",
  label: "Metadata",
  tagline: {
    en: "Tables, columns and option sets — browse, copy, export and compare",
    fr: "Tables, colonnes et option sets — parcourez, copiez, exportez et comparez",
  },
  chapters: [
    { key: "table-chips",
      en: ["1 · Every table, filtered your way", "Chips filter the table list by category — and Virtual / Elastic chips single out the special table types, badged in the list."],
      fr: ["1 · Toutes les tables, filtrées à votre façon", "Des filtres par catégorie réduisent la liste des tables — et Virtual / Elastic isolent les types de tables spéciaux, signalés par un badge."],
      run: async (h) => {
        await h.open("Metadata");
        await h.click(btn(h, /^Sales \(\d+\)$/)); await h.wait(1800);
        await h.click(btn(h, /^Virtual \(\d+\)$/)); await h.wait(1300);
        await h.hover(h.vis("VIRTUAL")); await h.wait(1600);
      } },
    { key: "pick-table",
      en: ["2 · Open a table", "Search by display or logical name, pick a table: every column with its label and type — red dot if required, orange if custom."],
      fr: ["2 · Ouvrir une table", "Cherchez par nom d'affichage ou logique, choisissez une table : chaque colonne avec libellé et type — point rouge si obligatoire, orange si custom."],
      run: async (h) => {
        await h.click(btn(h, /^All \(\d+\)$/)); await h.wait(700);
        await h.type(h.page.getByPlaceholder("Search entity...").first(), "acc"); await h.wait(1100);
        await h.click(h.vis("Account")); await h.wait(1800);
        await h.hover(h.vis("new_sapid")); await h.wait(1200);
        await h.hover(h.vis("Required")); await h.wait(1300);
      } },
    { key: "filter-columns",
      en: ["3 · Filter the columns", "Hundreds of columns? Type a fragment of a logical name or label and the list narrows instantly."],
      fr: ["3 · Filtrer les colonnes", "Des centaines de colonnes ? Tapez un fragment de nom logique ou de libellé : la liste se réduit instantanément."],
      run: async (h) => {
        await h.type(h.page.getByPlaceholder("Filter columns...").first(), "address"); await h.wait(2000);
        await h.hover(h.vis("address1_postalcode")); await h.wait(1500);
      } },
    { key: "option-values",
      en: ["4 · Read option set values", "Values opens a choice column's options — each number with its label — exportable to CSV or Excel from the same window."],
      fr: ["4 · Lire les valeurs d'un option set", "Values ouvre les options d'une colonne de choix — chaque valeur avec son libellé — exportables en CSV ou Excel depuis la même fenêtre."],
      run: async (h) => {
        const f = h.page.getByPlaceholder("Filter columns...").first();
        await h.click(f); await f.fill(""); await f.pressSequentially("status", { delay: 90 }); await h.wait(1300);
        const row = h.page.locator("tr >> visible=true").filter({ hasText: /statecode/ }).first();
        await h.click(row.getByRole("button", { name: /^Values/ })); await h.wait(2200);
        await h.hover(btn(h, /Export CSV$/)); await h.wait(1500);
      } },
    { key: "copy-names",
      en: ["5 · Copy logical names", "Click any logical name to copy it — or the table's own — ready for your code, FetchXML or Power Automate."],
      fr: ["5 · Copier les noms logiques", "Cliquez un nom logique pour le copier — ou celui de la table — prêt pour votre code, FetchXML ou Power Automate."],
      run: async (h) => {
        await h.page.context().grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
        await h.press("Escape"); await h.wait(500);
        const f = h.page.getByPlaceholder("Filter columns...").first();
        await h.click(f); await f.fill(""); await h.wait(900);
        // the table's own logical name sits under its display name, with a copy icon next to it
        await h.click(h.page.locator("xpath=//div[normalize-space(text())='account']/button >> visible=true").first()); await h.wait(1300);
        await h.click(h.vis("accountnumber")); await h.wait(1300);
        await h.click(h.vis("new_siretcode")); await h.wait(300);
      } },
    { key: "dictionary-export",
      en: ["6 · Export the data dictionary", "One click exports every column — logical, label, OData name, type, required, custom — or all option set values, to CSV or Excel."],
      fr: ["6 · Exporter le dictionnaire de données", "Un clic exporte toutes les colonnes — nom logique, libellé, nom OData, type, obligatoire, custom — ou toutes les valeurs d'option set, en CSV ou Excel."],
      run: async (h) => {
        await h.hover(btn(h, /Export All Fields$/)); await h.wait(900);
        const tip = btn(h, /Export All Fields$/).locator("xpath=following-sibling::span[1]//button");
        await h.click(tip); await h.wait(2400);
        await h.hover(btn(h, /Export All OptionSets$/)); await h.wait(1500);
      } },
    { key: "schema-diff",
      en: ["7 · Snapshot & compare schemas", "Export the schema as JSON, load a snapshot taken on another org and compare: missing tables and columns, type and requirement gaps."],
      fr: ["7 · Capturer et comparer les schémas", "Exportez le schéma en JSON, chargez une capture prise sur une autre org et comparez : tables et colonnes manquantes, écarts de type et d'obligation."],
      run: async (h) => {
        await h.press("Escape"); await h.wait(300);
        await h.click(btn(h, /Schema snapshot & diff$/)); await h.wait(1500);
        const scope = h.page.locator("label >> visible=true").filter({ hasText: /Custom tables only/ }).first();
        await h.click(scope); await h.wait(1000);
        await h.click(scope); await h.wait(700);
        await h.hover(btn(h, /Export schema snapshot/)); await h.wait(1100);
        const [chooser] = await Promise.all([h.page.waitForEvent("filechooser"), h.click(btn(h, /Load snapshot/))]);
        await chooser.setFiles({ name: "schema_org-dev_20261002.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(SNAPSHOT)) });
        await h.wait(1300);
        await h.click(btn(h, /Compare with current org$/)); await h.wait(2600);
      } },
  ],
};
