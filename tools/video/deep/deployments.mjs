// Deep dive — Solutions › 🚀 Deployments. Every action below was checked against demo mode
// (make-deep --probe). Demo org (solutionHistoryDemo.js): a failed upgrade retried the next day, an
// import that overwrote customizations, a patch, an uninstall, an import still running, and two
// imports older than the 180-day solution history (import jobs only). Nothing is downloaded: the
// CSV / Excel / import-log XML buttons are only hovered.
const btn = (h, re) => h.page.locator("button >> visible=true").filter({ hasText: re }).first();
const sel = (h, optionText) => h.page.locator("select >> visible=true").filter({ has: h.page.locator("option", { hasText: optionText }) }).first();
const row = (h, re) => h.page.locator("tr >> visible=true").filter({ hasText: re }).first();
const txt = (h, re) => h.page.getByText(re).first();
// scroll inside the Deployments window (its body is its own scroll box)
const scrollBody = async (h, dy) => {
  const box = await h.page.getByText(/^Read-only\. The/).first().boundingBox();
  const x = 700, y = box ? box.y - 120 : 450;
  await h.page.evaluate(([x, y]) => window.__cv.cursor(x, y), [x, y]); await h.wait(400);
  await h.page.mouse.move(x, y);
  for (let i = 0; i < 6; i++) { await h.page.mouse.wheel(0, dy / 6); await h.wait(70); }
};

