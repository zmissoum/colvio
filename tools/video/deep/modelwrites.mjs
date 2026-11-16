// Deep dive — Change the model without XrmToolBox: edit a choice column's values (optionSetEditDemo
// keeps them in memory), create columns in bulk from a file (fed in memory through Playwright's
// file chooser — nothing read from disk), and a plug-in step's filtering attributes.
//
// Every write in Colvio asks for a confirmation first, in the app's own dialog: the click shows its
// message, the cursor clicks OK, then the write runs — as on an org (h.confirmed in lib.mjs).
// Every action below was checked against demo mode (make-deep --probe).
const btn = (h, re) => h.page.locator("button >> visible=true").filter({ hasText: re }).first();
const fieldRow = (h, logical) => h.page.locator("tbody tr >> visible=true").filter({ has: h.page.locator(`text="${logical}"`) }).first();
const optRow = (h, value) => h.page.locator(`xpath=//tr[td[1][normalize-space(.)='${value}']] >> visible=true`).first();

// Click a write button: its confirmation is read, OK is clicked, then the write runs.
const confirmed = async (h, loc, readMs = 2600) => { await h.confirmed(loc, readMs); await h.wait(500); };

// The sheet: 9 columns for Account, four of them with mistakes that are caught before anything is sent.
const SHEET = [
  ["Display name", "Type", "Required", "Max length", "Options", "Target", "Description"],
  ["Credit limit", "Currency", "Required", "", "", "", "Approved by finance"],
  ["Risk level", "Choice", "Recommended", "", "Low;Medium;High", "", ""],
  ["Audited", "Yes/No", "No", "", "", "", ""],
  ["Last audit", "Date", "No", "", "", "", ""],
  ["Key account manager", "Lookup", "No", "", "", "systemuser", "Who follows this account"],
  ["SAP region", "Choice", "No", "", "", "", ""],
  ["Contract owner", "Lookup", "No", "", "", "new_contract", ""],
  ["Internal notes", "Text", "No", "8000", "", "", ""],
  ["Risk level", "Choice", "No", "", "Low;High", "", ""],
].map(r => r.join(",")).join("\n");

