// Deep dive — Change the model without XrmToolBox: edit a choice column's values (optionSetEditDemo
// keeps them in memory), create columns in bulk from a file (fed in memory through Playwright's
// file chooser — nothing read from disk), and a plug-in step's filtering attributes.
//
// Every write in Colvio asks window.confirm() first. A native dialog doesn't render in a headless
// screencast, so the page's confirm() is replaced by an on-page box that shows the app's own
// message, word for word, and answers OK once the cursor clicks it (the write runs as on an org).
// Every action below was checked against demo mode (make-deep --probe).
const btn = (h, re) => h.page.locator("button >> visible=true").filter({ hasText: re }).first();
const fieldRow = (h, logical) => h.page.locator("tbody tr >> visible=true").filter({ has: h.page.locator(`text="${logical}"`) }).first();
const optRow = (h, value) => h.page.locator(`xpath=//tr[td[1][normalize-space(.)='${value}']] >> visible=true`).first();

const armConfirm = (h) => h.page.evaluate(() => {
  if (window.__cvConfirmArmed) return;
  window.__cvConfirmArmed = true;
  const st = document.createElement("style");
  st.textContent = `#cv-confirm{position:fixed;inset:0;z-index:2147483640;background:rgba(0,0,0,.55);display:flex;justify-content:center;align-items:center;padding:175px 0 145px;box-sizing:border-box}
  #cv-confirm .d{width:560px;max-height:100%;overflow:hidden;box-sizing:border-box;background:#292a2d;color:#e8eaed;border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,.6);padding:18px 20px 14px;font:14px/1.5 "Segoe UI",system-ui,sans-serif}
  #cv-confirm .h{font-size:15px;font-weight:600;margin-bottom:10px}
  #cv-confirm .m{white-space:pre-wrap;color:#d6d8dc;font-size:13.5px}
  #cv-confirm .b{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}
  #cv-confirm .b span{padding:6px 18px;border-radius:16px;font-size:13px;border:1px solid #5f6368;cursor:pointer}
  #cv-confirm .b .ok{background:#8ab4f8;color:#202124;border-color:#8ab4f8;font-weight:600}`;
  document.head.appendChild(st);
  window.confirm = (msg) => {
    document.getElementById("cv-confirm")?.remove();
    const box = document.createElement("div"); box.id = "cv-confirm";
    box.innerHTML = '<div class="d"><div class="h">Confirm</div><div class="m"></div><div class="b"><span class="c">Cancel</span><span class="ok">OK</span></div></div>';
    box.querySelector(".m").textContent = msg;
    box.querySelector(".ok").addEventListener("click", () => box.remove());
    document.body.appendChild(box);
    return true;
  };
});
// Let the confirmation be read, then click its OK.
const confirmOk = async (h, readMs = 2600) => {
  await h.page.locator("#cv-confirm").waitFor(); await h.wait(readMs);
  await h.page.screenshot({ path: `/tmp/claude-0/-home-user-colvio/5ca096eb-f8bc-51d7-b4ef-67ab37ed8a0d/scratchpad/mw_confirm_${Date.now()}.png` });
  await h.click(h.page.locator("#cv-confirm .ok")); await h.wait(700);
};

// The sheet: 9 columns for Account, four of them with mistakes that are caught before anything is sent.
const SHEET = [
  ["Display name", "Type", "Required", "Max length", "Options", "Target", "Description"],
  ["Credit limit", "Currency", "Required", "", "", "", "Approved by finance"],
  ["Risk level", "Choice", "Recommended", "", "Low;Medium;High", "", ""],
  ["Audited", "Yes/No", "No", "", "", "", ""],
  ["Last audit", "Date", "No", "", "", "", ""],
  ["Key account manager", "Lookup", "No", "", "", "systemuser", "Who follows this account"],
  ["SAP region", "Choice", "No", "", "", "", ""],
  ["Contract owner", "Lookup", "No", "", "", "new_contract", ""],
  ["Internal notes", "Text", "No", "8000", "", "", ""],
  ["Risk level", "Choice", "No", "", "Low;High", "", ""],
].map(r => r.join(",")).join("\n");

