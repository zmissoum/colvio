// Deep dive — Solutions. Every action below was checked against demo mode (make-deep --probe).
const btn = (h, re) => h.page.locator("button >> visible=true").filter({ hasText: re }).first();
const solSearch = (h) => h.page.locator('input[placeholder="Search..."] >> visible=true').first();
const compareSelect = (h) => h.page.locator("select >> visible=true").filter({ has: h.page.locator("option", { hasText: "Compare with" }) }).first();

// A compare file as Colvio's "Compare file" button writes it on another org (format
// colvio-solution-components@1): the same ColvioDemo solution, one version behind on "PROD".
// Transported components (views, chart, plug-in assembly) keep their GUID; metadata components
// (tables, columns, option sets) get new MetadataIds on import and are matched by type + name.
const PROD_FILE = {
  format: "colvio-solution-components@1",
  exportedAt: "2026-09-28T16:20:00Z",
  org: "contoso-prod.crm4.dynamics.com",
  solution: { uniqueName: "ColvioDemo", displayName: "Colvio Demo Solution", version: "0.9.0.0", isManaged: true },
  components: [
    { type: 1, objectId: "9f01a2b3-0001", name: "Account" },
    { type: 1, objectId: "9f01a2b3-0002", name: "Contact" },
    { type: 2, objectId: "9f02a2b3-0001", name: "name (Account)" },
    { type: 2, objectId: "9f02a2b3-0002", name: "emailaddress1 (Contact)" },
    { type: 2, objectId: "9f02a2b3-0009", name: "fax (Account)" },
    { type: 9, objectId: "9f03a2b3-0001", name: "industrycode" },
    { type: 26, objectId: "d1d2d3d4-0001", name: "Active Accounts" },
    { type: 26, objectId: "d1d2d3d4-0002", name: "My Active Contacts" },
    { type: 60, objectId: "e1e2e3e4-0001", name: "new_custom_script.js" },
    { type: 10, objectId: "9f04a2b3-0001", name: "account_parent_account (1:N)" },
    { type: 59, objectId: "g1g2g3g4-0001", name: "Accounts by Industry" },
    { type: 91, objectId: "h1h2h3h4-0001", name: "ColvioDemo.Plugins.AccountPlugin" },
  ],
};

export default {
  key: "solutions",
  label: "Solutions",
  tagline: {
    en: "What's inside every solution — and how two of them differ, even across orgs",
    fr: "Le contenu de chaque solution — et ce qui diffère entre deux d'entre elles, même d'une org à l'autre",
  },
  chapters: [
    { key: "browse",
      en: ["1 · Browse every solution", "Managed and unmanaged solutions with their version and component count — filter by type or search by name."],
      fr: ["1 · Parcourir les solutions", "Solutions managed et unmanaged avec leur version et leur nombre de composants — filtrez par type ou cherchez par nom."],
      run: async (h) => {
        await h.open("Solutions");
        await h.wait(900);
        await h.click(btn(h, /^Managed \(\d+\)$/)); await h.wait(1500);
        await h.click(btn(h, /^Unmanaged \(\d+\)$/)); await h.wait(1500);
        await h.click(btn(h, /^All \(\d+\)$/)); await h.wait(500);
        await h.type(solSearch(h), "sales"); await h.wait(2000);
      } },
    { key: "components",
      en: ["2 · What's inside", "Pick a solution: its components grouped by type — tables, columns, option sets, views, charts, plug-in assemblies. Fold any group."],
      fr: ["2 · Ce qu'elle contient", "Choisissez une solution : ses composants par type — tables, colonnes, option sets, vues, graphiques, assemblies de plug-ins. Chaque groupe se replie."],
      run: async (h) => {
        await solSearch(h).fill(""); await h.wait(700);
        await h.click(h.vis("Colvio Demo Solution")); await h.wait(2200);
        await h.click(btn(h, /Attribute\s*4/)); await h.wait(900);
        await h.click(btn(h, /Entity\s*3/)); await h.wait(900);
        await h.click(btn(h, /OptionSet\s*2/)); await h.wait(1800);
      } },
    { key: "export",
      en: ["3 · The deployment checklist", "Export the full component list to CSV or Excel — type, name and id of everything the solution ships."],
      fr: ["3 · La checklist de déploiement", "Exportez la liste complète des composants en CSV ou Excel — type, nom et id de tout ce que la solution embarque."],
      run: async (h) => {
        await h.hover(h.page.getByRole("button", { name: /CSV$/ }).first()); await h.wait(1300);
        await h.hover(h.page.getByRole("button", { name: /Excel$/ }).first()); await h.wait(1700);
      } },
    { key: "compare",
      en: ["4 · Compare two solutions", "Pick another solution of the org: components split into only here, in both, only there — each bucket grouped by type and exportable."],
      fr: ["4 · Comparer deux solutions", "Choisissez une autre solution de l'org : composants uniquement ici, dans les deux, uniquement là-bas — groupés par type et exportables."],
      run: async (h) => {
        await h.select(compareSelect(h), { label: "Dynamics 365 Sales Enterprise (managed)" }); await h.wait(2400);
        await h.hover(h.page.getByText("In both", { exact: true })); await h.wait(1300);
        await h.hover(h.page.getByRole("button", { name: /CSV$/ }).first()); await h.wait(1500);
      } },
    { key: "cross-org",
      en: ["5 · Compare across orgs", "Export a compare file on one org, load it on another: DEV vs PROD drift, matched by GUID or by type + name."],
      fr: ["5 · Comparer entre deux orgs", "Exportez un fichier de comparaison sur une org, chargez-le sur une autre : l'écart DEV / PROD, rapproché par GUID ou par type + nom."],
      run: async (h) => {
        await h.select(compareSelect(h), ""); await h.wait(900);  // first entry closes the compare
        await h.hover(btn(h, /Compare file$/)); await h.wait(1400);
        const [chooser] = await Promise.all([
          h.page.waitForEvent("filechooser"),
          h.click(btn(h, /Load file$/)),
        ]);
        await chooser.setFiles({ name: "colvio_compare_ColvioDemo.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(PROD_FILE)) });
        await h.wait(1200);
        await h.hover(h.page.getByText(/^Same solution, different versions/)); await h.wait(1400);
        await h.hover(h.page.getByText(/^Cross-org matching:/)); await h.wait(1800);
      } },
    { key: "drift", pos: "top",
      en: ["6 · Read the drift", "Each side's extras, type by type: what this org has that the file lacks, and what only the other org still carries — all exportable."],
      fr: ["6 · Lire l'écart", "Les écarts de chaque côté, type par type : ce que cette org a et pas le fichier, et ce que seule l'autre org porte encore — le tout exportable."],
      run: async (h) => {
        await h.hover(h.page.getByRole("button", { name: /Excel$/ }).first()); await h.wait(1100);
        await h.scroll(450); await h.wait(1800);
        await h.scroll(900); await h.wait(2000);
      } },
  ],
};
