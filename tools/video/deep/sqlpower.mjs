// Deep dive — Data Explorer, SQL and beyond (the features after the basics filmed in explorer.mjs).
// Every action below was checked against demo mode (make-deep --probe). Demo mode answers every
// query with the same six accounts and the Builder's five columns, so each query here is written
// to match them: the pasted URL selects those five columns, and the UPDATE's WHERE is one all six
// accounts meet (all created before 2024), so the preview's rows are exactly what that WHERE reads.
const btn = (h, re) => h.page.locator("button >> visible=true").filter({ hasText: re }).first();
const selectWithOption = (h, value) => h.page.locator("select >> visible=true").filter({ has: h.page.locator(`option[value="${value}"]`) }).first();
const sqlBox = (h) => h.page.locator("textarea >> visible=true").first();
// Typing in the SQL editor: slow enough for the suggestions to be read.
const typeSlow = (h, text, delay = 150) => h.page.keyboard.type(text, { delay });
// Select a piece of the editor's text (as a double-click + drag would) so the next keys replace it.
const selectInBox = (h, piece) => sqlBox(h).evaluate((el, p) => { const i = el.value.indexOf(p); el.focus(); el.setSelectionRange(i, i + p.length); }, piece);

const PASTED_URL = "https://contoso-dev.crm4.dynamics.com/api/data/v9.2/accounts?$select=name,accountnumber,emailaddress1,address1_city,statecode&$top=50";
const UPDATE_SQL = "UPDATE account SET statecode = 'Inactive' WHERE createdon < '2024-01-01'";

