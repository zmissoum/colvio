// Deep dive — Data Loader › N:N tables loaded by association (and the mapping that follows the
// table). Every action below was checked against demo mode (make-deep --probe). The demo org
// (src/associationDemo.js) knows the teammembership relationship (systemuser ⟷ team), six users
// with their email and three teams, and two memberships that already exist (Marie in Sales
// Managers, Sophie in Key Accounts): the file's emails and team names are resolved against them,
// and the run reports those two pairs as "already linked" — through the live path's own outcome
// rules. Its state lives for the page load, so the rollback really removes what the run added.
const btn = (h, re) => h.page.locator("button >> visible=true").filter({ hasText: re }).first();
const mapRow = (h, csv) => h.page.locator("tr >> visible=true").filter({ has: h.page.locator(`td span:text-is("${csv}")`) }).first();
const picker = (h) => h.page.getByPlaceholder("Type to search entities…");
// "Load data" is also the sidebar entry's subtitle: the wizard's button is the last one.
const loadData = (h) => h.page.locator("button >> visible=true").filter({ hasText: /Load data$/ }).last();
// an end's "The column holds" picker, found by one of its options
const holds = (h, option) => h.page.locator("select >> visible=true").filter({ has: h.page.locator(`option[value="${option}"]`) }).first();

// A user (email) and a team (name) per row: row 5 has no team, row 6 repeats row 3 (in other case).
const PAIRS = [
  ["user", "team"],
  ["marie@contoso.com", "Sales Managers"],
  ["alex@contoso.com", "Sales Managers"],
  ["sophie@contoso.com", "Key Accounts"],
  ["lucas@contoso.com", ""],
  ["alex@contoso.com", "sales managers"],
  ["lucas@contoso.com", "Support Tier 2"],
  ["marie@contoso.com", "Key Accounts"],
].map(r => r.join("\t")).join("\n");

// An "Export to Excel" of accounts, pasted: display-name headers and the export's hidden columns.
const EXPORT = [
  ["(Do Not Modify) Account", "(Do Not Modify) Row Checksum", "(Do Not Modify) Modified On", "Account Name", "Account Number", "Main Phone", "Email", "City", "Industry", "Status", "Primary Contact"],
  ["a1b2c3d4-e5f6-7890-abcd-ef1234567890", "Kq3vT0x1+9ZbYw==", "2025-12-01 09:15", "ACME France", "ACC-001", "+33 1 42 68 53 00", "info@acme.fr", "Paris", "Manufacturing", "Active", "Jean Dupont"],
  ["b2c3d4e5-f6a7-8901-bcde-f12345678901", "Lr4wU1y2+0AcZx==", "2026-01-15 16:45", "Globex GmbH", "ACC-002", "+49 30 1234567", "contact@globex.de", "Berlin", "Technology", "Active", "Marie Martin"],
  ["c3d4e5f6-a7b8-9012-cdef-123456789012", "Ms5xV2z3+1BdAy==", "2026-02-20 11:30", "Wayne Enterprises", "ACC-003", "+1 415 555 1234", "info@wayne.com", "Gotham", "Consulting", "Active", "Pierre Bernard"],
].map(r => r.join("\t")).join("\n");

