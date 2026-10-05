// Deep dive — Teams. Every action below was checked against demo mode (make-deep --probe).
// Demo note: the demo access team has no members and no roles (true to life — access teams are
// per-record sharing lists), so it is shown in the list but not opened.
const btn = (h, re) => h.page.locator("button >> visible=true").filter({ hasText: re }).first();
// Typed filter text would get the browser's red spell-check squiggles on film ("svc", "bruno"…):
// switch spell-check off page-wide (inherited by every input) — cosmetic, the app is untouched.
const noSpell = (h) => h.page.evaluate(() => { document.body.spellcheck = false; });

export default {
  key: "teams",
  label: "Teams",
  tagline: {
    en: "Owner, Entra group and access teams — their members and the security roles they pass on",
    fr: "Équipes propriétaires, de groupe Entra et d'accès — leurs membres et les rôles de sécurité qu'elles transmettent",
  },
  chapters: [
    { key: "types",
      en: ["1 · Every team, by type", "Owner and Entra group teams, each badged with its type and filtered in one click — BU default teams are sorted to the end."],
      fr: ["1 · Toutes les équipes, par type", "Équipes propriétaires et de groupe Entra, chacune badgée selon son type et filtrable en un clic — les équipes par défaut des BU en fin de liste."],
      run: async (h) => {
        await noSpell(h); await h.open("Teams"); await h.wait(1300);
        await h.click(btn(h, /^Owner \(\d+\)$/)); await h.wait(1600);
        await h.click(btn(h, /^Entra \(\d+\)$/)); await h.wait(1600);
        await h.click(btn(h, /^All \(\d+\)$/)); await h.wait(1200);
      } },
    { key: "search",
      en: ["2 · Search name, BU or administrator", "One search box across team name, description, business unit and administrator."],
      fr: ["2 · Rechercher par nom, BU ou administrateur", "Une seule recherche sur le nom de l'équipe, sa description, sa business unit et son administrateur."],
      run: async (h) => {
        const s = h.page.getByPlaceholder("Search name, BU, administrator…");
        await h.type(s, "provisioning"); await h.wait(1800);          // matches the team's description
        await s.fill(""); await h.wait(400);
        await s.pressSequentially("Sales EU", { delay: 80 }); await h.wait(1900); // matches its business unit
      } },
    { key: "owner-team",
      en: ["3 · Owner team: the roles its members inherit", "BU, administrator, creation date — and the security roles every member inherits, which never show in the user's own role list."],
      fr: ["3 · Équipe propriétaire : les rôles hérités", "BU, administrateur, date de création — et les rôles de sécurité dont hérite chaque membre, absents de la liste de rôles propre à l'utilisateur."],
      run: async (h) => {
        await h.click(btn(h, /^Sales Managers/)); await h.wait(600);
        await h.page.getByPlaceholder("Search name, BU, administrator…").fill(""); await h.wait(1600); // list back in full for the next chapters
        await h.hover(h.vis("Sales Manager")); await h.wait(1500);
        await h.hover(h.vis("Bruno Lefebvre")); await h.wait(1100);
        await h.hover(h.page.getByTitle("Open this team in D365 (manage members and roles there)")); await h.wait(1200);
      } },
    { key: "entra-team",
      en: ["4 · Entra group team", "Membership lives in Entra ID: a new group member shows up after their next access. Copy the group's Object ID for the Entra admin center."],
      fr: ["4 · Équipe de groupe Entra", "Les membres sont gérés dans Entra ID : un nouveau membre apparaît après son prochain accès. Copiez l'Object ID du groupe pour le centre d'admin Entra."],
      run: async (h) => {
        await h.click(btn(h, /^SG-D365-PROD-Users/)); await h.wait(2300);
        await h.hover(h.vis("Basic User")); await h.wait(1200);              // roles carried by the group team
        await h.hover(h.vis("ENTRA GROUP OBJECT ID")); await h.wait(700);
        await h.click(h.page.getByTitle(/Copy the group's object id/));
        await h.hover(h.vis("ENTRA GROUP OBJECT ID"));                      // cursor off the "✓" (shown 1.5 s after the click)
      } },
    { key: "members",
      en: ["5 · Filter and export members", "Each member's access mode, license (CAL) type and status — filter the list, export it to CSV or Excel."],
      fr: ["5 · Filtrer et exporter les membres", "Mode d'accès, type de licence (CAL) et statut de chaque membre — filtrez la liste, exportez-la en CSV ou Excel."],
      run: async (h) => {
        const f = h.page.getByPlaceholder("Filter members…");
        await h.type(f, "bruno"); await h.wait(1800);
        await h.hover(btn(h, /CSV$/)); await h.wait(700);
        await h.hover(btn(h, /Excel$/)); await h.wait(1400);   // filter left on: opening the next team resets it
      } },
    { key: "default-team",
      en: ["6 · BU default teams", "Every business unit has a default team named after it, badged BU DEFAULT — Dataverse keeps the BU's users in it."],
      fr: ["6 · Équipes par défaut des BU", "Chaque business unit a une équipe par défaut à son nom, badgée BU DEFAULT — Dataverse y maintient les utilisateurs de la BU."],
      run: async (h) => {
        await h.click(btn(h, /^Contoso.*BU default team/)); await h.wait(2000);
        await h.hover(h.vis("BU DEFAULT")); await h.wait(1300);
        await h.hover(h.vis("Svc Integration")); await h.wait(1500);
      } },
    { key: "access-teams",
      en: ["7 · Access teams, on demand", "Access teams are created per record for sharing and can number thousands — they load only when asked, capped at 500."],
      fr: ["7 · Équipes d'accès, à la demande", "Les équipes d'accès sont créées par enregistrement pour le partage et se comptent par milliers — chargées seulement à la demande, 500 max."],
      run: async (h) => {
        await h.click(btn(h, /^Access/)); await h.wait(2200);
        await h.hover(btn(h, /^Opportunity Fabrikam/)); await h.wait(1300);
        await h.hover(btn(h, /^Access \(\d+\+?\)$/)); await h.wait(1500);   // the chip now shows the loaded count
      } },
  ],
};
