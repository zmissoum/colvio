// Deep dive — API Tester. Every action below was checked against demo mode (make-deep --probe).
// Every request tab stays mounted (hidden) — always target visible elements.
const btn = (h, re) => h.page.locator("button >> visible=true").filter({ hasText: re }).first();
const pathInput = (h) => h.page.getByPlaceholder("accounts?$select=name&$top=5").locator("visible=true").first();
const lastValue = (h) => h.page.getByPlaceholder("value", { exact: true }).locator("visible=true").last();
const send = (h) => btn(h, /Send$/);  // label is "⚡ Send" (icon + space)
const openTemplate = async (h, re) => { await h.click(btn(h, /Templates \(\d+\)/)); await h.wait(800); await h.click(btn(h, re)); await h.wait(700); };
// fill() the start, then type the end: reads as typing without spelling out a long URL.
const typeTail = async (h, loc, head, tail) => { await h.click(loc); await loc.fill(head); await loc.pressSequentially(tail, { delay: 75 }); };

export default {
  key: "apitester",
  label: "API Tester",
  tagline: {
    en: "Call the Dataverse Web API from the browser — no token, no Postman setup",
    fr: "Appelez l'API Web Dataverse depuis le navigateur — sans jeton, sans configurer Postman",
  },
  chapters: [
    { key: "template",
      en: ["1 · Start from a template", "Seven ready-made requests — WhoAmI, create, upsert by alternate key, delete… One click fills method, path and body."],
      fr: ["1 · Partir d'un modèle", "Sept requêtes prêtes — WhoAmI, création, upsert par clé alternative, suppression… Un clic remplit méthode, chemin et corps."],
      run: async (h) => {
        await h.open("API Tester"); await h.wait(700);
        await h.click(btn(h, /Templates \(\d+\)/)); await h.wait(1500);
        await h.click(btn(h, "WhoAmI()")); await h.wait(700);
        await h.click(send(h)); await h.wait(1900);
      } },
    { key: "query",
      en: ["2 · Write any query", "Type the path after /api/data/v9.2/ — $select, $filter, $top… Ctrl+Enter sends it: status, time, size and pretty-printed JSON."],
      fr: ["2 · Écrire n'importe quelle requête", "Tapez le chemin après /api/data/v9.2/ — $select, $filter, $top… Ctrl+Entrée l'envoie : statut, durée, taille et JSON indenté."],
      run: async (h) => {
        await typeTail(h, pathInput(h), "accounts?$select=name,address1_city,revenue", "&$filter=revenue gt 20000000&$top=3"); await h.wait(400);
        await h.press("Control+Enter"); await h.wait(1000);
        await h.scroll(260); await h.wait(1700);
      } },
    { key: "headers",
      en: ["3 · Headers, sent and received", "Add any header — here Prefer asks for formatted values, which appear next to the raw ones. The Headers tab shows what came back."],
      fr: ["3 · Les en-têtes, envoyés et reçus", "Ajoutez n'importe quel en-tête — ici Prefer demande les valeurs formatées, affichées près des valeurs brutes. L'onglet Headers montre la réponse."],
      run: async (h) => {
        await h.scroll(-400);
        await h.click(btn(h, /Add$/));
        await typeTail(h, h.page.getByPlaceholder("Header name").locator("visible=true").last(), "", "Prefer");
        await typeTail(h, lastValue(h), "odata.include-annotations=", '"*"'); await h.wait(300);
        await h.click(send(h)); await h.wait(700);
        await h.scroll(300); await h.wait(1700);
        await h.click(btn(h, /^Headers \(\d+\)$/)); await h.wait(1700);
      } },
    { key: "json-editor",
      en: ["4 · A JSON editor that checks as you type", "Line numbers and live validation: a syntax error names its line — here an unquoted key on line 4. Fix it and the body is valid again."],
      fr: ["4 · Un éditeur JSON qui vérifie en direct", "Numéros de ligne et validation en direct : l'erreur indique sa ligne — ici une clé sans guillemets, ligne 4. Corrigée, le corps redevient valide."],
      run: async (h) => {
        await openTemplate(h, /Create record$/);
        const ta = h.page.locator("textarea >> visible=true").first();
        await typeTail(h, ta, '{\n  "name": "Northwind Traders",\n  "address1_city": "Lyon",', "\n  revenue: 2500000\n}"); await h.wait(2000);
        await h.page.keyboard.press("Control+Home");
        for (let i = 0; i < 3; i++) await h.page.keyboard.press("ArrowDown");
        await h.page.keyboard.press("Home");
        await h.page.keyboard.press("Shift+End"); await h.wait(400);
        await h.page.keyboard.type('  "revenue": 2500000', { delay: 65 }); await h.wait(1600);
      } },
    { key: "create", pos: "top",
      en: ["5 · Create a record", "204 No Content, with the new record's URL in OData-EntityId — or, with Prefer: return=representation, 201 and the record itself."],
      fr: ["5 · Créer un enregistrement", "204 No Content, avec l'URL du nouvel enregistrement dans OData-EntityId — ou, avec Prefer: return=representation, 201 et l'enregistrement complet."],
      run: async (h) => {
        await h.click(send(h)); await h.wait(700);
        await h.scroll(500); await h.wait(1500);
        await h.scroll(-600);
        await typeTail(h, lastValue(h), "return=", "representation"); await h.wait(200);
        await h.click(send(h)); await h.wait(700);
        await h.scroll(500); await h.wait(400);
        await h.click(btn(h, /^Body$/)); await h.wait(1600);
      } },
    { key: "delete",
      en: ["6 · DELETE asks twice", "The first click only arms a red Confirm button — no accidental deletes. Errors are shown raw, with Dataverse's own code and message."],
      fr: ["6 · DELETE demande confirmation", "Le premier clic ne fait qu'armer un bouton Confirm rouge — pas de suppression par mégarde. Les erreurs s'affichent brutes, code et message Dataverse."],
      run: async (h) => {
        await h.scroll(-800);
        await openTemplate(h, /Delete record$/);
        await h.click(send(h)); await h.wait(1200);
        await h.click(btn(h, /Confirm DELETE/)); await h.wait(2100);
      } },
    { key: "same-origin",
      en: ["7 · Your org, and nothing else", "Requests only go to the Dynamics 365 org you're on: any other host is refused before anything is sent."],
      fr: ["7 · Votre org, rien d'autre", "Les requêtes ne partent que vers l'org Dynamics 365 ouverte : tout autre hôte est refusé avant le moindre envoi."],
      run: async (h) => {
        await h.select(h.page.locator("select >> visible=true").filter({ has: h.page.locator('option[value="PATCH"]') }).first(), "GET");
        await typeTail(h, pathInput(h), "https://api.example.com/", "v1/customers"); await h.wait(300);
        await h.click(send(h)); await h.wait(2300);
      } },
    { key: "history",
      en: ["8 · History, values blanked", "The last 50 requests, one click to reload. $filter and body values are blanked before saving — the structure stays, ready to refill."],
      fr: ["8 · Historique, valeurs masquées", "Les 50 dernières requêtes, rechargées en un clic. Les valeurs du $filter et du corps sont effacées avant sauvegarde — la structure reste, à compléter."],
      run: async (h) => {
        await h.click(btn(h, /History \(\d+\)/)); await h.wait(900);
        await h.hover(btn(h, /\$filter=\.\.\./)); await h.wait(1500);
        await h.click(btn(h, /^POST201/)); await h.wait(2100);
      } },
    { key: "tabs-curl",
      en: ["9 · Tabs and cURL", "Copy any request as cURL — a placeholder stands in for your session cookie. Open more tabs: each keeps its own request and response."],
      fr: ["9 · Onglets et cURL", "Copiez une requête en cURL — un espace réservé remplace votre cookie de session. Ouvrez d'autres onglets : chacun garde sa requête et sa réponse."],
      run: async (h) => {
        await h.page.context().grantPermissions(["clipboard-read", "clipboard-write"]); // "Copied" needs clipboard access in the headless browser
        await h.click(btn(h, /Copy as cURL/)); await h.wait(900);
        await h.click(btn(h, /New$/)); await h.wait(600);
        await h.click(send(h)); await h.wait(1000);
        await h.dblclick(h.vis("Request 2"));
        await h.page.keyboard.type("Top accounts", { delay: 75 });
        await h.press("Enter"); await h.wait(300);
        await h.click(h.vis("Request 1")); await h.wait(1200);
        await h.click(h.vis("Top accounts")); await h.wait(1500);
      } },
  ],
};
