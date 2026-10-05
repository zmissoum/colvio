// Deep dive — Translations. Every action below was checked against demo mode (make-deep --probe).
const btn = (h, re) => h.page.locator("button >> visible=true").filter({ hasText: re }).first();
// A label cell of the grid, found by its current text (React keeps the value attribute in sync).
const cell = (h, label) => h.page.locator(`td input[value="${label}"] >> visible=true`).first();
const retype = async (h, label, text) => {
  await h.click(cell(h, label));
  await h.page.keyboard.press("Control+A");
  await h.page.keyboard.type(text, { delay: 85 }); await h.wait(700);
};
// The CSV a translator sends back: French labels fixed (accents, a clearer wording).
const CSV = [
  "logical_name,type,label_1033,label_1036",
  "name,String,Account Name,Nom du compte",
  "revenue,Money,Annual Revenue,Chiffre d'affaires annuel",
  "telephone1,String,Main Phone,Téléphone principal",
  "emailaddress1,String,Email,Adresse e-mail",
  "address1_city,String,City,Ville",
  "industrycode,Picklist,Industry,Secteur d'activité",
  "statecode,State,Status,Statut",
  "numberofemployees,Integer,Employees,Employés",
  "websiteurl,String,Website,Site web",
  "accountnumber,String,Account Number,Numéro de compte",
].join("\n");

export default {
  key: "translations",
  label: "Translations",
  tagline: {
    en: "Every column label in every language of the org — edited side by side, round-tripped through Excel",
    fr: "Chaque libellé de colonne dans toutes les langues de l'org — édité côte à côte, aller-retour par Excel",
  },
  chapters: [
    { key: "pick-table",
      en: ["1 · Every label, every language", "Find a table and open it: each column's display name in every language installed on the org, side by side."],
      fr: ["1 · Chaque libellé, chaque langue", "Trouvez une table et ouvrez-la : le nom d'affichage de chaque colonne dans toutes les langues installées sur l'org, côte à côte."],
      run: async (h) => {
        await h.open("Translations");
        await h.type(h.page.getByPlaceholder("Search entity..."), "acc"); await h.wait(800);
        await h.click(h.vis("Account")); await h.wait(1400);
        await h.hover(h.page.locator("th >> visible=true").filter({ hasText: "German" }).first()); await h.wait(1300);
      } },
    { key: "languages",
      en: ["2 · Only the languages you need", "Untick a language to hide its column — the CSV export follows the same selection."],
      fr: ["2 · Seulement les langues utiles", "Décochez une langue pour masquer sa colonne — l'export CSV suit la même sélection."],
      run: async (h) => {
        await h.click(h.page.locator("label >> visible=true").filter({ hasText: "German (1031)" }).locator("input")); await h.wait(2200);
        await h.hover(btn(h, /Export CSV$/)); await h.wait(1300);
      } },
    { key: "filter",
      en: ["3 · Filter the columns", "Search by logical name or by any label, in any language — “phone”, then the French “Ville”."],
      fr: ["3 · Filtrer les colonnes", "Recherche par nom logique ou par n'importe quel libellé, dans n'importe quelle langue — « phone », puis le français « Ville »."],
      run: async (h) => {
        const f = h.page.getByPlaceholder("Filter attributes...");
        await h.type(f, "phone"); await h.wait(1600);
        await f.fill(""); await h.wait(500);
        await h.page.keyboard.type("ville", { delay: 90 }); await h.wait(1800);
      } },
    { key: "edit",
      en: ["4 · Fix a label in place", "Type straight into the grid: changed cells are highlighted and counted on Save, which writes them and publishes the table."],
      fr: ["4 · Corriger un libellé sur place", "Tapez directement dans la grille : les cellules modifiées sont surlignées et comptées sur Save, qui les écrit et publie la table."],
      run: async (h) => {
        await h.click(h.page.getByPlaceholder("Filter attributes...")); await h.page.getByPlaceholder("Filter attributes...").fill(""); await h.wait(800);
        await retype(h, "Telephone principal", "Téléphone principal");
        await retype(h, "Employes", "Employés");
        await retype(h, "Numero de compte", "Numéro de compte");
        await h.hover(btn(h, /Save \(\d+\)/)); await h.wait(1600);
      } },
    { key: "guard",
      en: ["5 · No edit lost by accident", "Switch to another table with unsaved edits and Colvio asks first — Cancel keeps your changes."],
      fr: ["5 · Aucune modification perdue", "Passer à une autre table avec des modifications non enregistrées demande d'abord confirmation — « Cancel » conserve vos changements."],
      run: async (h) => {
        const s = h.page.getByPlaceholder("Search entity...");
        await h.click(s); await s.fill(""); await h.wait(600);
        await h.click(h.vis("Contact")); await h.wait(2400);
        await h.click(h.page.getByRole("button", { name: "Cancel", exact: true })); await h.wait(1000);
      } },
    { key: "csv-roundtrip",
      en: ["6 · Round-trip through Excel", "Export the grid to CSV, translate it in Excel, import it back: every changed label returns as a highlighted pending edit."],
      fr: ["6 · Aller-retour par Excel", "Exportez la grille en CSV, traduisez-la dans Excel, réimportez-la : chaque libellé modifié revient en modification surlignée, prête à enregistrer."],
      run: async (h) => {
        await h.hover(btn(h, /Export CSV$/)); await h.wait(1000);
        const imp = btn(h, /Import CSV$/);
        await h.hover(imp);
        const [chooser] = await Promise.all([h.page.waitForEvent("filechooser"), imp.click()]);
        await chooser.setFiles({ name: "account_translations.csv", mimeType: "text/csv", buffer: Buffer.from(CSV, "utf-8") });
        await h.wait(1600);
        await h.hover(cell(h, "Secteur d'activité")); await h.wait(1300);
        await h.hover(btn(h, /Save \(\d+\)/)); await h.wait(1500);
      } },
  ],
};
