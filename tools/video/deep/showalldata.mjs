// Deep dive — Show All Data. Demo mode loads a fixed account record (ACME France); inline
// editing, audit history and the BPF manager need a live org, so they are not filmed here.
const btn = (h, re) => h.page.locator("button >> visible=true").filter({ hasText: re }).first();
const toggle = (h, label) => h.page.locator("label >> visible=true").filter({ hasText: new RegExp(`${label}$`) }).first();
const count = (h) => h.page.locator("span >> visible=true").filter({ hasText: /^\d+\/\d+ columns$/ }).first();
const gridValue = (h, re) => h.page.locator('div[style*="grid-template-columns"] span >> visible=true').filter({ hasText: re }).first();

export default {
  key: "showalldata",
  label: "Show All Data",
  tagline: {
    en: "Every column of a record — including the ones the form hides",
    fr: "Toutes les colonnes d'un enregistrement — même celles que le formulaire masque",
  },
  chapters: [
    { key: "inspect",
      en: ["1 · Inspect any record", "Paste a D365 record URL or table/GUID and hit Inspect: every filled column, with its logical name, label and type."],
      fr: ["1 · Inspecter un enregistrement", "Collez l'URL d'un enregistrement D365 ou table/GUID puis Inspect : chaque colonne renseignée, avec nom logique, libellé et type."],
      run: async (h) => {
        await h.open("Show All Data");
        const input = h.page.getByPlaceholder(/demo mode|entity\/GUID/).first();
        await h.click(input);
        await input.fill("account/a1b2c3d4-e5f6-7890-abcd-ef1234567890"); await h.wait(1100);   // a paste, not typing
        await h.click(btn(h, /Inspect$/)); await h.wait(2400);
        await h.hover(h.vis("new_sapid")); await h.wait(1300);
        await h.hover(h.vis("Money")); await h.wait(1500);
      } },
    { key: "find-column",
      en: ["2 · Find a column", "Type part of a logical name or label: the grid narrows as you type, with a live column count."],
      fr: ["2 · Trouver une colonne", "Tapez une partie d'un nom logique ou d'un libellé : la grille se réduit à la frappe, avec le décompte des colonnes."],
      run: async (h) => {
        await h.type(h.page.getByPlaceholder("Filter columns...").first(), "address"); await h.wait(1800);
        await h.hover(count(h)); await h.wait(1800);
      } },
    { key: "empty-columns",
      en: ["3 · Show the empty columns too", "Tick Empty columns to list every column of the table, filled or not — the blank ones show a dash."],
      fr: ["3 · Afficher aussi les colonnes vides", "Cochez Empty columns pour lister toutes les colonnes de la table, renseignées ou non — les vides affichent un tiret."],
      run: async (h) => {
        await h.click(toggle(h, "Empty columns")); await h.wait(2000);
        await h.hover(h.vis("address1_line1")); await h.wait(1200);
        await h.hover(count(h)); await h.wait(1600);
      } },
    { key: "choices",
      en: ["4 · Labels, not codes", "Choice columns show their label rather than the stored number, with a green type badge — and Active / Inactive in color."],
      fr: ["4 · Des libellés, pas des codes", "Les colonnes de choix affichent leur libellé plutôt que la valeur stockée, avec un badge vert — et Active / Inactive en couleur."],
      run: async (h) => {
        const f = h.page.getByPlaceholder("Filter columns...").first();
        await h.click(f); await f.fill(""); await f.pressSequentially("code", { delay: 90 }); await h.wait(1600);
        await h.hover(h.vis("Manufacturing")); await h.wait(1300);
        await h.hover(h.vis("OptionSet")); await h.wait(1200);
        await h.hover(h.vis("● Active")); await h.wait(1600);
      } },
    { key: "custom-only",
      en: ["5 · Custom columns only", "Custom only keeps the columns your own publishers added — Microsoft's msdyn_ or adx_ columns stay out."],
      fr: ["5 · Uniquement les colonnes custom", "Custom only garde les colonnes ajoutées par vos propres éditeurs — les colonnes Microsoft msdyn_ ou adx_ sont écartées."],
      run: async (h) => {
        const f = h.page.getByPlaceholder("Filter columns...").first();
        await h.click(f); await f.fill(""); await h.wait(1000);
        await h.click(toggle(h, "Custom only")); await h.wait(2000);
        await h.hover(h.vis("new_siretcode")); await h.wait(1300);
        await h.hover(count(h)); await h.wait(1500);
      } },
    { key: "copy",
      en: ["6 · Copy anything", "Click any value to copy it, copy the record's GUID, or the whole record as JSON in one click."],
      fr: ["6 · Tout copier", "Cliquez une valeur pour la copier, copiez le GUID de l'enregistrement, ou tout l'enregistrement en JSON en un clic."],
      run: async (h) => {
        await h.page.context().grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
        await h.click(toggle(h, "Custom only")); await h.wait(1200);
        await h.click(gridValue(h, /^SAP-001$/)); await h.wait(1500);
        const guid = h.page.locator("span >> visible=true").filter({ hasText: /^a1b2c3d4-e5f6-7890-abcd-ef1234567890$/ }).first();
        await h.click(guid.locator("xpath=following-sibling::button[1]")); await h.wait(1500);
        await h.click(btn(h, /^Copy JSON$/)); await h.wait(500);
      } },
  ],
};
