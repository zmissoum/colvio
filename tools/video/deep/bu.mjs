// Deep dive — Business Units. Every action below was checked against demo mode (make-deep --probe).
// Demo note: the "Move users INTO this BU" org-wide search needs a live org (demo queries return
// nothing, every pasted address would come back "not found") — the paste-a-list + Move to BU flow
// below runs entirely on the loaded member list, so it is filmed instead.
const btn = (h, re) => h.page.locator("button >> visible=true").filter({ hasText: re }).first();
// Typed filter text would get the browser's red spell-check squiggles on film ("svc", "bruno"…):
// switch spell-check off page-wide (inherited by every input) — cosmetic, the app is untouched.
const noSpell = (h) => h.page.evaluate(() => { document.body.spellcheck = false; });
const selectWithOption = (h, value) => h.page.locator("select >> visible=true").filter({ has: h.page.locator(`option[value="${value}"]`) }).first();
const chartText = (h, re) => h.page.locator("svg text >> visible=true").filter({ hasText: re }).first();
// Tree rows: "└ Sales EU" + count badge; the root row has no "└ " prefix.
const treeRow = (h, name) => btn(h, new RegExp(`^(└ )?${name}\\s*\\d+$`));

export default {
  key: "bu",
  label: "Business Units",
  tagline: {
    en: "The BU hierarchy and its members — as a tree or an org chart, with bulk moves between BUs",
    fr: "La hiérarchie des business units et leurs membres — en arbre ou en organigramme, avec déplacements en masse",
  },
  chapters: [
    { key: "tree",
      en: ["1 · The BU tree, with member counts", "The whole hierarchy with each BU's direct user count. Search it, or keep only the active or disabled business units."],
      fr: ["1 · L'arbre des business units", "Toute la hiérarchie avec le nombre d'utilisateurs directs de chaque BU. Recherchez-y, ou ne gardez que les business units actives ou désactivées."],
      run: async (h) => {
        await noSpell(h); await h.open("Business Units"); await h.wait(1600);
        const s = h.page.getByPlaceholder("Search a business unit…");
        await h.type(s, "Sales"); await h.wait(1800);
        await s.fill(""); await h.wait(900);
        await h.hover(btn(h, /^Active \(\d+\)$/)); await h.wait(900);
      } },
    { key: "open-bu",
      en: ["2 · Open a business unit", "Direct members, the total including sub-BUs and the parent BU — export this BU alone, or with its whole subtree."],
      fr: ["2 · Ouvrir une business unit", "Membres directs, total sous-BU comprises et BU parente — exportez cette BU seule, ou avec toute sa sous-arborescence."],
      run: async (h) => {
        await h.click(treeRow(h, "Sales EU")); await h.wait(2000);
        await h.click(treeRow(h, "Contoso")); await h.wait(1500);
        await h.hover(btn(h, /\+ sub-BUs \(\d+\)$/)); await h.wait(900);
        await h.hover(btn(h, /Excel \+ sub-BUs$/)); await h.wait(1300);
      } },
    { key: "org-chart",
      en: ["3 · Org chart", "The hierarchy as a real organigram: unfold branches with the +N chips, zoom, export it as PNG — click a box to open that BU."],
      fr: ["3 · Organigramme", "La hiérarchie en vrai organigramme : dépliez les branches avec les pastilles +N, zoomez, exportez en PNG — cliquez une case pour ouvrir la BU."],
      run: async (h) => {
        await h.click(h.page.getByRole("button", { name: /Org chart/ })); await h.wait(1600);
        await h.click(chartText(h, /^\+1$/)); await h.wait(1500);
        // "+" twice (140 %) rather than Fit (200 % on 4 BUs — the bottom row would sit under the caption)
        const zoomIn = btn(h, /^\+$/);
        await h.click(zoomIn); await h.wait(500); await h.click(zoomIn); await h.wait(1600);
        await h.hover(btn(h, /PNG$/)); await h.wait(900);
        await h.click(chartText(h, /^Sales US$/)); await h.wait(1800);
      } },
    { key: "members-filter",
      en: ["4 · Filter the members", "Each user's access mode and license (CAL) type. Filter by status — disabled accounts stand out — or by name, email or title."],
      fr: ["4 · Filtrer les membres", "Mode d'accès et type de licence (CAL) de chaque utilisateur. Filtrez par statut — les comptes désactivés ressortent — ou par nom, e-mail ou fonction."],
      run: async (h) => {
        await h.click(btn(h, /^Disabled$/)); await h.wait(1600);
        await h.click(btn(h, /^All$/)); await h.wait(500);
        await h.click(treeRow(h, "Contoso")); await h.wait(1200);
        await h.type(h.page.getByPlaceholder("Filter users…"), "svc"); await h.wait(1900);
      } },
    { key: "paste-emails",
      en: ["5 · Select by pasting a list", "Paste emails or UPNs in any format, Outlook's included: every match gets ticked, and anyone not in this BU is listed."],
      fr: ["5 · Sélectionner en collant une liste", "Collez des e-mails ou UPN dans n'importe quel format, Outlook compris : chaque correspondance est cochée, les absents de cette BU sont listés."],
      run: async (h) => {
        await h.page.getByPlaceholder("Filter users…").fill(""); await h.wait(600);
        await h.click(h.page.getByRole("button", { name: /Paste emails/ })); await h.wait(700);
        const ta = h.page.getByPlaceholder(/jane\.doe@contoso\.com/).first();
        await h.click(ta);
        await ta.pressSequentially("Alice Martin <alice@contoso.com>; bruno@contoso.com", { delay: 45 }); await h.wait(700);
        await h.click(h.page.getByRole("button", { name: "Match & select", exact: true })); await h.wait(2400);
      } },
    { key: "move",
      en: ["6 · Move users to another BU", "Pick the target BU: Colvio warns about the impact on security roles before anything is written, then reports the result."],
      fr: ["6 · Déplacer vers une autre BU", "Choisissez la BU cible : Colvio signale l'impact sur les rôles de sécurité avant toute écriture, puis affiche le résultat."],
      run: async (h) => {
        await h.click(h.page.getByRole("button", { name: /Move to BU \(1\)/ })); await h.wait(900);
        await h.select(selectWithOption(h, "b3"), "b3"); await h.wait(2600);
        await h.click(h.page.getByRole("button", { name: "Move 1", exact: true })); await h.wait(2000);
        await h.click(h.page.getByRole("button", { name: "Close", exact: true })); await h.wait(1900); // tree counts follow: Contoso 1, Sales US 2
      } },
  ],
};
