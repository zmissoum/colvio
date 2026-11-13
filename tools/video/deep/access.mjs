// Deep dive — Show All Data › Record access + Record activity. Demo mode: the demo account (owned by
// Jeanne Dubois, business unit France), three demo users, and three recorded saves answered by a
// fake org through the real Record activity loader. Every action below was checked with --probe.
const btn = (h, re) => h.page.locator("button >> visible=true").filter({ hasText: re }).first();
const span = (h, re) => h.page.locator("span >> visible=true").filter({ hasText: re }).first();
const userSearch = (h) => h.page.getByPlaceholder("Search a user by name or email…");
const pickUser = (h, name) => h.page.locator("div >> visible=true").filter({ has: h.page.locator("b", { hasText: name }) }).last();
// a right's row in Record access: the clickable line holding its label
const rightRow = (h, label) => h.page.locator("div >> visible=true").filter({ has: h.page.locator(`span:text-is("${label}")`) }).last();
const text = (h, re) => h.page.locator("div >> visible=true").filter({ hasText: re }).last();
const accessTitle = (h) => span(h, /^🔐 Record access/);
const activityTitle = (h) => span(h, /^⚡ Record activity/);
const jobRow = (h, re) => h.page.locator('div[title="Show the message, the step and its recent runs"] >> visible=true').filter({ hasText: re }).first();
const traceRow = (h, re) => h.page.locator('div[title="Show the trace text"] >> visible=true').filter({ hasText: re }).first();

