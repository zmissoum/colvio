// Deep dive — Relationships graph. Demo mode serves the same mocked lookups / children / N:N for
// every table, so the walk below (Account → contact → list) is chosen to show distinct maps, and
// Depth 2 is filmed on "list", where the mock really yields an extra N:N table.
const btn = (h, re) => h.page.locator("button >> visible=true").filter({ hasText: re }).first();
// A graph node is an SVG <g>: its text is the table name followed by the lookup / relationship
// name, both truncated with "…" (18 / 20 chars) — match on a short prefix.
const node = (h, prefix) => h.page.locator("svg g >> visible=true").filter({ hasText: new RegExp(`^${prefix}`) }).first();
// At 1280 px the map is wider than its pane (6 children = 1044 px): pan it sideways like a user would.
const pan = async (h, dx) => {
  await h.page.evaluate(([x, y]) => window.__cv.cursor(x, y), [900, 420]); await h.wait(400);
  await h.page.mouse.move(900, 420);
  for (let i = 0; i < 6; i++) { await h.page.mouse.wheel(dx / 6, 0); await h.wait(70); }
  await h.wait(400);
};

export default {
  key: "relationships",
  label: "Relationships",
  tagline: {
    en: "See how a table connects — parents, children and N:N, one click at a time",
    fr: "Voyez comment une table se relie — parents, enfants et N:N, clic après clic",
  },
  chapters: [
    { key: "find-table",
      en: ["1 · Find a table", "Search by display or logical name, then pick a table to draw its relationship map."],
      fr: ["1 · Trouver une table", "Cherchez par nom d'affichage ou logique, puis choisissez une table pour dessiner sa carte des relations."],
      run: async (h) => {
        await h.open("Relationships");
        await h.type(h.page.getByPlaceholder("Search entity...").first(), "acc"); await h.wait(1000);
        await h.click(h.vis("Account")); await h.wait(2400);
      } },
    { key: "read-map", pos: "top",
      en: ["2 · Read the map", "Parents (N:1) on top, N:N in the middle, children (1:N) below — each box names its lookup or relationship."],
      fr: ["2 · Lire la carte", "Parents (N:1) en haut, N:N au milieu, enfants (1:N) en bas — chaque bloc indique son lookup ou sa relation."],
      run: async (h) => {
        await h.hover(node(h, "accountparentcustomerid")); await h.wait(1300);
        await h.hover(node(h, "leadaccountleads")); await h.wait(1300);
        await h.hover(node(h, "opportunitycustomerid")); await h.wait(1200);
        await pan(h, 280);
        await h.hover(node(h, "taskregardingobjectid")); await h.wait(1400);
      } },
    { key: "system",
      en: ["3 · System links, on demand", "Owner, currency, created-by links exist on every table, so they start hidden — one click shows them, apart from your own lookups to the same tables."],
      fr: ["3 · Les liens système, à la demande", "Propriétaire, devise, créé par : présents sur toutes les tables, ils sont masqués d'office — un clic les affiche, à part de vos propres lookups vers ces tables."],
      run: async (h) => {
        await h.click(btn(h, /^Show \d+ system$/)); await h.wait(1800);
        await h.hover(node(h, "systemuserownerid")); await h.wait(1500);
        await h.hover(node(h, "transactioncurrenc")); await h.wait(1500);
      } },
    { key: "walk", pos: "top",
      en: ["4 · Click to walk the model", "Click any related table and it becomes the center — follow the data model from table to table."],
      fr: ["4 · Cliquer pour parcourir le modèle", "Cliquez une table liée : elle passe au centre — suivez le modèle de données de table en table."],
      run: async (h) => {
        await pan(h, -280);
        await h.click(node(h, "contactparentcustomerid")); await h.wait(2000);
        await h.click(node(h, "listlistcontact")); await h.wait(2200);
      } },
    { key: "depth",
      en: ["5 · Go two levels deep", "Depth 2 also pulls in the relationships of the related tables — capped at 30 tables to stay readable."],
      fr: ["5 · Descendre de deux niveaux", "Depth 2 récupère aussi les relations des tables liées — plafonné à 30 tables pour rester lisible."],
      run: async (h) => {
        await h.click(btn(h, /^Depth 1$/)); await h.wait(1800);
        await h.hover(node(h, "leadaccountleads")); await h.wait(1300);
        await h.click(btn(h, /^Depth 2$/).locator("xpath=following-sibling::*[last()]//button")); await h.wait(2200);
      } },
    { key: "refresh",
      en: ["6 · Always up to date", "Relationship metadata is cached for an hour: ↻ clears the cache and redraws the map, so a relationship created minutes ago shows up."],
      fr: ["6 · Toujours à jour", "Les métadonnées de relations restent une heure en cache : ↻ vide le cache et redessine la carte — une relation toute neuve apparaît."],
      run: async (h) => {
        await h.press("Escape"); await h.wait(300);
        await h.click(btn(h, /^Depth 2$/)); await h.wait(1500);
        await h.click(h.page.getByTitle(/^Reload this table's relationships/).first()); await h.wait(2200);
      } },
  ],
};
