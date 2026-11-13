// Deep dive — Health check. Every action below was checked against demo mode (make-deep --probe).
// Demo org (healthCheckDemo.js): not a production environment, so "Unmanaged solutions in
// production" answers "Not applicable" there — the caption says so instead of showing a finding.
// The demo answers every check at once: the per-check progress (spinner, request count, Stop) of a
// live run is not filmed.
const btn = (h, re) => h.page.locator("button >> visible=true").filter({ hasText: re }).first();
const title = (h, t) => h.page.getByText(t, { exact: true }).first();
// the "N items" / "Hide" toggle sits in the same header row as the check's title
const items = (h, t) => title(h, t).locator("xpath=..").locator("button").first();
// bring a check's card to the top of the scroll area (smooth, so the video shows the move)
const scrollTo = async (h, t, block = "start") => {
  await title(h, t).evaluate((el, b) => el.closest("div").parentElement.scrollIntoView({ block: b, behavior: "smooth" }), block);
  await h.wait(900);
};

export default {
  key: "health",
  label: "Health check",
  tagline: {
    en: "One report on what silently hurts your Dataverse environment — and what to do about each finding",
    fr: "Un seul rapport sur ce qui abîme votre environnement Dataverse en silence — et quoi faire pour chaque point",
  },
  chapters: [
    { key: "run",
      en: ["1 · One click, 12 checks", "Jobs, flows, plug-ins, connections, variables, users, solutions, log tables — each check a few reads, one after the other. Read-only."],
      fr: ["1 · Un clic, 12 contrôles", "Jobs, flows, plug-ins, connexions, variables, utilisateurs, solutions, tables de logs — quelques lectures par contrôle, l'un après l'autre. En lecture seule."],
      run: async (h) => {
        await h.open("Health check"); await h.wait(1800);
        await h.click(btn(h, /Run the health check$/)); await h.wait(2400);
      } },
    { key: "severity",
      en: ["2 · Worst first", "Every check is rated — warning, note, OK, not applicable — and sorted worst first. Each finding says what to do (→)."],
      fr: ["2 · Le plus grave d'abord", "Chaque contrôle est noté — avertissement, note, OK, non applicable — et trié du plus grave au moins grave. Chaque constat dit quoi faire (→)."],
      run: async (h) => {
        await h.hover(h.page.getByText(/^⚠ 7 warnings$/).first()); await h.wait(1300);
        await h.hover(h.page.getByText(/^ℹ 3 notes$/).first()); await h.wait(1000);
        await h.hover(h.page.getByText(/^✓ 1 OK$/).first()); await h.wait(1000);
        await h.hover(h.page.getByText(/^→ System Ops › System jobs/).first()); await h.wait(1800);
      } },
    { key: "jobs", pos: "top",
      en: ["3 · Failing and suspended jobs", "135 system jobs failed in 7 days, grouped by job name; 42 suspended jobs waiting for a retry that may never succeed."],
      fr: ["3 · Jobs en échec et suspendus", "135 travaux système en échec sur 7 jours, regroupés par nom ; 42 travaux suspendus qui attendent une reprise qui n'aboutira peut-être jamais."],
      run: async (h) => {
        await h.click(items(h, "System jobs failed in the last 7 days")); await h.wait(1800);
        await h.click(items(h, "Suspended system jobs")); await h.wait(2000);
      } },
    { key: "flows-plugins",
      en: ["4 · Orphan flows, noisy plug-ins", "Active cloud flows owned by a disabled user stop when their connections expire. A synchronous Update step with no filtering attributes fires on every save."],
      fr: ["4 · Flows orphelins, plug-ins bavards", "Les cloud flows actifs d'un utilisateur désactivé s'arrêtent quand ses connexions expirent. Une étape Update synchrone sans attributs filtrés se déclenche à chaque enregistrement."],
      run: async (h) => {
        await h.click(items(h, "Suspended system jobs")); await h.wait(300);   // fold the previous lists
        await h.click(items(h, "System jobs failed in the last 7 days")); await h.wait(300);
        await scrollTo(h, "Active cloud flows owned by disabled users");
        await h.click(items(h, "Active cloud flows owned by disabled users")); await h.wait(1700);
        await h.click(items(h, "Synchronous Update plug-in steps without filtering attributes")); await h.wait(2200);
      } },
    { key: "connections",
      en: ["5 · Empty connections and variables", "A connection reference with no connection: the flows using it can't run. An environment variable with neither value nor default: whatever reads it gets nothing."],
      fr: ["5 · Connexions et variables vides", "Une référence de connexion sans connexion : les flows qui l'utilisent ne tournent pas. Une variable d'environnement sans valeur ni défaut : ce qui la lit reçoit du vide."],
      run: async (h) => {
        await scrollTo(h, "Connection references without a connection");
        await h.click(items(h, "Connection references without a connection")); await h.wait(1700);
        await h.click(items(h, "Environment variables with neither a value nor a default")); await h.wait(2200);
      } },
    { key: "log-tables",
      en: ["6 · Log tables eating storage", "asyncoperation (system jobs): 1,240,300 rows, past the 1,000,000 flag. Rows per log table from Dataverse's snapshot (≤ 24 h), and the bulk-delete fix."],
      fr: ["6 · Les tables de logs qui mangent le stockage", "asyncoperation (travaux système) : 1 240 300 lignes, au-delà du seuil de 1 000 000. Les lignes par table de logs, issues du snapshot de Dataverse (≤ 24 h), et le nettoyage par suppression en bloc."],
      run: async (h) => {
        await scrollTo(h, "Log tables size");
        await h.click(items(h, "Log tables size")); await h.wait(1600);
        await h.hover(h.page.locator("td >> visible=true").filter({ hasText: /^1,240,300$/ }).first()); await h.wait(2200);
      } },
    { key: "notes", pos: "top",
      en: ["7 · Notes, and what doesn't apply", "Trace log on “All”, audit kept forever, enabled users without a role. Unmanaged solutions are only flagged in production — this demo org isn't one."],
      fr: ["7 · Les notes, et ce qui ne s'applique pas", "Trace log sur « All », audit conservé indéfiniment, utilisateurs actifs sans rôle. Les solutions unmanaged ne sont signalées qu'en production — ce n'est pas le cas de cette org de démo."],
      run: async (h) => {
        await scrollTo(h, "Unmanaged solutions in production", "end");
        await h.click(items(h, "Enabled users without a security role")); await h.wait(600);
        await scrollTo(h, "Unmanaged solutions in production", "end"); await h.wait(600);
        await h.hover(title(h, "Plug-in trace log setting")); await h.wait(1200);
        await h.hover(title(h, "Auditing")); await h.wait(1200);
        await h.hover(title(h, "Unmanaged solutions in production")); await h.wait(2000);
      } },
    { key: "share",
      en: ["8 · Copy, paste, export", "📋 Copy report: the whole report as plain text, ready to paste in a ticket or a chat. Or take it to CSV / Excel."],
      fr: ["8 · Copier, coller, exporter", "📋 Copy report : tout le rapport en texte brut, prêt à coller dans un ticket ou un chat. Ou exportez-le en CSV / Excel."],
      run: async (h) => {
        await h.page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
        await h.page.getByText("Health check", { exact: false }).first().evaluate(() => document.querySelector("h2")?.scrollIntoView({ block: "start", behavior: "smooth" }));
        await h.wait(900);
        await h.click(btn(h, /Copy report$/)); await h.wait(1300);
        await h.hover(btn(h, /^CSV$/)); await h.wait(1200);
        await h.hover(btn(h, /^Excel$/)); await h.wait(1500);
      } },
  ],
};