export default {
  key: "deployments",
  label: "Deployments",
  tagline: {
    en: "Every solution import, export and uninstall — when, which version, the result, who",
    fr: "Chaque import, export et désinstallation de solution — quand, quelle version, le résultat, qui",
  },
  chapters: [
    { key: "open",
      en: ["1 · Every deployment, one window", "Solutions › 🚀 Deployments: what this environment recorded — imports, exports, uninstalls, failures, the last and the oldest."],
      fr: ["1 · Tous les déploiements, une fenêtre", "Solutions › 🚀 Deployments : ce que l'environnement a enregistré — imports, exports, désinstallations, échecs, le plus récent et le plus ancien."],
      run: async (h) => {
        await h.open("Solutions"); await h.wait(900);
        await h.click(btn(h, /Deployments$/)); await h.wait(1600);
        await h.hover(txt(h, /operations ·/)); await h.wait(2200);
      } },
    { key: "timeline",
      en: ["2 · The timeline", "Newest first: when and how long, the solution and its publisher, the version (managed, patch), new / upgrade / update, the result, and who started it."],
      fr: ["2 · La chronologie", "Du plus récent au plus ancien : quand et combien de temps, la solution et son éditeur, la version (managed, patch), new / upgrade / update, le résultat, et qui l'a lancé."],
      run: async (h) => {
        await h.hover(txt(h, /^6 min 52 s$/)); await h.wait(1100);
        await h.hover(row(h, /6 min 52 s/).locator("td").nth(2)); await h.wait(1100);
        await h.hover(row(h, /6 min 52 s/).locator("td").nth(3)); await h.wait(1100);
        await h.hover(row(h, /6 min 52 s/).locator("td").nth(4)); await h.wait(1000);
        await h.hover(row(h, /6 min 52 s/).locator("td").nth(5)); await h.wait(1600);
      } },
    { key: "flags",
      en: ["3 · What went wrong, flagged", "A failed upgrade with its error, retried the next day; an import that overwrote unmanaged customizations; one started and never completed."],
      fr: ["3 · Ce qui a mal tourné, signalé", "Un upgrade en échec avec son erreur, relancé le lendemain ; un import qui a écrasé des personnalisations unmanaged ; un autre lancé et jamais terminé."],
      run: async (h) => {
        await h.hover(txt(h, /^⚠ Failed \(0x80048027\)/)); await h.wait(1800);
        await h.hover(row(h, /6 min 52 s/).locator("td").nth(4)); await h.wait(1100);
        await h.hover(txt(h, /^⚠ Overwrote unmanaged customizations$/)); await h.wait(1500);
        await h.hover(txt(h, /^⚠ Started, never completed/)); await h.wait(1600);
      } },
    { key: "details",
      en: ["4 · Open a run", "Click a row: status, error code and message, the activity id for Microsoft support, the import job — then its import log, parsed: what failed, and why."],
      fr: ["4 · Ouvrir une exécution", "Cliquez une ligne : statut, code et message d'erreur, l'activity id pour le support Microsoft, le job d'import — puis son journal d'import, analysé : ce qui a échoué, et pourquoi."],
      run: async (h) => {
        await h.click(row(h, /Failed \(0x80048027\)/)); await h.wait(1500);
        await h.hover(txt(h, /^Activity id$/)); await h.wait(1000);
        await h.click(btn(h, /^Load the import log$/)); await h.wait(1600);
        await h.hover(txt(h, /^• 0x80048027 Attribute new_region/)); await h.wait(1500);
        await h.hover(btn(h, /^Download the XML/)); await h.wait(1500);
      } },
    { key: "filters",
      en: ["5 · Filter the history", "By text (solution, version, who, error), solution, operation, result and period. Failed only: one row. Uninstalls: one."],
      fr: ["5 · Filtrer l'historique", "Par texte (solution, version, qui, erreur), solution, opération, résultat et période. Échecs seulement : une ligne. Désinstallations : une."],
      run: async (h) => {
        await h.click(row(h, /Failed \(0x80048027\)/)); await h.wait(500);   // fold the details
        await h.select(sel(h, "Any result"), "failed"); await h.wait(1600);
        await h.select(sel(h, "Any result"), "all"); await h.wait(500);
        await h.select(sel(h, "Imports, exports, uninstalls"), "1"); await h.wait(1600);
        await h.select(sel(h, "Imports, exports, uninstalls"), "main"); await h.wait(500);
        await h.type(h.page.getByPlaceholder("🔍 Solution, version, who, error…"), "Alex"); await h.wait(1800);
      } },
    { key: "beyond-180", pos: "top",
      en: ["6 · Older than 180 days", "Dataverse purges its solution history after 180 days and never says who. The import jobs are kept longer: they still show who imported, and when."],
      fr: ["6 · Au-delà de 180 jours", "Dataverse purge l'historique des solutions après 180 jours et n'indique jamais qui. Les jobs d'import sont gardés plus longtemps : ils montrent encore qui a importé, et quand."],
      run: async (h) => {
        await h.page.getByPlaceholder("🔍 Solution, version, who, error…").fill(""); await h.wait(600);
        await scrollBody(h, 900); await h.wait(1200);
        await h.hover(txt(h, /^ℹ Import job only/)); await h.wait(1800);
        await h.hover(h.page.getByText(/^Read-only\. The/).first()); await h.wait(1600);
      } },
    { key: "ladder",
      en: ["7 · Version ladders", "By solution: each solution's whole history, version by version — the current one, imports, failures, who, and what was uninstalled."],
      fr: ["7 · Les échelles de versions", "Par solution : tout l'historique de chaque solution, version par version — la version actuelle, les imports, les échecs, qui, et ce qui a été désinstallé."],
      run: async (h) => {
        await h.click(btn(h, /^By solution$/)); await h.wait(1500);
        await h.hover(txt(h, /^v1\.0\.0\.5$/)); await h.wait(1400);
        await h.hover(txt(h, /^8 imports · 1 failed/)); await h.wait(1400);
        await h.hover(txt(h, /^Zakaria Missoum · import job only$/)); await h.wait(1300);
        await h.hover(txt(h, /^uninstalled$/)); await h.wait(1600);
      } },
    { key: "from-solution",
      en: ["8 · From any solution", "Pick a solution, then 🚀 Deployment history: the same window, already filtered on it. Export the timeline to CSV or Excel."],
      fr: ["8 · Depuis n'importe quelle solution", "Choisissez une solution, puis 🚀 Deployment history : la même fenêtre, déjà filtrée dessus. Exportez la chronologie en CSV ou Excel."],
      run: async (h) => {
        await h.click(btn(h, /^✕$/)); await h.wait(700);
        await h.click(h.vis("Colvio Demo Solution")); await h.wait(1500);
        await h.click(btn(h, /Deployment history$/)); await h.wait(1600);
        await h.hover(sel(h, "All solutions")); await h.wait(1200);
        await h.hover(btn(h, /^CSV$/)); await h.wait(1000);
        await h.hover(btn(h, /^Excel$/)); await h.wait(1400);
      } },
  ],
};