export default {
  key: "sqlpower",
  label: "Data Explorer, SQL and beyond",
  tagline: {
    en: "Paste a URL, write SQL with completion, preview every write — then keep the query as a view",
    fr: "Collez une URL, écrivez du SQL avec complétion, prévisualisez chaque écriture — puis gardez la requête en vue",
  },
  chapters: [
    { key: "paste-url",
      en: ["1 · Paste a Web API URL", "A full URL copied from the browser or Postman, even from another environment: Colvio opens its table in OData mode — and says it runs here."],
      fr: ["1 · Coller une URL Web API", "Une URL complète copiée du navigateur ou de Postman, même d'un autre environnement : Colvio ouvre sa table en mode OData — et précise qu'elle s'exécute ici."],
      run: async (h) => {
        await h.open("Data Explorer"); await h.wait(300);
        const box = h.page.getByPlaceholder(/yourorg\.crm\.dynamics\.com/).first();
        await h.click(box); await box.fill(PASTED_URL); await h.wait(900);
        await h.click(btn(h, /^Open in OData mode$/)); await h.wait(1200);
        await h.click(btn(h, /Execute/)); await h.wait(1500);
      } },
    { key: "to-file",
      en: ["2 · Every row, straight to a file", "⬇ To file runs the query and streams every row to CSV or Excel — page after page, nothing kept in the browser."],
      fr: ["2 · Toutes les lignes, directement dans un fichier", "⬇ To file exécute la requête et écrit chaque ligne en CSV ou Excel — page après page, rien n'est gardé dans le navigateur."],
      run: async (h) => {
        await h.click(btn(h, /To file$/)); await h.wait(700);
        await h.hover(btn(h, /^CSV/)); await h.wait(1000);
        await h.hover(btn(h, /^Excel/)); await h.wait(1300);
      } },
    { key: "sql-tables",
      en: ["3 · SQL completes as you type", "Right after FROM, the org's tables whose name matches what you typed. Tab inserts it."],
      fr: ["3 · Le SQL se complète à la frappe", "Juste après FROM, les tables de l'org dont le nom correspond à la saisie. Tab l'insère."],
      run: async (h) => {
        await h.click(btn(h, /To file$/)); await h.wait(300);          // close the menu left open
        await h.click(h.vis("Account")); await h.wait(300);             // a clean slate on the same table
        await h.click(h.page.getByRole("button", { name: "SQL", exact: true })); await h.wait(500);
        await h.click(sqlBox(h)); await h.wait(200);
        await typeSlow(h, "FROM a", 170); await h.wait(1200);
        await typeSlow(h, "cc", 240); await h.wait(1300);
      } },
    { key: "sql-columns",
      en: ["4 · …and the table's columns", "In the SELECT list, the columns of the FROM table — with their display name and type."],
      fr: ["4 · …et les colonnes de la table", "Dans la liste du SELECT, les colonnes de la table du FROM — avec leur nom d'affichage et leur type."],
      run: async (h) => {
        await h.press("Tab"); await h.wait(400);                       // accept "account"
        await h.press("Home");
        await typeSlow(h, "SELECT", 110);
        await h.press("Enter"); await h.press("ArrowLeft");
        await typeSlow(h, " re", 220); await h.wait(1100);
        await h.press("Tab"); await h.wait(300);
        await typeSlow(h, ", na", 200); await h.wait(800);
        await h.press("Tab"); await h.wait(300);
        await typeSlow(h, ", accounti", 150); await h.wait(1300);
      } },
    { key: "sql-refused",
      en: ["5 · UPDATE in SQL — checked first", "Write an UPDATE and Execute becomes Preview UPDATE. Values are typed first: a label where an option set needs its number is refused, with the reason."],
      fr: ["5 · UPDATE en SQL — vérifié d'abord", "Écrivez un UPDATE et Execute devient Preview UPDATE. Les valeurs sont typées d'abord : un libellé là où un groupe d'options attend son numéro est refusé, avec la raison."],
      run: async (h) => {
        await h.press("Tab"); await h.wait(1000);                      // accept "accountid"
        await h.page.keyboard.press("Control+A");
        await h.page.keyboard.type(UPDATE_SQL, { delay: 28 }); await h.wait(300);
        await h.press("Escape");   // close the suggestions first: the bar collapsing on blur would move the button mid-click
        await h.click(btn(h, /Preview UPDATE/)); await h.wait(1900);
      } },
    { key: "sql-preview",
      en: ["6 · Every row it would touch", "With the value fixed, the WHERE runs as a SELECT: the six accounts it matches, with their current status. Nothing is written yet."],
      fr: ["6 · Chaque ligne concernée", "Une fois la valeur corrigée, le WHERE s'exécute comme un SELECT : les six comptes visés, avec leur statut actuel. Rien n'est encore écrit."],
      run: async (h) => {
        await selectInBox(h, "'Inactive'"); await h.wait(500);
        await h.page.keyboard.type("1", { delay: 120 }); await h.wait(400);
        await h.press("Escape");
        await h.click(btn(h, /Preview UPDATE/)); await h.wait(1200);
        await h.hover(h.page.getByText("UPDATE preview", { exact: true }).first()); await h.wait(1300);
      } },
    { key: "sql-apply",
      en: ["7 · Apply asks first", "Apply writes exactly the previewed rows — after a confirmation that repeats the statement and what each record gets."],
      fr: ["7 · Apply demande d'abord", "Apply écrit exactement les lignes prévisualisées — après une confirmation qui reprend l'instruction et ce que reçoit chaque enregistrement."],
      run: async (h) => {
        await h.click(btn(h, /^Apply to 6 rows$/)); await h.wait(2300);
      } },
    { key: "save-view",
      en: ["8 · Save as a personal view", "👁 Save as view: the Builder query — its columns, filters and sort — becomes a personal view of the table, under My views in the app."],
      fr: ["8 · Enregistrer en vue personnelle", "👁 Save as view : la requête du Builder — colonnes, filtres et tri — devient une vue personnelle de la table, dans Mes vues de l'application."],
      run: async (h) => {
        await h.click(h.page.getByRole("button", { name: "Cancel", exact: true }).last()); await h.wait(500);
        await h.click(h.page.getByRole("button", { name: "Builder", exact: true })); await h.wait(500);
        await h.select(selectWithOption(h, "accountnumber"), "accountnumber");
        await h.select(selectWithOption(h, "startswith"), "startswith");
        await h.type(h.page.getByPlaceholder("text").first(), "ACC"); await h.wait(500);
        // sort on the account number — the order demo rows already come in, so the grid stays true
        const order = h.page.locator("select >> visible=true").filter({ has: h.page.locator('option:text-is("(none)")') }).last();   // the ORDER select (a condition's field select has "(none)" too)
        await h.select(order, "accountnumber");
        await h.click(btn(h, /Execute/)); await h.wait(800);
        await h.click(btn(h, /Save as view$/)); await h.wait(1300);   // the name is prefilled: "Account (Colvio)"
        await h.click(btn(h, /^Save view$/)); await h.wait(1800);
      } },
    { key: "saved-update",
      en: ["9 · Update a saved query in one click", "⭐ saves the query. Loaded, its name shows next to 💾 Update, which overwrites it with the current query — the saved list marks it as loaded."],
      fr: ["9 · Mettre à jour une requête en un clic", "⭐ enregistre la requête. Chargée, son nom s'affiche à côté de 💾 Update, qui l'écrase avec la requête actuelle — la liste la marque comme chargée."],
      run: async (h) => {
        await h.click(btn(h, /^Close$/)); await h.wait(400);
        await h.click(btn(h, /^⭐$/)); await h.wait(600);
        await h.type(h.page.getByPlaceholder("My query..."), "Key accounts"); await h.wait(400);
        await h.click(h.page.getByRole("button", { name: "Save", exact: true }).last()); await h.wait(1000);
        const v = h.page.getByPlaceholder("text").first();
        await h.click(v); await v.press("End"); await v.pressSequentially("-00", { delay: 140 }); await h.wait(600);
        await h.click(btn(h, /💾 Update/)); await h.wait(900);
        await h.click(btn(h, /^📂/)); await h.wait(1600);
      } },
  ],
};
