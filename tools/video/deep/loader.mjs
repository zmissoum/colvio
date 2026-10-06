// Deep dive — Data Loader. Every action below was checked against demo mode (make-deep --probe).
// The demo run goes through the real engine against the demo org's accounts (ACC-001…ACC-006):
// ACC-001 is identical to the org (delta skips it), ACC-002…004 change, ACC-101…108 are new.
const btn = (h, re) => h.page.locator("button >> visible=true").filter({ hasText: re }).first();
const centred = async (h, loc) => { await loc.evaluate(e => e.scrollIntoView({ block: "center" })); await h.wait(300); return loc; };
// The wizard's action buttons end the page, under the floating ? / FR / Light buttons, and the page
// can't scroll further: point at the button's uncovered top edge and fire its click directly.
const bottomClick = async (h, loc) => {
  await loc.scrollIntoViewIfNeeded();
  const b = await loc.boundingBox();
  const x = b.x + b.width / 2, y = b.y + Math.min(6, b.height / 2);
  await h.page.evaluate(([x, y]) => window.__cv.cursor(x, y), [x, y]); await h.wait(650);
  await h.page.evaluate(([x, y]) => window.__cv.ripple(x, y), [x, y]);
  await loc.dispatchEvent("click"); await h.wait(500);
};
const mapRow = (h, csv) => h.page.locator("tr >> visible=true").filter({ has: h.page.locator(`td span:text-is("${csv}")`) }).first();

// What a sales-ops export pasted from Excel looks like: tab-separated, a header row.
const TSV = [
  ["accountnumber", "name", "Phone", "Email", "address1_city", "address1_country", "Industry", "statecode", "description"],
  ["ACC-002", "Globex GmbH", "+49 30 7654321", "contact@globex.de", "Berlin", "Germany", "Technology", "Active", "<p>Renewal due in <b>Q3</b></p>"],
  ["ACC-001", "ACME France", "+33 1 42 68 53 00", "info@acme.fr", "Paris", "France", "Manufacturing", "Active", ""],
  ["ACC-003", "Wayne Enterprises", "+1 415 555 1234", "contact@wayne.com", "Gotham", "United States", "Consulting", "Active", ""],
  ["ACC-004", "Stark Industries", "+1 212 555 9876", "hello@stark.com", "New York", "United States", "Technology", "Inactive", "<p>Merged into <b>Stark Group</b></p>"],
  ["ACC-101", "Contoso Ltd", "+44 20 7946 0101", "info@contoso.com", "London", "United Kingdom", "Technology", "Active", "<p>Met at the <b>Paris</b> trade show</p>"],
  ["ACC-102", "Fabrikam Inc", "+1 425 555 0102", "sales@fabrikam.com", "Seattle", "United States", "Manufacturing", "Active", ""],
  ["ACC-103", "Northwind Traders", "+33 1 99 00 01 03", "contact@northwindtraders.com", "Lyon", "France", "Retail", "Active", ""],
  ["ACC-104", "Tailspin Toys", "+44 161 496 0104", "hello@tailspintoys.com", "Manchester", "United Kingdom", "Retail", "Active", "<ul><li>Toys</li><li>Games</li></ul>"],
  ["ACC-105", "Adventure Works", "+1 303 555 0105", "info@adventure-works.com", "Denver", "United States", "Manufacturing", "Active", ""],
  ["ACC-106", "Litware Inc", "+1 617 555 0106", "contact@litwareinc.com", "Boston", "United States", "Technology", "Active", ""],
  ["ACC-107", "Woodgrove Bank", "+33 1 99 00 01 07", "info@woodgrovebank.com", "Paris", "France", "Finance", "Active", ""],
  ["ACC-108", "Alpine Ski House", "+44 117 496 0108", "info@alpineskihouse.com", "Bristol", "United Kingdom", "Leisure", "Active", ""],
].map(r => r.join("\t")).join("\n");

