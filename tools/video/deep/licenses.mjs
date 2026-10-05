// Deep dive — Users & Licenses. Every action below was checked against demo mode (make-deep --probe).
// The demo's last-login date is random (it may read "Never"): captions stay generic about it.
const btn = (h, re) => h.page.locator("button >> visible=true").filter({ hasText: re }).first();
const chip = (h, label) => h.page.locator("button >> visible=true").filter({ hasText: new RegExp(`^${label}$`) }).first();
// A user row of the left list, by display name.
const user = (h, name) => h.page.locator("button >> visible=true").filter({ has: h.page.locator(`span:text-is("${name}")`) }).first();
const search = (h) => h.page.getByPlaceholder("Search users...");

export default {
  key: "licenses",
  label: "Users & Licenses",
  tagline: {
    en: "Every user with their CAL type, access mode, security roles and last login — filtered, sorted, exported",
    fr: "Chaque utilisateur avec son type de CAL, son mode d'accès, ses rôles de sécurité et sa dernière connexion — filtré, trié, exporté",
  },
  chapters: [
    { key: "overview",
      en: ["1 · Every user, at a glance", "One list with each user's CAL type and status badges, live counts of active and disabled accounts — and a ? that sums up the module."],
      fr: ["1 · Tous les utilisateurs d'un coup d'œil", "Une liste avec le type de CAL et le statut de chaque utilisateur, le décompte en direct des comptes actifs et désactivés — et un ? qui résume le module."],
      run: async (h) => {
        await h.open("Users & Licenses"); await h.wait(1200);
        await h.hover(h.page.getByText(/\d+ active · \d+ disabled · \d+ shown/).first()); await h.wait(1300);
        // the module's own "?" (not the app's help button): it sits in the header block that holds the search box
        const header = h.page.locator("div >> visible=true").filter({ has: search(h) }).last();
        await h.click(header.locator("button", { hasText: /^\?$/ })); await h.wait(2600);
      } },
    { key: "status-filters",
      en: ["2 · Disabled and service accounts", "One click lists the disabled users — or the non-interactive accounts used by integrations. The counter follows."],
      fr: ["2 · Comptes désactivés et de service", "Un clic liste les utilisateurs désactivés — ou les comptes non interactifs utilisés par les intégrations. Le compteur suit."],
      run: async (h) => {
        await h.click(chip(h, "Disabled")); await h.wait(2400);
        await h.click(chip(h, "Non-Interactive")); await h.wait(2400);
      } },
    { key: "search",
      en: ["3 · Search by name, email or business unit", "Part of a business unit's name is enough: “UK” lists everyone in Contoso UK."],
      fr: ["3 · Recherche par nom, e-mail ou unité commerciale", "Une partie du nom de l'unité commerciale suffit : « UK » liste tous les utilisateurs de Contoso UK."],
      run: async (h) => {
        await h.click(chip(h, "All")); await h.wait(600);
        await h.type(search(h), "UK"); await h.wait(2700);
      } },
    { key: "sort",
      en: ["4 · Sort by license", "Sort by name, status, CAL type or access mode — here by CAL type, so users on the same license sit together."],
      fr: ["4 · Trier par licence", "Tri par nom, statut, type de CAL ou mode d'accès — ici par type de CAL : les utilisateurs d'une même licence se suivent."],
      run: async (h) => {
        await h.click(search(h)); await search(h).fill(""); await h.wait(700);
        await h.click(chip(h, "CAL")); await h.wait(3000);
      } },
    { key: "detail",
      en: ["5 · Open a user", "Business unit, title, access mode, CAL type, creation date and last login — plus the security roles, fetched on click."],
      fr: ["5 · Ouvrir un utilisateur", "Unité commerciale, fonction, mode d'accès, type de CAL, date de création et dernière connexion — et les rôles de sécurité, chargés au clic."],
      run: async (h) => {
        await h.click(chip(h, "Name")); await h.wait(600);
        await h.click(user(h, "Pierre Bernard")); await h.wait(1800);
        await h.hover(h.page.getByText("Security Roles").first()); await h.wait(2000);
      } },
    { key: "breakdown",
      en: ["6 · Org-wide breakdowns", "Users per access mode and per CAL type across the whole org, disabled accounts included."],
      fr: ["6 · Répartition sur toute l'org", "Le nombre d'utilisateurs par mode d'accès et par type de CAL sur toute l'org, comptes désactivés compris."],
      run: async (h) => {
        await h.click(user(h, "Lucas Moreau")); await h.wait(1800);
        await h.hover(h.page.getByText(/Access Mode Breakdown/).first()); await h.wait(1500);
        await h.hover(h.page.getByText(/CAL Type Breakdown/).first()); await h.wait(1700);
      } },
    { key: "export",
      en: ["7 · Export what you see", "CSV or Excel of the filtered list on screen — with business unit, title, manager, phone and creation date."],
      fr: ["7 · Exporter ce que vous voyez", "CSV ou Excel de la liste filtrée à l'écran — avec unité commerciale, fonction, manager, téléphone et date de création."],
      run: async (h) => {
        await h.click(chip(h, "Active")); await h.wait(1300);
        await h.hover(btn(h, /Export CSV$/)); await h.wait(1100);
        await h.hover(btn(h, /Excel$/)); await h.wait(1400);
      } },
  ],
};
