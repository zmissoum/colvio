// Deep dive — Security Audit. Every action below was checked against demo mode (make-deep --probe).
// Demo note: running "Assign role" needs a live org (demo user lookups return nothing), so the
// panel is shown, not run.
const btn = (h, re) => h.page.locator("button >> visible=true").filter({ hasText: re }).first();
// Typed filter text would get the browser's red spell-check squiggles on film ("svc", "bruno"…):
// switch spell-check off page-wide (inherited by every input) — cosmetic, the app is untouched.
const noSpell = (h) => h.page.evaluate(() => { document.body.spellcheck = false; });
const selectWithOption = (h, value) => h.page.locator("select >> visible=true").filter({ has: h.page.locator(`option[value="${value}"]`) }).first();

export default {
  key: "security",
  label: "Security Audit",
  tagline: {
    en: "Every security role, privilege by privilege — and who really holds it, across the whole org",
    fr: "Chaque rôle de sécurité, privilège par privilège — et qui le détient vraiment, dans toute l'org",
  },
  chapters: [
    { key: "read-role",
      en: ["1 · Read a role", "Every security role, custom or managed. Open one: its Org-level grants and sensitive privileges are counted and flagged."],
      fr: ["1 · Lire un rôle", "Tous les rôles de sécurité, personnalisés ou managés. Ouvrez-en un : ses privilèges niveau Organisation et sensibles sont comptés et signalés."],
      run: async (h) => {
        await noSpell(h); await h.open("Security Audit"); await h.wait(900);
        await h.click(btn(h, /^Custom$/)); await h.wait(1400);
        await h.click(btn(h, /^All$/)); await h.wait(700);
        await h.click(btn(h, /^Sales Manager/)); await h.wait(2300);
      } },
    { key: "priv-filters",
      en: ["2 · Org-level and sensitive privileges", "One click narrows the list to Organization-depth grants, or to sensitive privileges: deletes, exports, user and role admin, customization."],
      fr: ["2 · Privilèges Organisation et sensibles", "Un clic ne garde que les privilèges niveau Organisation, ou les sensibles : suppressions, exports, gestion des utilisateurs et rôles, personnalisation."],
      run: async (h) => {
        await h.click(btn(h, /^Org-level \(\d+\)$/)); await h.wait(2200);
        await h.click(btn(h, /^Sensitive \(\d+\)$/)); await h.wait(1600);
        await h.hover(h.vis("Bulk Delete")); await h.wait(1500);
      } },
    { key: "matrix", pos: "top",
      en: ["3 · Matrix view, by table", "The role editor's grid: each table × the 8 access rights, depth drawn as a filling circle — plus the miscellaneous privileges."],
      fr: ["3 · Vue matrice, par table", "La grille de l'éditeur de rôles : chaque table × les 8 droits d'accès, la profondeur dessinée en cercle qui se remplit — plus les privilèges divers."],
      run: async (h) => {
        await h.click(btn(h, /^Matrix \(by table\)$/)); await h.wait(2000);
        await h.hover(h.page.locator("span[title='Delete: Organization'] >> visible=true").first()); await h.wait(1300);
        await h.hover(h.vis("Miscellaneous privileges (granted)")); await h.wait(2000);
      } },
    { key: "users",
      en: ["4 · Who holds the role", "Members across every business-unit copy of the role, with their BU. Filter by status, tick users to remove the role in bulk."],
      fr: ["4 · Qui détient le rôle", "Les membres de toutes les copies du rôle par business unit, avec leur BU. Filtrez par statut, cochez des utilisateurs pour retirer le rôle en masse."],
      run: async (h) => {
        await h.click(btn(h, /^Users \(\d+\)$/)); await h.wait(1900);
        await h.click(btn(h, /^Disabled$/)); await h.wait(1300);
        const box = h.page.locator("input[type=checkbox] >> visible=true").nth(1); // [0] = select-all header
        await h.click(box); await h.wait(600);
        await h.hover(btn(h, /Remove role \(1\)$/)); await h.wait(1600);
        await h.click(box); await h.wait(500);                 // untick — nothing is removed on film
        // status toggle "All" — the LAST visible "All" (the first one is the role-list chip)
        await h.click(h.page.locator("button >> visible=true").filter({ hasText: /^All$/ }).last()); await h.wait(700);
      } },
    { key: "assign",
      en: ["5 · Assign by pasting emails", "Paste emails or domain logins: Colvio matches each user and assigns the role copy from their own business unit."],
      fr: ["5 · Attribuer en collant des e-mails", "Collez des e-mails ou des logins de domaine : Colvio retrouve chaque utilisateur et attribue la copie du rôle de sa propre business unit."],
      run: async (h) => {
        await h.click(btn(h, /Assign users$/)); await h.wait(1000);
        const ta = h.page.getByPlaceholder(/alice@contoso\.com/).first();
        await h.click(ta);
        await ta.pressSequentially("jane.doe@contoso.com\njohn.smith@contoso.com", { delay: 45 }); await h.wait(700);
        await h.hover(btn(h, /^Assign role$/)); await h.wait(1800);
      } },
    { key: "teams",
      en: ["6 · Teams carrying the role", "Teams that hold the role: their members inherit it, yet it never shows on the user. With type, BU, administrator, member count."],
      fr: ["6 · Les équipes qui portent le rôle", "Les équipes qui détiennent le rôle : leurs membres en héritent sans qu'il apparaisse sur l'utilisateur. Type, BU, administrateur, membres."],
      run: async (h) => {
        await h.click(btn(h, /^Teams \(\d+\)$/)); await h.wait(2000);
        await h.hover(h.vis("Sales EU Team")); await h.wait(1200);
        await h.hover(h.vis("Support AAD Group")); await h.wait(1800);
      } },
    { key: "org-wide",
      en: ["7 · Org-wide: who can do what", "Every role at once: who can Delete at Organization depth? Change the right or the minimum depth — one scan, instant filters."],
      fr: ["7 · Vue org : qui peut faire quoi", "Tous les rôles d'un coup : qui peut supprimer au niveau Organisation ? Changez le droit ou la profondeur minimale — un seul scan, filtres instantanés."],
      run: async (h) => {
        await h.click(h.page.getByRole("button", { name: /Org-wide view/ })); await h.wait(2400);
        await h.select(selectWithOption(h, "Delete"), "Write"); await h.wait(1300);
        await h.select(selectWithOption(h, "8"), "2"); await h.wait(2000);
      } },
    { key: "by-entity",
      en: ["8 · Flip it by table", "Group by entity: for each table, the roles holding that right and at which depth — filter by role or table, export to CSV or Excel."],
      fr: ["8 · Inverser par table", "Groupez par entité : pour chaque table, les rôles qui détiennent ce droit et à quelle profondeur — filtrez par rôle ou table, export CSV ou Excel."],
      run: async (h) => {
        await h.click(h.page.getByRole("button", { name: "By entity", exact: true })); await h.wait(1900);
        await h.type(h.page.getByPlaceholder("Filter by role or entity…"), "account"); await h.wait(1600);
        await h.hover(btn(h, /Excel$/)); await h.wait(1200);
      } },
  ],
};