export default {
  key: "modelwrites",
  label: "Metadata · Automation",
  tagline: {
    en: "Change the model without XrmToolBox — choice values, columns from a file, plug-in step filters",
    fr: "Modifier le modèle sans XrmToolBox — valeurs de choix, colonnes depuis un fichier, filtres de steps",
  },
  chapters: [
    { key: "edit-values",
      en: ["1 · Edit a choice column's values", "Values › ✏️ Edit values. It says what you touch: here a global choice — a change applies to every column that uses it — and each change is published right away."],
      fr: ["1 · Modifier les valeurs d'une colonne de choix", "Values › ✏️ Edit values. Il dit ce que vous touchez : ici un choix global — le changement vaut pour toutes les colonnes qui l'utilisent — et chaque changement est publié aussitôt."],
      run: async (h) => {
        await h.open("Metadata");
        await h.click(h.vis("Account")); await h.wait(900);
        await h.type(h.page.getByPlaceholder("Filter columns...").first(), "custom"); await h.wait(700);
        await h.click(fieldRow(h, "customertypecode").getByRole("button", { name: /^Values/ })); await h.wait(1100);
        await h.click(btn(h, /✏️ Edit values/)); await h.wait(1000);
        await h.hover(h.page.locator("text=/a change here applies to every column that uses it/ >> visible=true").first()); await h.wait(1500);
      } },
    { key: "add",
      pos: "top",
      en: ["2 · Add an option", "A label, the value optional — Dataverse then picks one with your publisher's prefix. Confirmed first, then published: the new value comes back."],
      fr: ["2 · Ajouter une option", "Un libellé, la valeur en option — Dataverse en choisit une avec le préfixe de votre éditeur. Confirmé d'abord, puis publié : la nouvelle valeur s'affiche."],
      run: async (h) => {
        await h.type(h.page.getByPlaceholder("New option label").first(), "Distributor"); await h.wait(500);
        await confirmed(h, btn(h, /＋ Add/), 2300);
        await h.hover(h.page.locator("text=/✓ Add “Distributor”/ >> visible=true").first()); await h.wait(900);
        await h.hover(optRow(h, 100000000).locator("input")); await h.wait(1000);
      } },
    { key: "rename-reorder",
      en: ["3 · Rename one, reorder them", "A new label: rows keep their value, labels in other languages are kept. ↑ ↓ then Save order: how forms and filters list them — the values don't change."],
      fr: ["3 · En renommer une, les réordonner", "Un nouveau libellé : les lignes gardent leur valeur, les libellés des autres langues sont conservés. ↑ ↓ puis Save order : l'ordre des formulaires et filtres — les valeurs ne changent pas."],
      run: async (h) => {
        const inp = optRow(h, 7).locator("input");
        await h.click(inp); await inp.fill(""); await inp.pressSequentially("Media", { delay: 80 }); await h.wait(300);
        await confirmed(h, optRow(h, 7).getByRole("button", { name: "Rename" }), 2100);
        await h.click(optRow(h, 3).getByRole("button", { name: "↑" })); await h.wait(300);
        await h.click(optRow(h, 3).getByRole("button", { name: "↑" })); await h.wait(600);
        await confirmed(h, btn(h, /^Save order$/), 1700);
        await h.hover(optRow(h, 3).locator("input")); await h.wait(1000);
      } },
    { key: "delete",
      en: ["4 · Delete one — knowing who holds it", "Before a delete, one count of the rows that hold the value. The confirmation says it, says it's a global choice, and that it can't be undone."],
      fr: ["4 · En supprimer une — en sachant qui la porte", "Avant une suppression, un comptage des lignes qui portent la valeur. La confirmation le dit, rappelle que c'est un choix global, et que c'est irréversible."],
      run: async (h) => {
        await confirmed(h, optRow(h, 6).getByRole("button", { name: "🗑" }), 3100);
        await h.hover(h.page.locator("text=/✓ Delete “Influencer”/ >> visible=true").first()); await h.wait(1300);
      } },
    { key: "columns-file",
      en: ["5 · Create columns from a file", "➕ Columns from file: one row per column — name, type, required, options, lookup target. Every row is checked first: choice without options, unknown table, length out of bounds, duplicate."],
      fr: ["5 · Créer des colonnes depuis un fichier", "➕ Columns from file : une ligne par colonne — nom, type, obligatoire, options, table cible. Chaque ligne est vérifiée d'abord : choix sans options, table inconnue, longueur hors limites, doublon."],
      run: async (h) => {
        await h.press("Escape"); await h.wait(400);
        await h.click(btn(h, /➕ Columns from file/)); await h.wait(1000);
        await h.hover(h.page.locator("select >> visible=true").first()); await h.wait(900);
        const [chooser] = await Promise.all([h.page.waitForEvent("filechooser"), h.click(h.page.locator("label >> visible=true").filter({ hasText: /Choose a CSV \/ Excel file/ }).first())]);
        await chooser.setFiles({ name: "account_new_columns.csv", mimeType: "text/csv", buffer: Buffer.from(SHEET) });
        await h.wait(1200);
        await h.hover(h.page.locator("text=/isn't in this org/ >> visible=true").first()); await h.wait(1500);
      } },
    { key: "columns-create",
      pos: "top",
      en: ["6 · …then create them in one go", "Confirmed with the list, in the unmanaged solution you picked (its prefix), one request per column: then the table is published once. Rows with errors are skipped."],
      fr: ["6 · …puis les créer d'un coup", "Confirmé avec la liste, dans la solution unmanaged choisie (son préfixe), une requête par colonne : puis la table est publiée une fois. Les lignes en erreur sont ignorées."],
      run: async (h) => {
        await confirmed(h, btn(h, /^Create \d+ columns?$/), 3100);
        await h.page.locator("text=/table published, columns reloaded/ >> visible=true").first().waitFor({ timeout: 8000 });
        await h.hover(h.page.locator("text=/table published, columns reloaded/ >> visible=true").first()); await h.wait(1600);
      } },
    { key: "step-filtering",
      pos: "top",
      en: ["7 · A plug-in step's filtering attributes", "Automation: an Update step's Filtering column opens its columns — tick or untick, Save confirms the diff before the step is updated."],
      fr: ["7 · Les attributs de filtrage d'un step", "Automation : la colonne Filtering d'un step Update ouvre ses colonnes — cochez, décochez, Save confirme l'écart avant de mettre le step à jour."],
      run: async (h) => {
        await h.click(btn(h, /^Close$/)); await h.wait(300);
        await h.open("Automation"); await h.wait(500);
        const row = h.page.locator("tbody tr >> visible=true").filter({ hasText: /SapSync/ }).first();
        await h.click(row.getByRole("button", { name: /col\.$/ })); await h.wait(900);
        const tick = (logical) => h.page.locator("label >> visible=true").filter({ has: h.page.locator(`span:text-is("${logical}")`) }).first();
        await h.click(tick("accountnumber")); await h.wait(300);
        await h.click(tick("name")); await h.wait(500);
        await confirmed(h, btn(h, /^Save$/), 2500);
        await h.hover(h.page.locator("text=/Filtering attributes of .* saved/ >> visible=true").first()); await h.wait(1100);
      } },
  ],
};
