// Deep dive — Schema (ERD). Demo tables carry per-table columns, lookups and N:N (src/schemaDemo.js).
// Cards land on a fixed grid (380 × 450 slots, filled in order), so the add order below is chosen:
// Opportunity is dragged out of Account's column before Account's card is expanded downwards.
const btn = (h, re) => h.page.locator("button >> visible=true").filter({ hasText: re }).first();
// Sidebar entries: display name, then logical name.
const table = (h, display, logical) => btn(h, new RegExp(`^${display}\\s*${logical}$`));
// A card is the SVG <g> holding its logical-name subtitle.
const card = (h, logical) => h.page.locator("svg text >> visible=true").filter({ hasText: new RegExp(`^${logical}$`) }).first().locator("xpath=..");
const column = (h, logical, label) => card(h, logical).locator("text").filter({ hasText: new RegExp(`^${label}$`) }).first();
const box = async (loc, fx = 0.5, fy = 0.5) => { const b = await loc.boundingBox(); return { x: b.x + b.width * fx, y: b.y + b.height * fy }; };
// Screen pixels per canvas unit (the SVG viewBox is letterboxed: "meet" keeps the smaller ratio).
const unit = (h) => h.page.evaluate(() => {
  const s = document.querySelector("#erd-arrow").closest("svg"), r = s.getBoundingClientRect(), v = s.viewBox.baseVal;
  return Math.min(r.width / v.width, r.height / v.height);
});

// The real mouse travels with the overlay cursor: SVG rows highlight on mouseenter, cards drag on
// mousedown/move — the overlay alone fires nothing.
const glide = async (h, p) => {
  await h.page.evaluate(([x, y]) => window.__cv.cursor(x, y), [p.x, p.y]);
  await h.page.mouse.move(p.x, p.y, { steps: 12 });
  await h.wait(650);
};
const drag = async (h, from, to, steps = 30) => {
  await glide(h, from);
  await h.page.evaluate(([x, y]) => window.__cv.ripple(x, y), [from.x, from.y]);
  await h.page.evaluate(() => { document.getElementById("cv-cur").style.transition = "none"; });
  await h.page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, e = t * t * (3 - 2 * t);
    const x = from.x + (to.x - from.x) * e, y = from.y + (to.y - from.y) * e;
    await h.page.evaluate(([x, y]) => window.__cv.cursor(x, y), [x, y]);
    await h.page.mouse.move(x, y);
    await h.wait(30);
  }
  await h.page.mouse.up();
  await h.page.evaluate(() => { document.getElementById("cv-cur").style.transition = ""; });
  await h.wait(500);
};

