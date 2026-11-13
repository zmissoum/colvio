// Deep dive — Script Console. The demo org (src/scriptDemo.js) is stateful for the page load: the
// "Fill a lookup from a pivot table" template dry-runs, runs for real, then rolls back, and a second
// dry run proves the rows are back. The app's own window.confirm() messages are shown in an
// on-screen replica (native dialogs don't render in a screencast): the first click is answered
// Cancel while the replica shows the real text, then the same button is clicked again and answered OK.
const btn = (h, re) => h.page.locator("button >> visible=true").filter({ hasText: re }).first();
const tab = (h, name) => h.page.locator("button >> visible=true").filter({ hasText: new RegExp(`^${name}\\d*$`) }).first();
const templates = (h) => h.page.locator("select >> visible=true").filter({ has: h.page.locator('option[value="propagate-lookup"]') }).first();

const installConfirm = (h) => h.page.evaluate(() => {
  if (window.__cvConfirmOn) return;
  window.__cvConfirmOn = true;
  const st = document.createElement("style");
  st.textContent = `#cv-confirm{position:fixed;left:50%;top:196px;transform:translateX(-50%) translateY(-8px);width:460px;background:#1f2430;
    border:1px solid #3a4256;border-radius:10px;padding:16px 18px 12px;color:#E8EAF0;font:13px/1.5 "Segoe UI",system-ui,sans-serif;
    z-index:2147483645;opacity:0;transition:opacity .25s,transform .25s;box-shadow:0 14px 50px rgba(0,0,0,.6);pointer-events:none;white-space:pre-wrap}
  #cv-confirm.on{opacity:1;transform:translateX(-50%) translateY(0)}
  #cv-confirm .r{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}
  #cv-confirm .r span{padding:5px 16px;border-radius:14px;border:1px solid #3a4256;font-size:12.5px}
  #cv-confirm .r #cv-ok{background:#8ab4f8;color:#0b0e14;border-color:#8ab4f8;font-weight:600}`;
  document.head.appendChild(st);
  const box = document.createElement("div"); box.id = "cv-confirm"; document.body.appendChild(box);
  window.__cvConfirmMode = "accept";
  window.confirm = (msg) => {
    if (window.__cvConfirmMode === "accept") return true;
    box.textContent = String(msg);
    const r = document.createElement("div"); r.className = "r";
    r.innerHTML = '<span>Cancel</span><span id="cv-ok">OK</span>';
    box.appendChild(r); box.classList.add("on");
    return false;
  };
});
// Click `loc`, show the app's confirmation text for `hold` ms, "press" OK, then really run it.
const confirmed = async (h, loc, hold = 2600) => {
  await installConfirm(h);
  await h.page.evaluate(() => { window.__cvConfirmMode = "show"; });
  await h.click(loc); await h.wait(hold);
  await h.hover(h.page.locator("#cv-ok"));
  const b = await h.page.locator("#cv-ok").boundingBox();
  if (b) await h.page.evaluate(([x, y]) => window.__cv.ripple(x, y), [b.x + b.width / 2, b.y + b.height / 2]);
  await h.wait(300);
  await h.page.evaluate(() => { window.__cvConfirmMode = "accept"; document.getElementById("cv-confirm").classList.remove("on"); });
  await loc.click(); await h.wait(400);
};

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
        await installConfirm(h);
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
      en: ["5 · Run for real, journaled", "Confirmed against the dry run's plan. Each row is read just before it is written: the Writes tab keeps every change with the operation that undoes it."],
      fr: ["5 · Exécution réelle, journalisée", "Confirmée face au plan du dry run. Chaque ligne est lue juste avant d'être écrite : l'onglet Writes garde chaque modification avec l'opération qui l'annule."],
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