export default {
  key: "modelwrites",
  label: "Metadata",
  tagline: {
    en: "Change the model without XrmToolBox — choice values, columns from a file, plug-in step filters",
    fr: "Modifier le modèle sans XrmToolBox — valeurs de choix, colonnes depuis un fichier, filtres de steps",
  },
  chapters: [
    { key: "edit-values",
      en: ["1 · Edit a choice column's values", "Values › ✏️ Edit values. It says what you touch: here a global choice — a change applies to every column that uses it — and each change is published right away."],
      fr: ["1 · Modifier les valeurs d'une colonne de choix", "Values › ✏️ Edit values. Il dit ce que vous touchez : ici un choix global — le changement vaut pour toutes les colonnes qui l'utilisent — et chaque changement est publié aussitôt."],
      run: async (h) => {
        await armConfirm(h);
        await h.open("Metadata");
        await h.type(h.page.getByPlaceholder("Search entity...").first(), "acc"); await h.wait(600);
        await h.click(h.vis("Account")); await h.wait(1000);
        await h.type(h.page.getByPlaceholder("Filter columns...").first(), "customer"); await h.wait(800);
        await h.click(fieldRow(h, "customertypecode").getByRole("button", { name: /^Values/ })); await h.wait(1300);
        await h.click(btn(h, /✏️ Edit values/)); await h.wait(1200);
        await h.hover(h.page.locator("text=/a change here applies to every column that uses it/ >> visible=true").first()); await h.wait(1800);
      } },
    { key: "add",
      pos: "top",
      en: ["2 · Add an option", "A label, the value optional — Dataverse then picks one with your publisher's prefix. Confirmed first, then published: the new value comes back."],
      fr: ["2 · Ajouter une option", "Un libellé, la valeur en option — Dataverse en choisit une avec le préfixe de votre éditeur. Confirmé d'abord, puis publié : la nouvelle valeur s'affiche."],
      run: async (h) => {
        await h.type(h.page.getByPlaceholder("New option label").first(), "Distributor"); await h.wait(500);
        await h.click(btn(h, /＋ Add/));
        await confirmOk(h, 2800);
        await h.hover(h.page.locator("text=/✓ Add “Distributor”/ >> visible=true").first()); await h.wait(1300);
        await h.hover(optRow(h, 100000000).locator("input")); await h.wait(1300);
      } },
    { key: "rename",
      en: ["3 · Rename one", "Type the new label: rows keep their value, every view, form and export shows the new label — and labels in other languages are kept."],
      fr: ["3 · En renommer une", "Tapez le nouveau libellé : les lignes gardent leur valeur, vues, formulaires et exports affichent le nouveau — et les libellés des autres langues sont conservés."],
      run: async (h) => {
        const inp = optRow(h, 7).locator("input");
        await h.click(inp); await inp.fill(""); await inp.pressSequentially("Press & media", { delay: 80 }); await h.wait(500);
        await h.click(optRow(h, 7).getByRole("button", { name: "Rename" }));
        await confirmOk(h, 2800);
        await h.hover(h.page.locator("text=/✓ Rename 7/ >> visible=true").first()); await h.wait(1400);
      } },
    { key: "reorder",
      en: ["4 · Reorder them", "↑ ↓ move an option, then Save order — the order forms and filters list them in; the values don't change."],
      fr: ["4 · Les réordonner", "↑ ↓ déplacent une option, puis Save order — l'ordre dans lequel formulaires et filtres les listent ; les valeurs ne changent pas."],
      run: async (h) => {
        await h.click(optRow(h, 3).getByRole("button", { name: "↑" })); await h.wait(500);
        await h.click(optRow(h, 3).getByRole("button", { name: "↑" })); await h.wait(900);
        await h.hover(h.page.locator("text=/The order changed/ >> visible=true").first()); await h.wait(900);
        await h.click(btn(h, /^Save order$/));
        await confirmOk(h, 2400);
        await h.hover(h.page.locator("text=/✓ Save the order/ >> visible=true").first()); await h.wait(1100);
        await h.hover(optRow(h, 3).locator("input")); await h.wait(1100);
      } },
    { key: "delete",
      en: ["5 · Delete one — knowing who holds it", "Before a delete, one count of the rows that hold the value. The confirmation says it, says it's a global choice, and that it can't be undone."],
      fr: ["5 · En supprimer une — en sachant qui la porte", "Avant une suppression, un comptage des lignes qui portent la valeur. La confirmation le dit, rappelle que c'est un choix global, et que c'est irréversible."],
      run: async (h) => {
        await h.click(optRow(h, 6).getByRole("button", { name: "🗑" }));
        await confirmOk(h, 3600);
        await h.hover(h.page.locator("text=/✓ Delete “Influencer”/ >> visible=true").first()); await h.wait(1500);
      } },
    { key: "columns-file",
      en: ["6 · Create columns from a file", "➕ Columns from file: one row per column — name, type, required, options, lookup target. Every row is checked first: choice without options, unknown table, length out of bounds, duplicate."],
      fr: ["6 · Créer des colonnes depuis un fichier", "➕ Columns from file : une ligne par colonne — nom, type, obligatoire, options, table cible. Chaque ligne est vérifiée d'abord : choix sans options, table inconnue, longueur hors limites, doublon."],
      run: async (h) => {
        await h.press("Escape"); await h.wait(500);
        await h.click(btn(h, /➕ Columns from file/)); await h.wait(1300);
        await h.hover(h.page.locator("select >> visible=true").first()); await h.wait(1200);
        const [chooser] = await Promise.all([h.page.waitForEvent("filechooser"), h.click(h.page.locator("label >> visible=true").filter({ hasText: /Choose a CSV \/ Excel file/ }).first())]);
        await chooser.setFiles({ name: "account_new_columns.csv", mimeType: "text/csv", buffer: Buffer.from(SHEET) });
        await h.wait(1500);
        await h.hover(h.page.locator("text=/^contoso_CreditLimit$/ >> visible=true").first()); await h.wait(1200);
        await h.hover(h.page.locator("text=/isn't in this org/ >> visible=true").first()); await h.wait(1500);
      } },
    { key: "columns-create",
      pos: "top",
      en: ["7 · …then create them in one go", "Confirmed with the list, in the unmanaged solution you picked (its prefix), one request per column: then the table is published once. Rows with errors are skipped."],
      fr: ["7 · …puis les créer d'un coup", "Confirmé avec la liste, dans la solution unmanaged choisie (son préfixe), une requête par colonne : puis la table est publiée une fois. Les lignes en erreur sont ignorées."],
      run: async (h) => {
        await h.click(btn(h, /^Create \d+ columns?$/));
        await confirmOk(h, 3600);
        await h.page.locator("text=/table published, columns reloaded/ >> visible=true").first().waitFor({ timeout: 8000 });
        await h.wait(600);
        await h.hover(h.page.locator("text=/table published, columns reloaded/ >> visible=true").first()); await h.wait(1800);
      } },
    { key: "step-filtering",
      en: ["8 · A plug-in step's filtering attributes", "Automation: an Update step's Filtering column opens its columns — tick or untick, Save confirms the diff before the step is updated."],
      fr: ["8 · Les attributs de filtrage d'un step", "Automation : la colonne Filtering d'un step Update ouvre ses colonnes — cochez, décochez, Save confirme l'écart avant de mettre le step à jour."],
      run: async (h) => {
        await h.click(btn(h, /^Close$/)); await h.wait(500);
        await h.open("Automation"); await h.wait(1200);
        const row = h.page.locator("tbody tr >> visible=true").filter({ hasText: /SapSync/ }).first();
        await h.click(row.getByRole("button", { name: /col\.$/ })); await h.wait(1200);
        const tick = (logical) => h.page.locator("label >> visible=true").filter({ has: h.page.locator(`span:text-is("${logical}")`) }).first();
        await h.click(tick("accountnumber")); await h.wait(500);
        await h.click(tick("name")); await h.wait(700);
        await h.click(btn(h, /^Save$/));
        await confirmOk(h, 3000);
        await h.hover(h.page.locator("text=/Filtering attributes of .* saved/ >> visible=true").first()); await h.wait(1600);
      } },
  ],
};
