// Deep dive — Login History. Every action below was checked against demo mode (make-deep --probe).
// Captions stay on what the audit really holds: user-access events (64 = app, 65 = web services)
// with their timestamps — Dataverse has no sign-out event, so no session lengths are claimed.
const btn = (h, re) => h.page.locator("button >> visible=true").filter({ hasText: re }).first();
const search = (h) => h.page.getByPlaceholder("User name or email...").first();

export default {
  key: "logins",
  label: "Login History",
  tagline: {
    en: "Any user's access trail, read from the Dataverse audit — day by day",
    fr: "La trace d'accès de n'importe quel utilisateur, lue dans l'audit Dataverse — jour par jour",
  },
  chapters: [
    { key: "search",
      en: ["1 · Find a user", "Type part of a name or an email — matching Dataverse users show up as you type, with their title."],
      fr: ["1 · Trouver un utilisateur", "Tapez une partie d'un nom ou d'un e-mail — les utilisateurs Dataverse correspondants s'affichent au fil de la frappe, avec leur fonction."],
      run: async (h) => {
        await h.open("Login History"); await h.wait(800);
        await h.type(search(h), "demo"); await h.wait(2600);
      } },
    { key: "pick",
      en: ["2 · Their access audit at a glance", "Pick a user: access events, active days, the latest and the oldest loaded — split between the app and web services (API)."],
      fr: ["2 · Son audit d'accès en un coup d'œil", "Choisissez un utilisateur : événements d'accès, jours actifs, le plus récent et le plus ancien chargé — répartis entre l'application et les services web (API)."],
      run: async (h) => {
        await h.click(btn(h, /Zakaria Missoum/)); await h.wait(1500);
        await h.hover(h.vis("Active days")); await h.wait(1100);
        await h.hover(h.vis("Last access")); await h.wait(1000);
        await h.hover(h.page.locator("span >> visible=true").filter({ hasText: /^Web services:/ }).first()); await h.wait(1800);
      } },
    { key: "timeline", pos: "top",
      en: ["3 · Day by day", "Every access event on a timeline grouped by day: its exact time and its channel — app or web services."],
      fr: ["3 · Jour par jour", "Chaque événement d'accès sur une frise groupée par jour : son heure exacte et son canal, application ou services web."],
      run: async (h) => {
        await h.scroll(380); await h.wait(2000);
        await h.scroll(480); await h.wait(2600);
      } },
    { key: "limit-refresh",
      en: ["4 · Load more history", "Choose how many access events to load, from the last 50 up to 500 — the history reloads right away."],
      fr: ["4 · Charger plus d'historique", "Choisissez combien d'événements charger, des 50 derniers jusqu'à 500 — l'historique se recharge aussitôt."],
      run: async (h) => {
        await h.scroll(-2000); await h.wait(600);
        await h.select(h.page.locator("select >> visible=true").filter({ hasText: "Last 100" }).first(), "200"); await h.wait(2200);
      } },
    { key: "switch",
      en: ["5 · Switch user in one search", "Search again at any time: picking another user replaces the timeline — nothing to reset first."],
      fr: ["5 · Changer d'utilisateur", "Relancez une recherche à tout moment : choisir un autre utilisateur remplace la frise, sans rien réinitialiser."],
      run: async (h) => {
        const s = search(h);
        await h.click(s); await s.fill(""); await h.wait(300);
        await s.pressSequentially("demo", { delay: 90 }); await h.wait(1500);
        await h.click(btn(h, /Alex Baker/)); await h.wait(2600);
      } },
    { key: "export",
      en: ["6 · Export it", "Send the loaded history to CSV or Excel — date, time, channel and audit details for every event."],
      fr: ["6 · L'exporter", "Exportez l'historique chargé en CSV ou Excel — date, heure, canal et détails d'audit de chaque événement."],
      run: async (h) => {
        await h.hover(btn(h, /Export CSV$/)); await h.wait(1500);
        await h.hover(btn(h, /Excel$/)); await h.wait(2000);
      } },
  ],
};