export default {
  key: "loader",
  label: "Data Loader",
  tagline: {
    en: "Paste a spreadsheet, map it, check it — then load it into Dataverse row by row, with a way back",
    fr: "Collez un tableur, mappez-le, vérifiez-le — puis chargez-le dans Dataverse ligne par ligne, avec retour arrière",
  },
  chapters: [
    { key: "paste",
      en: ["1 · Paste from Excel", "Copy the rows in Excel and paste them: the tab delimiter is detected, and the 12 rows arrive with their column headers."],
      fr: ["1 · Coller depuis Excel", "Copiez les lignes dans Excel et collez-les : le séparateur tabulation est détecté, les 12 lignes arrivent avec leurs en-têtes de colonnes."],
      run: async (h) => {
        await h.open("Data Loader");
        await h.click(btn(h, /Paste from Excel/)); await h.wait(700);
        const ta = h.page.locator("textarea >> visible=true").first();
        await h.click(ta); await ta.fill(TSV); await h.wait(1800);
        // exact role name: the sidebar entry reads "Data Loader / Load data" too
        await h.click(h.page.getByRole("button", { name: "Load data", exact: true })); await h.wait(1600);
      } },
    { key: "mapping",
      en: ["2 · Target table and mapping", "Search the target table. Columns named after a field — or Phone, Email — map themselves; type the field name for the rest."],
      fr: ["2 · Table cible et mapping", "Cherchez la table cible. Les colonnes qui portent le nom d'un champ — ou Phone, Email — se mappent seules ; tapez le champ pour les autres."],
      run: async (h) => {
        const picker = h.page.getByPlaceholder("Type to search entities…");
        await h.type(picker, "acc"); await h.wait(900);
        await h.click(h.page.locator('button:has(span:text-is("account")) >> visible=true').first()); await h.wait(900);
        await h.hover(mapRow(h, "Phone")); await h.wait(900);
        await h.type(mapRow(h, "Industry").locator("input"), "industrycode"); await h.wait(1200);
      } },
    { key: "modes",
      en: ["3 · Four import modes", "UPDATE never creates, DELETE asks for a typed confirmation, UPSERT matches on the alternate key — and Delta skips rows that wouldn't change."],
      fr: ["3 · Quatre modes d'import", "UPDATE ne crée jamais, DELETE exige une confirmation saisie, l'upsert s'appuie sur la clé alternative — et le mode Delta ignore les lignes inchangées."],
      run: async (h) => {
        await h.click(h.page.locator("label >> visible=true").filter({ hasText: "UPDATE (existing only)" }).first()); await h.wait(1500);
        await h.click(h.page.locator("label >> visible=true").filter({ hasText: "DELETE (remove records)" }).first()); await h.wait(1500);
        await h.click(h.page.locator("label >> visible=true").filter({ hasText: "UPSERT (update or create)" }).first()); await h.wait(1200);
        await h.click(h.page.locator("label >> visible=true").filter({ hasText: "Delta mode" }).locator("input").first()); await h.wait(1300);
      } },
    { key: "preflight",
      en: ["4 · Checked before anything is sent", "A plain-language summary, the exact record that will be written, and pre-flight checks — here, an option set with no transform."],
      fr: ["4 · Vérifié avant tout envoi", "Un résumé en clair, l'enregistrement exact qui sera écrit, et les contrôles préalables — ici, un groupe d'options sans transformation."],
      run: async (h) => {
        await bottomClick(h, btn(h, /^Preview →$/)); await h.wait(1300);
        await h.hover(h.page.getByText("Pre-flight checks", { exact: false }).first()); await h.wait(1600);
        await h.hover(h.page.getByText("D365 record example").first()); await h.wait(1200);
      } },
    { key: "transforms",
      en: ["5 · Transforms", "One transform per column: option-set labels to values, HTML to plain text. Back on the preview, the warning is gone."],
      fr: ["5 · Transformations", "Une transformation par colonne : libellés d'options en valeurs, HTML en texte brut. De retour sur l'aperçu, l'alerte a disparu."],
      run: async (h) => {
        await h.click(btn(h, /Mapping$/)); await h.wait(900);
        await h.select(mapRow(h, "Industry").locator("select"), "picklist"); await h.wait(500);
        await h.select(mapRow(h, "description").locator("select"), "strip_html"); await h.wait(700);
        await bottomClick(h, btn(h, /^Preview →$/)); await h.wait(1000);
        await h.hover(h.page.getByText("D365 record example").first()); await h.wait(1600);
      } },
    { key: "dry-run", pos: "top",
      en: ["6 · Dry run", "The whole import simulated, nothing written: 8 would be created, 4 updated — and one industry label matches no option."],
      fr: ["6 · Simulation", "Tout l'import simulé, rien n'est écrit : 8 seraient créés, 4 mis à jour — et un libellé de secteur ne correspond à aucune option."],
      run: async (h) => {
        await bottomClick(h, btn(h, /Dry run$/)); await h.wait(2600);
        await h.hover(h.page.getByText("Option-set labels that matched no value").first()); await h.wait(1300);
      } },
    { key: "run",
      en: ["7 · Load, row by row", "Set the batch size and parallel threads, then Load: each row lands in the live log as its batch returns."],
      fr: ["7 · Chargement ligne par ligne", "Réglez la taille des lots et les threads parallèles, puis Load : chaque ligne arrive dans le journal en direct au retour de son lot."],
      run: async (h) => {
        await h.click(btn(h, /Preview$/)); await h.wait(800);
        const size = await centred(h, h.page.locator('label:text-is("Batch size") ~ input >> visible=true').first());
        await h.click(size); await size.fill("3"); await h.wait(500);
        const thr = h.page.locator('label:text-is("Threads") ~ input >> visible=true').first();
        await h.click(thr); await thr.fill("2"); await h.wait(900);
        await bottomClick(h, btn(h, /Load$/)); await h.wait(4300);
      } },
    { key: "result", pos: "top",
      en: ["8 · Every row accounted for", "8 created, 3 updated, 1 skipped: delta found nothing to change in it. Click any row to see the exact request that was sent."],
      fr: ["8 · Chaque ligne justifiée", "8 créés, 3 mis à jour, 1 ignoré : le delta n'y trouvait rien à changer. Cliquez une ligne pour voir la requête exacte envoyée."],
      run: async (h) => {
        await h.hover(h.page.getByText("UNCHANGED", { exact: true }).first()); await h.wait(1300);
        await h.click(h.page.locator("tr >> visible=true").filter({ has: h.page.locator('span:text-is("UPSERTED")') }).first()); await h.wait(2000);
        await h.hover(btn(h, /Download Log$/)); await h.wait(900);
      } },
    { key: "rollback",
      en: ["9 · Rollback", "Type ROLLBACK and the records this run created are deleted again — the updated ones are left as they are."],
      fr: ["9 · Retour arrière", "Tapez ROLLBACK et les enregistrements créés par ce chargement sont supprimés — ceux mis à jour restent tels quels."],
      run: async (h) => {
        await h.type(h.page.getByPlaceholder('type "ROLLBACK"'), "ROLLBACK"); await h.wait(500);
        await h.click(btn(h, /Rollback created records$/)); await h.wait(3600);
      } },
  ],
};
