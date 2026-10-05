// Deep dive — Adoption. Every action below was checked against demo mode (make-deep --probe).
const btn = (h, re) => h.page.locator("button >> visible=true").filter({ hasText: re }).first();
const selWith = (h, text) => h.page.locator("select >> visible=true").filter({ hasText: text }).first();
const label = (h, text) => h.page.locator("label >> visible=true").filter({ hasText: text }).first();
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

export default {
  key: "adoption",
  label: "Adoption",
  tagline: {
    en: "Who really uses Dynamics 365 — trends, inactivity, never-signed-in, by role and business unit",
    fr: "Qui utilise vraiment Dynamics 365 — tendances, inactivité, jamais connectés, par rôle et business unit",
  },
  chapters: [
    { key: "kpis",
      en: ["1 · Access events, honestly counted", "Read from the user-access audit (“Audit user access” on). Dataverse logs ≤ 1 event per user per 4 h: access events, not clicks."],
      fr: ["1 · Des accès, comptés honnêtement", "Lu dans l'audit des accès (« Audit user access » activé). Dataverse note au plus 1 accès par utilisateur toutes les 4 h : des accès, pas des clics."],
      run: async (h) => {
        await h.open("Adoption"); await h.wait(1200);
        await h.hover(h.vis("Access events")); await h.wait(1800);
        await h.hover(h.vis("Stickiness (DAU÷MAU)")); await h.wait(1600);
      } },
    { key: "trend",
      en: ["2 · Read the trend", "Access events per day as bars, distinct users as a line — or one series at a time, scaled to fill the chart."],
      fr: ["2 · Lire la tendance", "Les accès par jour en barres, les utilisateurs distincts en courbe — ou une seule série, à sa propre échelle."],
      run: async (h) => {
        await h.scroll(300); await h.wait(700);
        await h.click(btn(h, /^Logins$/)); await h.wait(1600);
        await h.click(btn(h, /^Distinct users$/)); await h.wait(1700);
        await h.click(btn(h, /^Both$/)); await h.wait(1000);
      } },
    { key: "users", pos: "top",
      en: ["3 · Who uses it most", "Each active user with events, active days and last access. Sort by any of them, filter by name or business unit."],
      fr: ["3 · Qui l'utilise le plus", "Chaque utilisateur actif avec ses accès, jours actifs et dernier accès. Triez, filtrez par nom ou business unit."],
      run: async (h) => {
        await h.scroll(420); await h.wait(700);
        await h.click(btn(h, /^Active days$/)); await h.wait(1200);
        await h.click(btn(h, /^Recent$/)); await h.wait(1200);
        const f = h.page.getByPlaceholder("Filter users…").first();
        await h.type(f, "UK"); await h.wait(1700);
        await f.fill(""); await h.wait(700);
      } },
    { key: "never", pos: "top",
      en: ["4 · Never signed in", "Enabled users with no access in the window. Service accounts are excluded by default — include them and the silent integration shows up."],
      fr: ["4 · Jamais connectés", "Les utilisateurs activés sans aucun accès sur la période. Comptes de service exclus par défaut — incluez-les : l'intégration silencieuse apparaît."],
      run: async (h) => {
        await h.scroll(260); await h.wait(700);
        await h.click(label(h, "include service accounts")); await h.wait(1800);
        await h.hover(h.vis("# D365 Integration")); await h.wait(1300);
        await h.hover(h.vis("Non-Interactive")); await h.wait(1300);
      } },
    { key: "inactivity", pos: "top",
      en: ["5 · License & inactivity", "“All in scope” adds each user's license and days since last access — then keep only those inactive for 30 days or more."],
      fr: ["5 · Licence et inactivité", "« All in scope » ajoute la licence de chaque utilisateur et ses jours sans accès — puis ne gardez que les inactifs depuis 30 jours ou plus."],
      run: async (h) => {
        await h.scroll(-200); await h.wait(600);
        await h.click(btn(h, /^All in scope/)); await h.wait(1900);
        await h.select(selWith(h, "Everyone"), "30"); await h.wait(2000);
      } },
    { key: "filters",
      en: ["6 · By security role or business unit", "KPIs, chart and lists recompute for a role's members or a business unit — “+ child BUs” takes in its whole subtree."],
      fr: ["6 · Par rôle de sécurité ou business unit", "Indicateurs, graphique et listes se recalculent pour les membres d'un rôle ou une business unit — « + child BUs » inclut toute sa sous-arborescence."],
      run: async (h) => {
        await h.scroll(-2400); await h.wait(700);
        await h.select(selWith(h, "All security roles"), "Sales Manager"); await h.wait(1800);
        await h.select(selWith(h, "All business units"), "bu1"); await h.wait(1600);
        await h.click(label(h, "+ child BUs")); await h.wait(1800);
      } },
    { key: "period",
      en: ["7 · Pick a period", "7, 30 or 90 days, or any custom range — the chart and every KPI follow the window."],
      fr: ["7 · Choisir la période", "7, 30 ou 90 jours, ou n'importe quelle plage personnalisée — le graphique et tous les indicateurs suivent."],
      run: async (h) => {
        await h.click(btn(h, /^90 days$/)); await h.wait(1600);
        await h.click(btn(h, /^Custom$/)); await h.wait(700);
        const from = h.page.locator("input[type=date] >> visible=true").first();
        await h.hover(from);
        await from.fill(isoDay(Date.now() - 14 * 86400000)); await h.wait(1600);
        await h.click(btn(h, /^7 days$/)); await h.wait(1600);
      } },
    { key: "compare-report",
      en: ["8 · Compare, then share", "⇄ compares with the period just before (▲▼). Export to CSV / Excel, or a 5-slide PowerPoint report with editable charts."],
      fr: ["8 · Comparer, puis partager", "⇄ compare à la période précédente (▲▼). Export CSV / Excel, ou un rapport PowerPoint de 5 diapos aux graphiques modifiables."],
      run: async (h) => {
        await h.click(btn(h, /vs previous period/)); await h.wait(2200);
        await h.hover(btn(h, /Excel$/)); await h.wait(700);
        await h.hover(btn(h, /Report \(\.pptx\)/)); await h.wait(1900);
      } },
  ],
};
