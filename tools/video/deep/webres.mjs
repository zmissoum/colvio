// Deep dive — Web Resources. The demo org (src/webResourcesDemo.js) holds a handful of Contoso
// scripts, a style sheet, an HTML page, an SVG, a managed connector and a hidden Microsoft library;
// edits are kept in memory for the page load. Save / publish is confirmed in the app's own dialog:
// its text stays on screen, then the cursor clicks OK. One script is shared with a colleague:
// Alex Baker's save of new_/scripts/opportunity.js lands right before the first save of it in a
// page load (a deterministic rule of the demo org), so its Save & publish meets the version
// conflict a live save meets when someone saved meanwhile — refused on the ETag, then reloaded.
const btn = (h, re) => h.page.locator("button >> visible=true").filter({ hasText: re }).first();
const res = (h, name) => h.page.locator("button >> visible=true").filter({ hasText: name }).first();
const kinds = (h) => h.page.locator("select >> visible=true").filter({ has: h.page.locator('option[value="all"]') }).filter({ hasText: "All kinds" }).first();
const toggle = (h, label) => h.page.locator("label >> visible=true").filter({ hasText: new RegExp(`${label}$`) }).first();
const editor = (h) => h.page.locator("textarea >> visible=true").first();
// Put the editor's selection on a piece of its text (as a click / drag would): the cursor after it,
// or the whole lines from it to the end of the line where `to` starts.
const caretAfter = (h, piece) => editor(h).evaluate((el, p) => { const i = el.value.indexOf(p) + p.length; el.focus(); el.setSelectionRange(i, i); }, piece);
const selectLines = (h, from, to) => editor(h).evaluate((el, [a, b]) => {
  const i = el.value.lastIndexOf("\n", el.value.indexOf(a)) + 1, j = el.value.indexOf("\n", el.value.indexOf(b));
  el.focus(); el.setSelectionRange(i, j); el.scrollLeft = 0;
}, [from, to]);

// Click `loc`, leave the app's confirmation text on screen for `hold` ms, click OK.
const confirmed = (h, loc, hold = 2600) => h.confirmed(loc, hold);

