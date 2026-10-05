// Deep dive — Apps (model-driven app inventory). Every action below was checked against demo mode (make-deep --probe).
const btn = (h, re) => h.page.locator("button >> visible=true").filter({ hasText: re }).first();
const appBtn = (h, name) => h.page.locator("button >> visible=true").filter({ has: h.page.locator(`text="${name}"`) }).first();
const reverseBox = (h) => h.page.getByPlaceholder(/Reverse: find a form/);

export default {
  key: "apps",
  label: "Apps",
  tagline: {
    en: "What each model-driven app really exposes — tables, forms, views, commands",
    fr: "Ce que chaque model-driven app expose vraiment — tables, formulaires, vues, commandes",
  },
  chapters: [
    { key: "app-content",
      en: ["1 · Inside an app", "Pick an app: its tables, then the forms and views it shows — hand-picked (explicit) or brought in by include-all (implicit)."],
      fr: ["1 · Le contenu d'une app", "Choisissez une app : ses tables, puis les formulaires et vues affichés — choisis un par un (explicit) ou inclus via « tout inclure » (implicit)."],
      run: async (h) => {
        await h.open("Apps");
        await h.wait(800);
        await h.click(appBtn(h, "Sales Hub")); await h.wait(1600);
        await h.hover(h.page.getByText("1 FORM PICKED", { exact: true })); await h.wait(1200);
        await h.hover(h.page.getByText("ALL VIEWS", { exact: true })); await h.wait(1500);
      } },
    { key: "include-all",
      en: ["2 · Include-all, made visible", "This app hand-picked one view but includes ALL forms, current and future. The maker portal doesn't show it — Colvio infers it."],
      fr: ["2 · « Tout inclure », enfin visible", "Cette app a choisi une seule vue mais inclut TOUS les formulaires, actuels et futurs. Le maker portal ne le montre pas — Colvio le déduit."],
      run: async (h) => {
        await h.click(appBtn(h, "Customer Service Hub")); await h.wait(1500);
        await h.hover(h.page.getByText("ALL FORMS", { exact: true })); await h.wait(1300);
        await h.hover(h.page.getByText("1 VIEW PICKED", { exact: true })); await h.wait(1500);
      } },
    { key: "commands",
      en: ["3 · Modern commands", "The command-bar buttons the app surfaces — app-only, global to one table, or table-generic templates. Classic ribbon buttons aren't listed."],
      fr: ["3 · Les commandes modernes", "Les boutons de barre de commandes de l'app — propres à l'app, globaux à une table ou modèles génériques. Le ruban classique n'est pas listé."],
      run: async (h) => {
        await h.hover(h.page.getByText(/^MODERN COMMANDS/)); await h.wait(1000);
        await h.hover(h.page.locator("span >> visible=true").filter({ hasText: /^Send Email/ }).first()); await h.wait(1300);
        await h.hover(h.page.locator("span >> visible=true").filter({ hasText: /^NewIMPLICIT$/ }).first()); await h.wait(1500);
      } },
    { key: "subgrids",
      en: ["4 · A form's subgrids", "List a form's subgrids: the child table, the view each one renders and the relationship that links the rows to the record."],
      fr: ["4 · Les sous-grilles d'un formulaire", "Listez les sous-grilles d'un formulaire : la table enfant, la vue que chacune affiche et la relation qui relie les lignes à l'enregistrement."],
      run: async (h) => {
        await h.hover(h.vis("Account Main")); await h.wait(700);
        await h.click(btn(h, /subgrids$/)); await h.wait(1500);
        await h.hover(h.page.getByText("contact_customer_accounts", { exact: true })); await h.wait(1600);
      } },
    { key: "view-inspector",
      en: ["5 · Inspect a view", "Open the view: the filters a row must pass, the columns shown, the sort — the answer to \"why isn't my row in this subgrid?\"."],
      fr: ["5 · Inspecter une vue", "Ouvrez la vue : les filtres à passer, les colonnes affichées, le tri — la réponse à « pourquoi ma ligne n'est pas dans cette sous-grille ? »."],
      run: async (h) => {
        await h.click(h.page.getByTitle("Inspect this view's filters & columns").first()); await h.wait(1600);
        await h.hover(h.page.getByText("ALL of (AND)", { exact: true })); await h.wait(1200);
        await h.click(h.page.getByText("Raw FetchXML", { exact: true })); await h.wait(2000);
      } },
    { key: "reverse",
      en: ["6 · Reverse lens", "Type a form, view or command name: every app that exposes it, and whether explicitly or through include-all."],
      fr: ["6 · La recherche inversée", "Tapez le nom d'un formulaire, d'une vue ou d'une commande : chaque app qui l'expose, explicitement ou via « tout inclure »."],
      run: async (h) => {
        await h.press("Escape"); await h.wait(500);  // closes the view inspector
        const r = reverseBox(h);
        await h.type(r, "Account"); await h.wait(1800);
        await r.fill(""); await h.wait(300);
        await r.pressSequentially("Active", { delay: 90 }); await h.wait(1800);
      } },
    { key: "open-explorer",
      en: ["7 · Straight to the Data Explorer", "Open the view from the results, then \"Open in Explorer\": its FetchXML lands in the Data Explorer, ready to run or to add a test condition."],
      fr: ["7 · Direction le Data Explorer", "Ouvrez la vue depuis les résultats, puis « Open in Explorer » : son FetchXML arrive dans le Data Explorer, prêt à exécuter ou à compléter."],
      run: async (h) => {
        await h.click(h.page.getByTitle("Inspect this view's filters & columns").first()); await h.wait(1500);
        await h.click(h.page.getByRole("button", { name: /Open in Explorer/ })); await h.wait(1800);
        await h.hover(h.page.locator("textarea >> visible=true").first()); await h.wait(1000);
        await h.hover(h.page.getByRole("button", { name: /Execute/ }).first()); await h.wait(1500);
      } },
  ],
};
