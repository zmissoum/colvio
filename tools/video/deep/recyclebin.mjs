// Deep dive — Recycle Bin. Every action below was checked against demo mode (make-deep --probe).
const btn = (h, re) => h.page.locator("button >> visible=true").filter({ hasText: re }).first();
const row = (h, name) => h.page.locator("tbody tr >> visible=true").filter({ has: h.page.locator(`td:text-is("${name}")`) }).first();
const tick = (h, name) => h.click(row(h, name).locator("input[type=checkbox]"));
const th = (h, label) => h.page.locator("th >> visible=true").filter({ hasText: new RegExp(`^${label}$`) }).first();

export default {
  key: "recyclebin",
  label: "Recycle Bin",
  tagline: {
    en: "See what was deleted, by whom and when — and bring it back with a real server-side restore",
    fr: "Voyez ce qui a été supprimé, par qui et quand — et récupérez-le avec une vraie restauration côté serveur",
  },
  chapters: [
    { key: "tables",
      en: ["1 · Only restorable tables", "Retention comes from the org's recycle-bin setting, and the table picker lists only the tables enabled for restore on this environment."],
      fr: ["1 · Uniquement les tables restaurables", "La rétention vient du paramètre corbeille de l'org, et le sélecteur ne liste que les tables activées pour la restauration sur cet environnement."],
      run: async (h) => {
        await h.open("Recycle Bin"); await h.wait(900);
        await h.hover(h.page.getByText(/Recycle bin enabled/).first()); await h.wait(1300);
        await h.hover(h.page.getByText(/tables enabled for restore/).first()); await h.wait(1100);
        await h.click(h.page.getByPlaceholder(/Search a table/)); await h.wait(2000);
      } },
    { key: "deleted-list",
      en: ["2 · Who deleted what, and when", "Pick a table: its deleted records, with who deleted them and when (from the audit log), plus who created and last modified them."],
      fr: ["2 · Qui a supprimé quoi, et quand", "Choisissez une table : ses enregistrements supprimés, avec qui les a supprimés et quand (journal d'audit), et qui les a créés et modifiés en dernier."],
      run: async (h) => {
        await h.click(btn(h, /^Account \(account\)$/)); await h.wait(1400);
        await h.hover(th(h, "Deleted by")); await h.wait(900);
        await h.hover(th(h, "Deleted on")); await h.wait(900);
        await h.hover(th(h, "Modified by")); await h.wait(800);
        await h.hover(th(h, "Created by")); await h.wait(1200);
      } },
    { key: "paging", pos: "top",
      en: ["3 · Page through a mass delete", "After a mass delete, the bin is read one page at a time — 100 to 1,000 rows — with Prev / Next; only the current page is loaded."],
      fr: ["3 · Paginer une suppression de masse", "Après une suppression en masse, la corbeille se lit page par page — de 100 à 1 000 lignes — avec Prev / Next ; seule la page affichée est chargée."],
      run: async (h) => {
        await h.hover(h.vis("# D365 Integration")); await h.wait(900);
        await h.select(h.page.locator("select >> visible=true").filter({ has: h.page.locator('option[value="1000"]') }).first(), "100"); await h.wait(1000);
        await h.click(btn(h, /Next →/)); await h.wait(1000);
        await h.hover(h.vis("Fourth Coffee")); await h.wait(1600);
        await h.click(btn(h, /← Prev/)); await h.wait(1000);
      } },
    { key: "search",
      en: ["4 · Find a record by name", "The name search runs in Dataverse, not on the loaded page — Fourth Coffee, on page 2, comes straight up."],
      fr: ["4 · Retrouver un enregistrement par son nom", "La recherche par nom s'exécute dans Dataverse, pas sur la page chargée — Fourth Coffee, en page 2, remonte directement."],
      run: async (h) => {
        await h.type(h.page.getByPlaceholder(/Find by name/), "coffee"); await h.wait(300);
        await h.press("Enter"); await h.wait(1200);
        await h.hover(h.vis("Fourth Coffee")); await h.wait(1500);
      } },
    { key: "export",
      en: ["5 · Export before you restore", "CSV or Excel export of the current page — names, who deleted, modified and created each record, with dates and IDs — as an evidence list."],
      fr: ["5 · Exporter avant de restaurer", "Export CSV ou Excel de la page affichée — noms, qui a supprimé, modifié et créé chaque enregistrement, avec dates et ID — comme liste de preuves."],
      run: async (h) => {
        const s = h.page.getByPlaceholder(/Find by name/);
        await h.click(s); await s.fill(""); await h.press("Enter"); await h.wait(900);
        await h.hover(btn(h, /CSV$/)); await h.wait(1000);
        await h.hover(btn(h, /Excel$/)); await h.wait(1400);
      } },
    { key: "restore",
      en: ["6 · Restore, server-side", "Tick records and Restore: Dataverse's own Restore action brings each one back by its primary key, and it leaves the bin."],
      fr: ["6 · Restaurer, côté serveur", "Cochez des enregistrements puis Restore : l'action Restore de Dataverse les rétablit par clé primaire, et ils quittent la corbeille."],
      run: async (h) => {
        await tick(h, "Contoso Pharmaceuticals"); await h.wait(700);
        await h.click(btn(h, /Restore \(1\)/)); await h.wait(1800);
        await h.hover(h.page.getByText(/1\/1 restored/).first()); await h.wait(1500);
      } },
    { key: "failures",
      en: ["7 · Failures, explained", "When Dataverse refuses a restore — here a live record already uses the same alternate key — Colvio reports it per record, with the fix."],
      fr: ["7 · Les échecs, expliqués", "Quand Dataverse refuse une restauration — ici, un enregistrement actif utilise déjà la même clé alternative — Colvio le signale par enregistrement, avec la solution."],
      run: async (h) => {
        await tick(h, "Northwind Traders"); await h.wait(400);
        await tick(h, "Wide World Importers"); await h.wait(600);
        await h.click(btn(h, /Restore \(2\)/)); await h.wait(2200);
        await h.hover(h.page.getByText(/same alternate key values/).first()); await h.wait(2600);
      } },
    { key: "limitations", pos: "top",
      en: ["8 · Microsoft's limits, spelled out", "Records deleted before the setting was on, unsupported tables, cascade order, key conflicts: the platform's limitations sit under the list."],
      fr: ["8 · Les limites Microsoft, en clair", "Suppressions antérieures à l'activation, tables non supportées, ordre des cascades, conflits de clés : les limitations de la plateforme sont rappelées sous la liste."],
      run: async (h) => {
        await h.hover(h.page.getByText(/Platform limitations \(Microsoft\)/).first()); await h.wait(4200);
      } },
  ],
};
