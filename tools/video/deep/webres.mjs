// Deep dive — Web Resources. The demo org (src/webResourcesDemo.js) holds a handful of Contoso
// scripts, a style sheet, an HTML page, an SVG, a managed connector and a hidden Microsoft library;
// edits are kept in memory for the page load. The app's own window.confirm() (save / publish) is
// shown in an on-screen replica — native dialogs don't render in a screencast: the first click is
// answered Cancel while the replica shows the real text, then the same button is clicked again and
// answered OK.
const btn = (h, re) => h.page.locator("button >> visible=true").filter({ hasText: re }).first();
const res = (h, name) => h.page.locator("button >> visible=true").filter({ hasText: name }).first();
const kinds = (h) => h.page.locator("select >> visible=true").filter({ has: h.page.locator('option[value="all"]') }).filter({ hasText: "All kinds" }).first();
const toggle = (h, label) => h.page.locator("label >> visible=true").filter({ hasText: new RegExp(`${label}$`) }).first();

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
        await installConfirm(h);
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
        await h.hover(h.page.locator("textarea >> visible=true").first()); await h.wait(1200);
      } },
    { key: "edit",
      en: ["5 · Edit", "Change the code in place: a dot marks unsaved changes, and Revert brings back the version you opened."],
      fr: ["5 · Modifier", "Modifiez le code sur place : un point signale les changements non enregistrés, et Revert rétablit la version ouverte."],
      run: async (h) => {
        await h.press("End");
        await h.page.keyboard.press("Enter");
        await h.page.keyboard.type('      formContext.getAttribute("new_sapid").setValue(a.new_sapid);', { delay: 45 });
        await h.page.locator("textarea >> visible=true").first().evaluate(el => { el.scrollLeft = 0; });
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
    { key: "managed",
      en: ["7 · Managed? You're told", "A resource from a managed solution says so: your change is an unmanaged layer that the solution's next import may overwrite."],
      fr: ["7 · Managée ? Vous êtes prévenu", "Une ressource issue d'une solution managée le signale : votre modification est une couche non managée que le prochain import de la solution peut écraser."],
      run: async (h) => {
        await h.click(res(h, "contoso_/sap/connector.js")); await h.wait(1500);
        await h.hover(h.page.getByText(/From a managed solution/).first()); await h.wait(2200);
      } },
    { key: "download",
      en: ["8 · Download, or open it in D365", "Any resource downloads as its file; Open shows the published version in Dynamics 365."],
      fr: ["8 · Télécharger, ou ouvrir dans D365", "Chaque ressource se télécharge sous forme de fichier ; Open affiche la version publiée dans Dynamics 365."],
      run: async (h) => {
        await h.click(res(h, "new_/css/theme.css")); await h.wait(1300);
        await h.hover(btn(h, /Download$/)); await h.wait(1400);
        await h.hover(h.page.locator("a >> visible=true").filter({ hasText: /^Open ↗$/ }).first()); await h.wait(1500);
      } },
  ],
};