export default {
  key: "access",
  label: "Record access",
  tagline: {
    en: "Why can't this user see the record? And what did that save just trigger?",
    fr: "Pourquoi cet utilisateur ne voit-il pas l'enregistrement ? Et qu'a déclenché cette sauvegarde ?",
  },
  chapters: [
    { key: "pick-user",
      en: ["1 · Pick a user", "Inspect the record, open 🔐 Record access and search the user by name or email."],
      fr: ["1 · Choisir un utilisateur", "Inspectez l'enregistrement, ouvrez 🔐 Record access et cherchez l'utilisateur par nom ou e-mail."],
      run: async (h) => {
        await h.open("Show All Data");
        const input = h.page.getByPlaceholder(/demo mode|entity\/GUID/).first();
        await h.click(input);
        await input.fill("account/a1b2c3d4-e5f6-7890-abcd-ef1234567890"); await h.wait(800);
        await h.click(btn(h, /Inspect$/)); await h.wait(1200);
        await h.click(activityTitle(h)); await h.wait(600);          // folded for now — chapter 7 reopens it
        await h.click(accessTitle(h)); await h.wait(900);
        await h.type(userSearch(h), "alex"); await h.wait(1300);
      } },
    { key: "verdict",
      pos: "top",
      en: ["2 · Dataverse's own yes / no", "One line per right. Read ✓ — through his team Key Accounts EU's role, at Parent: Child BU depth. Write ✗. And where the record sits."],
      fr: ["2 · Le oui / non de Dataverse", "Une ligne par droit. Read ✓ — via le rôle de son équipe Key Accounts EU, en profondeur Parent: Child BU. Write ✗. Et où se trouve l'enregistrement."],
      run: async (h) => {
        await h.click(pickUser(h, "Alex Martin")); await h.wait(1800);
        await h.hover(text(h, /^📍 Owned by/)); await h.wait(1500);
        await h.hover(rightRow(h, "Read")); await h.wait(1600);
      } },
    { key: "fix",
      pos: "top",
      en: ["3 · For every no, what would fix it", "His widest Write is User, this record needs Organization — or share it (he has the privilege), or assign it to him."],
      fr: ["3 · Pour chaque non, ce qui le réglerait", "Son Write le plus large est User, il faut Organization ici — ou partagez-le (il a le privilège), ou attribuez-le-lui."],
      run: async (h) => {
        await h.click(rightRow(h, "Write")); await h.wait(1500);
        await h.hover(text(h, /^→ Or share the record/)); await h.wait(1500);
        await h.hover(text(h, /^→ Or assign the record/)); await h.wait(1500);
      } },
    { key: "context",
      en: ["4 · Roles, teams and shares", "His roles, his teams with their roles, and who the record is already shared with — and with which rights."],
      fr: ["4 · Rôles, équipes et partages", "Ses rôles, ses équipes avec leurs rôles, et avec qui l'enregistrement est déjà partagé — avec quels droits."],
      run: async (h) => {
        await h.click(rightRow(h, "Write")); await h.wait(500);
        await h.hover(text(h, /^owner team Key Accounts EU/)); await h.wait(1500);
        await h.hover(text(h, /^team Contoso deal team/)); await h.wait(1600);
      } },
    { key: "owner",
      pos: "top",
      en: ["5 · Same record, another user", "Jeanne owns it: every right ✓, and Dataverse says why. The whole check exports to CSV or Excel."],
      fr: ["5 · Même enregistrement, autre utilisateur", "Jeanne en est propriétaire : tous les droits ✓, et Dataverse dit pourquoi. Tout le diagnostic s'exporte en CSV ou Excel."],
      run: async (h) => {
        await h.type(userSearch(h), "jeanne"); await h.wait(1000);
        await h.click(pickUser(h, "Jeanne Dubois")); await h.wait(1800);
        await h.hover(text(h, /^Dataverse: /)); await h.wait(1300);
        await h.hover(btn(h, /^Excel$/)); await h.wait(1300);
      } },
    { key: "saves",
      pos: "top",
      en: ["6 · Record activity: what each save triggered", "Every save of the record made in this browser — time, outcome, columns sent — and the plug-ins it ran, in order, a cascade on contact indented."],
      fr: ["6 · Record activity : ce que chaque sauvegarde a déclenché", "Chaque sauvegarde faite dans ce navigateur — heure, résultat, colonnes envoyées — et les plug-ins exécutés, dans l'ordre, la cascade sur contact en retrait."],
      run: async (h) => {
        await h.click(accessTitle(h)); await h.wait(500);
        await h.click(activityTitle(h)); await h.wait(1800);
        await h.hover(span(h, /^ContactAddressSync/)); await h.wait(1300);
        await h.hover(span(h, /^SyncToErp/)); await h.wait(1300);
      } },
    { key: "failed-save",
      pos: "top",
      en: ["7 · A save that failed", "HTTP 400: the validation plug-in threw — its message in red. Click the row for the full trace and exception, with Copy."],
      fr: ["7 · Une sauvegarde en échec", "HTTP 400 : le plug-in de validation a levé une exception — son message en rouge. Cliquez la ligne pour la trace complète et l'exception, avec Copy."],
      run: async (h) => {
        await h.click(span(h, /^HTTP 204 · 412 ms/)); await h.wait(700);       // fold the first save
        await h.click(span(h, /^Failed · HTTP 400/)); await h.wait(1800);
        await h.hover(text(h, /^Revenue can't drop below/)); await h.wait(900);
        await h.click(traceRow(h, /AccountValidate/)); await h.wait(1800);
      } },
    { key: "job",
      en: ["8 · An async job that keeps failing", "Its last 6 runs all failed — since when, last success. The step behind it (runs as, has a secure configuration), and what a 401 usually means."],
      fr: ["8 · Un job asynchrone qui échoue en boucle", "Ses 6 dernières exécutions ont échoué — depuis quand, dernier succès. Le step derrière (exécuté en tant que, configuration sécurisée), et ce que veut dire un 401."],
      run: async (h) => {
        await h.click(span(h, /^Failed · HTTP 400/)); await h.wait(600);
        await h.click(span(h, /^HTTP 204 · 412 ms/)); await h.wait(1000);
        await h.click(jobRow(h, /SurveySync/)); await h.wait(2200);
        await h.hover(text(h, /^Failing every time/)); await h.wait(1300);
        await h.hover(text(h, /^💡/)); await h.wait(1500);
      } },
    { key: "flows",
      en: ["9 · Which cloud flows it set off", "Triggered, with their run; May trigger — it depends on a row filter; Won't trigger, with the reason: none of its trigger columns were sent."],
      fr: ["9 · Les cloud flows déclenchés", "Triggered, avec leur exécution ; May trigger — selon un filtre de ligne ; Won't trigger, avec la raison : aucune de ses colonnes déclencheuses n'a été envoyée."],
      run: async (h) => {
        await h.click(jobRow(h, /SurveySync/)); await h.wait(600);
        await h.hover(span(h, /^Triggered$/)); await h.wait(1100);
        await h.hover(span(h, /^May trigger$/)); await h.wait(1100);
        await h.click(span(h, /^Won't trigger$/)); await h.wait(700);
        await h.scroll(260); await h.wait(1600);
      } },
  ],
};