export default {
  key: "association",
  label: "Data Loader · N:N tables",
  tagline: {
    en: "Load teammembership and every many-to-many table: each row associates two records — checked first, with a way back",
    fr: "Chargez teammembership et toute table N:N : chaque ligne associe deux enregistrements — vérifié d'abord, avec retour arrière",
  },
  chapters: [
    { key: "paste",
      en: ["1 · Paste the pairs", "Two columns from Excel: a user's email and a team's name per row — one row has no team, and one pair appears twice."],
      fr: ["1 · Coller les paires", "Deux colonnes depuis Excel : l'email d'un utilisateur et le nom d'une équipe par ligne — une ligne n'a pas d'équipe, une paire apparaît deux fois."],
      run: async (h) => {
        await h.open("Data Loader");
        await h.click(btn(h, /Paste from Excel/)); await h.wait(600);
        const ta = h.page.locator("textarea >> visible=true").first();
        await h.click(ta); await ta.fill(PAIRS); await h.wait(2600);
      } },
    { key: "pick-nn",
      en: ["2 · Pick the N:N table", "The many-to-many tables are in the target list, badged N:N — Team Membership links users and teams."],
      fr: ["2 · Choisir la table N:N", "Les tables plusieurs-à-plusieurs sont dans la liste des cibles, avec le badge N:N — Team Membership relie utilisateurs et équipes."],
      run: async (h) => {
        await h.click(loadData(h)); await h.wait(1000);
        await h.type(picker(h), "team"); await h.wait(900);
        await h.hover(h.page.locator("button >> visible=true").filter({ hasText: "Team Membership" }).first()); await h.wait(1600);
      } },
    { key: "explain",
      en: ["3 · Records associated, not rows created", "Its rows aren't created: each file row associates one user with one team. A link that already exists counts as \"already\", never as an error."],
      fr: ["3 · Des enregistrements associés, pas des lignes créées", "Ses lignes ne se créent pas : chaque ligne du fichier associe un utilisateur à une équipe. Un lien déjà présent compte comme « already », jamais comme une erreur."],
      run: async (h) => {
        await h.click(h.page.locator("button >> visible=true").filter({ hasText: "Team Membership" }).first()); await h.wait(1200);
        await h.hover(h.page.getByText("N:N table", { exact: true }).first()); await h.wait(2600);
      } },
    { key: "ends",
      en: ["4 · One column per end", "The file's columns pair themselves with each end — user → systemuser, team → team. They hold no GUIDs, so each end asks what its column holds."],
      fr: ["4 · Une colonne par extrémité", "Les colonnes du fichier s'associent seules à chaque extrémité — user → systemuser, team → team. Elles ne contiennent pas de GUID : chaque extrémité demande ce que sa colonne contient."],
      run: async (h) => {
        await h.hover(h.page.getByText("End 1 —").first()); await h.wait(1300);
        await h.hover(h.page.getByText("End 2 —").first()); await h.wait(1300);
        await h.hover(holds(h, "internalemailaddress")); await h.wait(1200);
      } },
    { key: "match-by",
      en: ["5 · Matched by email and by name", "Users by their Primary Email, teams by their Team Name: Colvio looks every value up — and a value that matches two records is reported, never picked at random."],
      fr: ["5 · Rapprochés par email et par nom", "Les utilisateurs par leur Primary Email, les équipes par leur Team Name : Colvio cherche chaque valeur — et une valeur qui correspond à deux enregistrements est signalée, jamais choisie au hasard."],
      run: async (h) => {
        await h.select(holds(h, "internalemailaddress"), "internalemailaddress"); await h.wait(900);
        await h.select(holds(h, "name"), "name"); await h.wait(1300);
        await h.hover(h.page.locator("label >> visible=true").filter({ hasText: "ASSOCIATE (add the link)" }).first()); await h.wait(1000);
      } },
    { key: "dry-run", pos: "top",
      en: ["6 · Dry run", "Every value looked up, every pair checked, nothing written: 5 would be associated — the row without a team and the repeated pair are skipped, each with its reason."],
      fr: ["6 · Simulation", "Chaque valeur cherchée, chaque paire vérifiée, rien n'est écrit : 5 seraient associées — la ligne sans équipe et la paire répétée sont ignorées, chacune avec sa raison."],
      run: async (h) => {
        await h.click(btn(h, /Dry run$/)); await h.wait(1300);
        await h.hover(h.page.getByText("Empty team").first()); await h.wait(1300);
        await h.hover(h.page.getByText(/duplicate of row/).first()); await h.wait(1600);
      } },
    { key: "associate", pos: "top",
      en: ["7 · Associate", "Then the real run, in batches: 3 associated, 2 already linked — Marie and Sophie were already in those teams, which counts as \"already\", not as an error. The log keeps every row."],
      fr: ["7 · Associer", "Puis le vrai chargement, par lots : 3 associées, 2 déjà liées — Marie et Sophie étaient déjà dans ces équipes, ce qui compte comme « already », pas comme une erreur. Le journal garde chaque ligne."],
      run: async (h) => {
        await h.click(btn(h, /🔗 Associate$/)); await h.wait(1500);
        await h.hover(h.page.getByText("✅ Done", { exact: true }).first()); await h.wait(1100);
        await h.hover(h.page.getByText(/^Already linked:/).first()); await h.wait(1300);
        await h.hover(h.page.locator("td >> visible=true").filter({ hasText: /^ASSOCIATED \(already\)$/ }).first()); await h.wait(1400);
      } },
    { key: "rollback", pos: "top",
      en: ["8 · A way back", "Rollback removes only the links this run added — 3, not the 2 that were already there — after a confirmation. The whole log exports to CSV."],
      fr: ["8 · Un retour arrière", "Le rollback ne retire que les liens ajoutés par ce chargement — 3, pas les 2 qui existaient déjà — après confirmation. Tout le journal s'exporte en CSV."],
      run: async (h) => {
        await h.confirmed(btn(h, /Rollback \(remove what was added\)/), 2200);
        await h.wait(800);
        await h.hover(h.page.getByText(/^Rollback: 3 removed/).first()); await h.wait(1500);
        await h.hover(btn(h, /Log \(CSV\)$/)); await h.wait(1100);
      } },
    { key: "fit",
      en: ["9 · Back to a normal table: how the file fits", "An Excel export of accounts read against Contact: 1 column fits — and Colvio recognises the export's table from its headers."],
      fr: ["9 · Retour à une table classique : l'adéquation du fichier", "Un export Excel de comptes lu contre Contact : 1 colonne correspond — et Colvio reconnaît la table de l'export à ses en-têtes."],
      run: async (h) => {
        await h.click(btn(h, /^← Back$/)); await h.wait(700);
        const ta = h.page.locator("textarea >> visible=true").first();
        await h.click(ta); await ta.fill(EXPORT); await h.wait(1300);
        await h.click(loadData(h)); await h.wait(900);
        await h.type(picker(h), "contact"); await h.wait(700);
        await h.click(h.page.locator('button:has(span:text-is("contact")) >> visible=true').first()); await h.wait(1000);
        await h.hover(h.page.getByText(/of 11 columns/).first()); await h.wait(1300);
        await h.hover(btn(h, /^switch to Account$/)); await h.wait(1200);
      } },
    { key: "follows", pos: "top",
      en: ["10 · The mapping follows the table", "One click to Account and every column is matched again: display names like \"Main Phone\", \"(Do Not Modify) Account\" as the record id, checksum and modified-on skipped."],
      fr: ["10 · Le mapping suit la table", "Un clic vers Account et chaque colonne est rapprochée à nouveau : noms d'affichage comme « Main Phone », « (Do Not Modify) Account » comme id de l'enregistrement, checksum et date de modification ignorés."],
      run: async (h) => {
        await h.click(btn(h, /^switch to Account$/)); await h.wait(1200);
        await h.hover(h.page.getByText(/of 11 columns/).first()); await h.wait(1300);
        await h.hover(mapRow(h, "Main Phone")); await h.wait(1100);
        await h.hover(mapRow(h, "(Do Not Modify) Account")); await h.wait(1300);
      } },
  ],
};
