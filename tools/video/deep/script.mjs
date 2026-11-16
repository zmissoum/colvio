// Deep dive — Script Console. The demo org (src/scriptDemo.js) is stateful for the page load: the
// "Fill a lookup from a pivot table" template dry-runs, runs for real, then rolls back, and a second
// dry run proves the rows are back. Each write is confirmed in the app's own dialog: its text stays
// on screen, then the cursor clicks OK (h.confirmed in lib.mjs).
const btn = (h, re) => h.page.locator("button >> visible=true").filter({ hasText: re }).first();
const tab = (h, name) => h.page.locator("button >> visible=true").filter({ hasText: new RegExp(`^${name}\\d*$`) }).first();
const templates = (h) => h.page.locator("select >> visible=true").filter({ has: h.page.locator('option[value="propagate-lookup"]') }).first();

// Click `loc`, leave the app's confirmation text on screen for `hold` ms, click OK.
const confirmed = (h, loc, hold = 2600) => h.confirmed(loc, hold);

export default {
  key: "script",
  label: "Script Console",
  tagline: {
    en: "JavaScript on the Dataverse Web API — dry run first, every write journaled, one-click rollback",
    fr: "Du JavaScript sur la Web API Dataverse — dry run d'abord, chaque écriture journalisée, rollback en un clic",
  },
  chapters: [
    { key: "template",
      en: ["1 · For what no screen does", "JavaScript on the Dataverse Web API. Start from a template — here: fill each user's sales code from the sales organization they belong to."],
      fr: ["1 · Pour ce qu'aucun écran ne fait", "Du JavaScript sur la Web API Dataverse. Partez d'un modèle — ici : renseigner le code commercial de chaque utilisateur d'après son organisation commerciale."],
      run: async (h) => {
        await h.open("Script Console"); await h.wait(800);
        await h.select(templates(h), "propagate-lookup"); await h.wait(1200);
        await h.hover(h.page.locator("textarea >> visible=true").first()); await h.wait(1800);
      } },
    { key: "sandbox",
      en: ["2 · Isolated, and only through dv", "The code runs in a sandbox with no network of its own: it reaches your org only through dv — reads, writes, $batch, actions, all in the API reference."],
      fr: ["2 · Isolé, et seulement via dv", "Le code tourne dans un bac à sable sans réseau propre : il n'atteint votre org que par dv — lectures, écritures, $batch, actions, tout est dans la référence de l'API."],
      run: async (h) => {
        await h.hover(h.page.getByText(/isolated sandbox/).first()); await h.wait(1800);
        await h.click(btn(h, /^API reference$/)); await h.wait(2400);
        await h.scroll(260); await h.wait(1600);
      } },
    { key: "dry-run", pos: "top",
      en: ["3 · Dry run: reads real, writes listed", "Reads run for real; every write goes to the Plan and is NOT sent. Here: 8 lookups the script would set."],
      fr: ["3 · Dry run : lectures réelles, écritures listées", "Les lectures s'exécutent vraiment ; chaque écriture va dans le Plan et n'est PAS envoyée. Ici : 8 lookups que le script renseignerait."],
      run: async (h) => {
        await h.click(btn(h, /^API reference$/)); await h.wait(500);
        await h.click(btn(h, /Dry run$/)); await h.wait(2400);
        await h.hover(h.page.getByText(/write\(s\) the script would send/).first()); await h.wait(1800);
      } },
    { key: "report",
      en: ["4 · A report per row", "The script's own table: who would be updated, who already has the right code, and the rows it skipped rather than guess."],
      fr: ["4 · Un rapport par ligne", "Le tableau du script : qui serait mis à jour, qui a déjà le bon code, et les lignes qu'il a ignorées plutôt que de deviner."],
      run: async (h) => {
        await h.click(tab(h, "Tables")); await h.wait(1800);
        await h.hover(h.page.locator("td >> visible=true").filter({ hasText: /^already right$/ }).first()); await h.wait(1200);
        await h.hover(h.page.locator("td >> visible=true").filter({ hasText: /^skipped/ }).first()); await h.wait(1600);
      } },
    { key: "live",
      en: ["5 · Run for real, journaled", "Confirmed against the dry run's plan, with the rollback journal on: the Writes tab lists every change made — 8 of 8 reversible."],
      fr: ["5 · Exécution réelle, journalisée", "Confirmée face au plan du dry run, journal de rollback activé : l'onglet Writes liste chaque modification faite — 8 sur 8 réversibles."],
      run: async (h) => {
        await confirmed(h, btn(h, /Run for real$/), 3200);
        await h.wait(2200);
        await h.click(tab(h, "Writes")); await h.wait(1400);
        await h.hover(h.page.getByText(/reversible/).first()); await h.wait(1600);
      } },
    { key: "rollback",
      en: ["6 · Rollback", "One click sends the inverse operations, last write first — then counts what was undone, failed or skipped."],
      fr: ["6 · Rollback", "Un clic envoie les opérations inverses, de la dernière écriture à la première — puis compte ce qui a été annulé, en échec ou ignoré."],
      run: async (h) => {
        await confirmed(h, btn(h, /Rollback$/), 2800);
        await h.wait(1600);
        await h.hover(h.page.getByText(/^Rollback: /).first()); await h.wait(1800);
      } },
    { key: "proof", pos: "top",
      en: ["7 · Back as before", "Dry run again: the same 8 writes are planned — the rows really are as they were before the run."],
      fr: ["7 · Comme avant", "Nouveau dry run : les mêmes 8 écritures sont prévues — les lignes sont bien revenues à leur état d'avant."],
      run: async (h) => {
        await h.click(btn(h, /Dry run$/)); await h.wait(2200);
        await h.hover(h.page.getByText(/write\(s\) the script would send/).first()); await h.wait(1800);
      } },
    { key: "input-file", pos: "top",
      en: ["8 · Rows from a file", "An input file — here a 2-row CSV — reaches the script as input: update accounts by account number, and a number that matches nothing is reported, not guessed."],
      fr: ["8 · Des lignes depuis un fichier", "Un fichier d'entrée — ici un CSV de 2 lignes — arrive dans le script en tant qu'input : mise à jour des comptes par numéro de compte, et un numéro introuvable est signalé, pas deviné."],
      run: async (h) => {
        await h.select(templates(h), "update-from-file"); await h.wait(1200);
        await h.hover(btn(h, /sample\.csv/)); await h.wait(1500);
        await h.click(btn(h, /Dry run$/)); await h.wait(1800);
        await h.click(tab(h, "Tables")); await h.wait(1200);
        await h.hover(h.page.locator("td >> visible=true").filter({ hasText: /^skipped: not found$/ }).first()); await h.wait(1600);
      } },
    { key: "save-export",
      en: ["9 · Saved scripts, exported journal", "Save a script to the Saved scripts list, download it as .js — and export the run's journal as JSON, or import one back."],
      fr: ["9 · Scripts enregistrés, journal exporté", "Enregistrez un script dans la liste Saved scripts, téléchargez-le en .js — et exportez le journal de l'exécution en JSON, ou réimportez-en un."],
      run: async (h) => {
        await h.click(btn(h, /Save/)); await h.wait(1200);
        await h.hover(h.page.locator("select >> visible=true").filter({ hasText: /Saved scripts \(1\)/ }).first()); await h.wait(1300);
        await h.hover(btn(h, /^Download \.js$/)); await h.wait(1100);
        await h.click(tab(h, "Writes")); await h.wait(900);
        await h.hover(btn(h, /^Export journal$/)); await h.wait(1500);
      } },
  ],
};
