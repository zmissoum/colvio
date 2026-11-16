// Deep dive — Data Loader › N:N tables loaded by association (and the mapping that follows the
// table). Every action below was checked against demo mode (make-deep --probe). The demo org knows
// the teammembership relationship (systemuser ⟷ team) and answers every association as done, so the
// file uses GUIDs (a value matched through a text column has no demo records to resolve against).
const btn = (h, re) => h.page.locator("button >> visible=true").filter({ hasText: re }).first();
const mapRow = (h, csv) => h.page.locator("tr >> visible=true").filter({ has: h.page.locator(`td span:text-is("${csv}")`) }).first();
const picker = (h) => h.page.getByPlaceholder("Type to search entities…");
// "Load data" is also the sidebar entry's subtitle: the wizard's button is the last one.
const loadData = (h) => h.page.locator("button >> visible=true").filter({ hasText: /Load data$/ }).last();

const U = ["6f1c2a10-3b4d-4e5f-8a91-0c2d3e4f5a61", "7a2d3b21-4c5e-4f60-9ba2-1d3e4f5a6b72", "8b3e4c32-5d6f-4071-8cb3-2e4f5a6b7c83", "9c4f5d43-6e70-4182-9dc4-3f5a6b7c8d94"];
const T = ["1e2f3a4b-5c6d-4e7f-8091-a2b3c4d5e6f1", "2f3a4b5c-6d7e-4f80-91a2-b3c4d5e6f7a2"];
// A user and a team per row: row 5 has no team, row 6 repeats row 3.
const PAIRS = [
  ["user", "team"],
  [U[0], T[0]],
  [U[1], T[0]],
  [U[2], T[1]],
  [U[3], ""],
  [U[1], T[0]],
  [U[3], T[1]],
  [U[0], T[1]],
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
      en: ["1 · Paste the pairs", "Two columns from Excel: a user and a team per row, as GUIDs — one row has no team, and one pair appears twice."],
      fr: ["1 · Coller les paires", "Deux colonnes depuis Excel : un utilisateur et une équipe par ligne, en GUID — une ligne n'a pas d'équipe, une paire apparaît deux fois."],
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
      en: ["4 · One column per end", "The file's columns pair themselves with each end — user → systemuser, team → team — holding a GUID, or a value resolved through a text column."],
      fr: ["4 · Une colonne par extrémité", "Les colonnes du fichier s'associent seules à chaque extrémité — user → systemuser, team → team — avec un GUID, ou une valeur résolue par une colonne texte."],
      run: async (h) => {
        await h.hover(h.page.getByText("End 1 —").first()); await h.wait(1300);
        await h.hover(h.page.getByText("End 2 —").first()); await h.wait(1300);
        await h.hover(h.page.locator("label >> visible=true").filter({ hasText: "ASSOCIATE (add the link)" }).first()); await h.wait(1200);
      } },
    { key: "dry-run", pos: "top",
      en: ["5 · Dry run", "Every pair checked, nothing written: 5 would be associated — the row without a team and the repeated pair are skipped, each with its reason."],
      fr: ["5 · Simulation", "Chaque paire vérifiée, rien n'est écrit : 5 seraient associées — la ligne sans équipe et la paire répétée sont ignorées, chacune avec sa raison."],
      run: async (h) => {
        await h.click(btn(h, /Dry run$/)); await h.wait(1300);
        await h.hover(h.page.getByText("Empty team").first()); await h.wait(1300);
        await h.hover(h.page.getByText(/duplicate of row/).first()); await h.wait(1600);
      } },
    { key: "associate", pos: "top",
      en: ["6 · Associate", "Then the real run, in batches: the result card counts associated, already linked, skipped and errors — and the log keeps every row."],
      fr: ["6 · Associer", "Puis le vrai chargement, par lots : la carte de résultat compte associées, déjà liées, ignorées et erreurs — et le journal garde chaque ligne."],
      run: async (h) => {
        await h.click(btn(h, /🔗 Associate$/)); await h.wait(1500);
        await h.hover(h.page.getByText("✅ Done", { exact: true }).first()); await h.wait(1300);
        await h.hover(h.page.getByText("ASSOCIATED", { exact: true }).first()); await h.wait(1300);
      } },
    { key: "rollback", pos: "top",
      en: ["7 · A way back", "Rollback removes only the links this run added. The whole log exports to CSV."],
      fr: ["7 · Un retour arrière", "Le rollback ne retire que les liens ajoutés par ce chargement. Tout le journal s'exporte en CSV."],
      run: async (h) => {
        await h.hover(btn(h, /Rollback \(remove what was added\)/)); await h.wait(1800);
        await h.hover(btn(h, /Log \(CSV\)$/)); await h.wait(1300);
      } },
    { key: "fit",
      en: ["8 · Back to a normal table: how the file fits", "An Excel export of accounts read against Contact: 1 column fits — and Colvio recognises the export's table from its headers."],
      fr: ["8 · Retour à une table classique : l'adéquation du fichier", "Un export Excel de comptes lu contre Contact : 1 colonne correspond — et Colvio reconnaît la table de l'export à ses en-têtes."],
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
      en: ["9 · The mapping follows the table", "One click to Account and every column is matched again: display names like \"Main Phone\", \"(Do Not Modify) Account\" as the record id, checksum and modified-on skipped."],
      fr: ["9 · Le mapping suit la table", "Un clic vers Account et chaque colonne est rapprochée à nouveau : noms d'affichage comme « Main Phone », « (Do Not Modify) Account » comme id de l'enregistrement, checksum et date de modification ignorés."],
      run: async (h) => {
        await h.click(btn(h, /^switch to Account$/)); await h.wait(1200);
        await h.hover(h.page.getByText(/of 11 columns/).first()); await h.wait(1300);
        await h.hover(mapRow(h, "Main Phone")); await h.wait(1100);
        await h.hover(mapRow(h, "(Do Not Modify) Account")); await h.wait(1300);
      } },
  ],
};