export default {
  key: "schema",
  label: "Schema",
  tagline: {
    en: "Draw your Dataverse data model — tables, lookups and N:N on one canvas",
    fr: "Dessinez votre modèle de données Dataverse — tables, lookups et N:N sur un seul canevas",
  },
  chapters: [
    { key: "add-tables",
      en: ["1 · Pick your tables", "Click tables in the list: each one lands on the canvas as a card listing its columns and their types, lookups on top."],
      fr: ["1 · Choisir ses tables", "Cliquez des tables dans la liste : chacune arrive sur le canevas en carte avec ses colonnes et leur type, lookups en tête."],
      run: async (h) => {
        await h.open("Schema");
        await h.click(table(h, "Account", "account")); await h.wait(900);
        await h.click(table(h, "Contact", "contact")); await h.wait(900);
        await h.click(table(h, "Opportunity", "opportunity")); await h.wait(2200);
      } },
    { key: "lookups",
      en: ["2 · Follow the lookups", "Lookup columns carry a violet reference badge and a curve to their target table — hover one to light it up with its name."],
      fr: ["2 · Suivre les lookups", "Les colonnes lookup portent un badge reference violet et une courbe vers leur table cible — survolez-en une pour l'éclairer avec son nom."],
      run: async (h) => {
        await glide(h, await box(column(h, "account", "Primary Contact"))); await h.wait(2200);
        await glide(h, await box(column(h, "contact", "Company Name"))); await h.wait(3000);
      } },
    { key: "many-to-many",
      en: ["3 · N:N relationships too", "Many-to-many relationships draw as dashed lines between card headers, labelled N:N — Lead links to both Account and Contact."],
      fr: ["3 · Les relations N:N aussi", "Les relations plusieurs-à-plusieurs se tracent en pointillés entre les en-têtes, étiquetées N:N — Lead est relié à Account et à Contact."],
      run: async (h) => {
        const search = h.page.locator('input[placeholder="Search..."] >> visible=true').first();
        await h.type(search, "lea"); await h.wait(700);
        await h.click(table(h, "Lead", "lead")); await h.wait(600);
        await search.fill(""); await h.wait(900);
        await h.hover(h.page.locator("svg text >> visible=true").filter({ hasText: /^N:N$/ }).first()); await h.wait(2200);
      } },
    { key: "add-related",
      en: ["4 · Add related tables", "The + on a card header adds the tables its lookups point to that aren't on the canvas yet — for Lead, that's User."],
      fr: ["4 · Ajouter les tables liées", "Le + d'un en-tête de carte ajoute les tables visées par ses lookups qui manquent au canevas — pour Lead, c'est User."],
      run: async (h) => {
        const plus = card(h, "lead").locator("g").filter({ hasText: /^\+$/ }).first();
        await h.click(plus); await h.wait(2200);
        await h.hover(card(h, "systemuser").locator('rect[style*="grab"]').first()); await h.wait(2600);
      } },
    { key: "drag",
      en: ["5 · Arrange the cards", "Drag a card by its header to move it anywhere on the canvas — every curve follows it."],
      fr: ["5 · Disposer les cartes", "Glissez une carte par son en-tête pour la placer où vous voulez — toutes les courbes la suivent."],
      run: async (h) => {
        const from = await box(card(h, "opportunity").locator('rect[style*="grab"]').first(), 0.4, 0.5);
        const u = await unit(h);   // Opportunity's slot (0, 450) → right of Contact (760, 0)
        await drag(h, from, { x: from.x + 760 * u, y: from.y - 450 * u });
        await h.wait(3600);
      } },
    { key: "zoom-pan",
      en: ["6 · Zoom and pan", "Drag the empty canvas to pan, scroll to zoom where the mouse points, and Fit frames every card again."],
      fr: ["6 · Zoomer et se déplacer", "Glissez le fond du canevas pour vous déplacer, la molette zoome là où pointe la souris, et Fit recadre toutes les cartes."],
      run: async (h) => {
        const a = await card(h, "account").locator("rect").nth(1).boundingBox();
        const from = { x: a.x + a.width * 0.5, y: a.y + a.height + 40 };   // Opportunity's old slot, now empty
        await drag(h, from, { x: from.x - 60, y: from.y - 170 }, 24);
        await h.wait(700);
        const p = await box(card(h, "lead").locator("rect").nth(1), 0.55, 0.5);   // a plain column: no lookup lights up
        await glide(h, p);
        for (let i = 0; i < 6; i++) { await h.page.mouse.wheel(0, -100); await h.wait(90); }
        await h.wait(1500);
        await h.click(btn(h, /^Fit$/)); await h.wait(1500);
      } },
    { key: "detail",
      en: ["7 · Choose the level of detail", "“+ 13 more” unfolds all of Account's columns; Tables folds every card down to its header for a high-level view of the model."],
      fr: ["7 · Choisir le niveau de détail", "« + 13 more » déplie toutes les colonnes d'Account ; Tables replie chaque carte sur son en-tête pour une vue d'ensemble du modèle."],
      run: async (h) => {
        await h.click(card(h, "account").locator("text").filter({ hasText: /more$/ }).first()); await h.wait(1800);
        await h.click(btn(h, /^Tables$/)); await h.wait(2200);
        await h.click(btn(h, /^Fields$/)); await h.wait(1200);
      } },
    { key: "export",
      en: ["8 · Export the diagram", "Save it as a PNG image or an SVG file, or as a Mermaid erDiagram for your docs and wikis."],
      fr: ["8 · Exporter le diagramme", "Enregistrez-le en image PNG ou en fichier SVG, ou en erDiagram Mermaid pour vos docs et wikis."],
      run: async (h) => {
        await h.hover(btn(h, /^PNG$/)); await h.wait(1100);
        await h.hover(btn(h, /^SVG$/)); await h.wait(1100);
        await h.hover(btn(h, /^Mermaid$/)); await h.wait(2300);
      } },
  ],
};