export default {
  key: "webres",
  label: "Web Resources",
  tagline: {
    en: "Every script, style and page of the org — searched, edited and published from one screen",
    fr: "Chaque script, style et page de l'org — recherchés, modifiés et publiés depuis un seul écran",
  },
  chapters: [
    { key: "list",
      en: ["1 · Every web resource, by kind", "Scripts, styles, HTML, images — filter by kind. Microsoft's own libraries stay hidden until you ask; M marks a managed solution."],
      fr: ["1 · Chaque web resource, par type", "Scripts, styles, HTML, images — filtrez par type. Les bibliothèques de Microsoft restent masquées jusqu'à ce que vous les demandiez ; M signale une solution managée."],
      run: async (h) => {
        await h.open("Web Resources"); await h.wait(1300);
        await h.select(kinds(h), "3"); await h.wait(1300);
        await h.click(toggle(h, "Microsoft & hidden")); await h.wait(1200);
        await h.hover(res(h, "msdyn_/Sales")); await h.wait(1600);
      } },
    { key: "open",
      en: ["2 · Open one in the editor", "Click a resource: its content, decoded, with its kind, display name and size."],
      fr: ["2 · L'ouvrir dans l'éditeur", "Cliquez une ressource : son contenu, décodé, avec son type, son nom d'affichage et sa taille."],
      run: async (h) => {
        await h.click(toggle(h, "Microsoft & hidden")); await h.wait(500);
        await h.select(kinds(h), "all"); await h.wait(800);
        await h.click(res(h, "new_/scripts/account.js")); await h.wait(1500);
        await h.hover(h.page.getByText(/^JavaScript · Account form scripts/).first()); await h.wait(1800);
      } },
    { key: "search",
      en: ["3 · Search inside every script", "Type a column name: every line that uses it, in scripts and HTML pages alike — what Dataverse's dependency tracking never sees."],
      fr: ["3 · Chercher dans chaque script", "Tapez le nom d'une colonne : chaque ligne qui l'utilise, dans les scripts comme dans les pages HTML — ce que le suivi des dépendances de Dataverse ne voit jamais."],
      run: async (h) => {
        await h.type(h.page.getByPlaceholder(/Search in contents/).first(), "new_sapid"); await h.wait(500);
        await h.click(btn(h, /^Search$/)); await h.wait(1600);
        await h.hover(h.page.getByText(/lines? in \d+ resources?/).first()); await h.wait(1800);
      } },
    { key: "hit",
      en: ["4 · Straight to the line", "Click a hit: the resource opens with that line selected — here the contact form script that reads new_sapid."],
      fr: ["4 · Directement à la ligne", "Cliquez un résultat : la ressource s'ouvre avec cette ligne sélectionnée — ici le script du formulaire contact qui lit new_sapid."],
      run: async (h) => {
        await h.click(h.page.locator("div >> visible=true").filter({ hasText: /^new_\/scripts\/contact\.js :\d+$/ }).first()); await h.wait(1800);
        await h.hover(editor(h)); await h.wait(1200);
      } },
    { key: "edit",
      en: ["5 · Edit", "Change the code in place: a dot marks unsaved changes, and Revert brings back the version you opened."],
      fr: ["5 · Modifier", "Modifiez le code sur place : un point signale les changements non enregistrés, et Revert rétablit la version ouverte."],
      run: async (h) => {
        await h.press("End");
        await h.page.keyboard.press("Enter");
        await h.page.keyboard.type('      formContext.getAttribute("new_sapid").setValue(a.new_sapid);', { delay: 45 });
        await editor(h).evaluate(el => { el.scrollLeft = 0; });
        await h.wait(800);
        await h.hover(btn(h, /^Revert$/)); await h.wait(1500);
      } },
    { key: "publish",
      en: ["6 · Save & publish", "Asked first, with the new size and what a publish means: every form that loads it gets this version at once, for every user. Then saved and published."],
      fr: ["6 · Enregistrer et publier", "Confirmation d'abord, avec la nouvelle taille et ce qu'une publication implique : chaque formulaire qui la charge reçoit cette version aussitôt, pour tous les utilisateurs. Puis enregistré et publié."],
      run: async (h) => {
        await confirmed(h, btn(h, /^Save & publish$/), 3200);
        await h.wait(1600);
        await h.hover(h.page.getByText(/Saved and published/).first()); await h.wait(1300);
        await h.hover(h.page.getByText(/^JavaScript · Contact form scripts/).first()); await h.wait(1400);
      } },
    { key: "conflict",
      en: ["7 · Someone saved it meanwhile", "Every save is conditional on the version you opened. A colleague saved this script while you edited it: Dataverse refuses yours, and Colvio says who and when — nothing is overwritten."],
      fr: ["7 · Quelqu'un l'a enregistrée entre-temps", "Chaque enregistrement est conditionné à la version ouverte. Un collègue a enregistré ce script pendant votre modification : Dataverse refuse la vôtre, et Colvio dit qui et quand — rien n'est écrasé."],
      run: async (h) => {
        await h.click(res(h, "new_/scripts/opportunity.js")); await h.wait(1300);
        await caretAfter(h, 'setRequiredLevel("required");');
        await h.page.keyboard.press("Enter");
        await h.page.keyboard.type('    formContext.getAttribute("closeprobability").setRequiredLevel("recommended");', { delay: 30 });
        await editor(h).evaluate(el => { el.scrollLeft = 0; });
        await confirmed(h, btn(h, /^Save & publish$/), 2000);
        await h.wait(1200);
        await h.hover(h.page.getByText(/^Not saved: /).first()); await h.wait(2600);
      } },
    { key: "reload",
      en: ["8 · Reload, or overwrite", "↻ Reload opens the server's version — Alex Baker's, with his OnSave rule — to redo your change on top of it. ⚠ Overwrite would replace his version with yours."],
      fr: ["8 · Recharger, ou écraser", "↻ Reload ouvre la version du serveur — celle d'Alex Baker, avec sa règle OnSave — pour y refaire votre modification. ⚠ Overwrite remplacerait sa version par la vôtre."],
      run: async (h) => {
        await h.hover(btn(h, /⚠ Overwrite$/)); await h.wait(1300);
        await confirmed(h, btn(h, /↻ Reload$/), 1600);                  // reloading discards your edit: asked first
        await h.wait(1200);
        await h.hover(h.page.getByText(/^JavaScript · Opportunity form scripts/).first()); await h.wait(1400);
        await selectLines(h, "// Deals above 1M", "setValue(value > 1000000)"); await h.wait(2000);
      } },
    { key: "managed",
      en: ["9 · Managed? You're told", "A resource from a managed solution says so: your change is an unmanaged layer that the solution's next import may overwrite."],
      fr: ["9 · Managée ? Vous êtes prévenu", "Une ressource issue d'une solution managée le signale : votre modification est une couche non managée que le prochain import de la solution peut écraser."],
      run: async (h) => {
        await h.click(res(h, "contoso_/sap/connector.js")); await h.wait(1500);
        await h.hover(h.page.getByText(/From a managed solution/).first()); await h.wait(2200);
      } },
    { key: "download",
      en: ["10 · Download, or open it in D365", "Any resource downloads as its file; Open shows the published version in Dynamics 365."],
      fr: ["10 · Télécharger, ou ouvrir dans D365", "Chaque ressource se télécharge sous forme de fichier ; Open affiche la version publiée dans Dynamics 365."],
      run: async (h) => {
        await h.click(res(h, "new_/css/theme.css")); await h.wait(1300);
        await h.hover(btn(h, /Download$/)); await h.wait(1400);
        await h.hover(h.page.locator("a >> visible=true").filter({ hasText: /^Open ↗$/ }).first()); await h.wait(1500);
      } },
  ],
};
