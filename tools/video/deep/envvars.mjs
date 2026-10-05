// Deep dive — Environment Variables. Every action below was checked against demo mode (make-deep --probe).
const btn = (h, re) => h.page.locator("button >> visible=true").filter({ hasText: re }).first();
// The header row of one variable's card (found by its schema name) — holds its Set/Edit/Clear buttons.
const row = (h, schema) => h.page.locator("div >> visible=true").filter({ has: h.page.locator(`span:text-is("${schema}")`) }).filter({ has: h.page.locator("button") }).last();
const save = (h) => h.page.getByRole("button", { name: "Save", exact: true });

export default {
  key: "envvars",
  label: "Environment Variables",
  tagline: {
    en: "Defaults, per-environment values and the missing ones — checked and fixed in one screen",
    fr: "Valeurs par défaut, valeurs par environnement et valeurs manquantes — vérifiées et corrigées sur un seul écran",
  },
  chapters: [
    { key: "no-value",
      en: ["1 · Spot the missing values", "A variable with no current value AND no default reads as an empty string in flows and plug-ins. Colvio counts them and lists them in one click."],
      fr: ["1 · Repérer les valeurs manquantes", "Une variable sans valeur actuelle NI valeur par défaut se lit comme une chaîne vide dans les flows et plug-ins. Colvio les compte et les liste en un clic."],
      run: async (h) => {
        await h.open("Env Variables"); await h.wait(1200);
        await h.hover(h.page.getByText(/variable has NO value at all/).first()); await h.wait(1200);
        await h.click(btn(h, /No value \(\d+\)/)); await h.wait(2000);
      } },
    { key: "set-boolean",
      en: ["2 · Set the value", "Booleans get a yes / no picker — the documented convention. Saving creates the environment's value and the warning clears."],
      fr: ["2 · Définir la valeur", "Les booléens ont un sélecteur yes / no — la convention documentée. L'enregistrement crée la valeur de l'environnement et l'alerte disparaît."],
      run: async (h) => {
        await h.click(btn(h, /^All \(\d+\)$/)); await h.wait(900);
        await h.click(row(h, "new_FeatureFlagX").getByRole("button", { name: /Set value/ })); await h.wait(1200);
        await h.select(h.page.locator("select >> visible=true").first(), "yes"); await h.wait(700);
        await h.click(save(h)); await h.wait(2000);
      } },
    { key: "validation",
      en: ["3 · Checked before saving", "JSON must parse, numbers must be numbers: an invalid value is refused with the reason, before anything is sent."],
      fr: ["3 · Vérifié avant l'enregistrement", "Le JSON doit être valide, un nombre doit être un nombre : une valeur incorrecte est refusée avec la raison, avant tout envoi."],
      run: async (h) => {
        await h.click(row(h, "new_RoutingConfig").getByRole("button", { name: /Edit value/ })); await h.wait(1000);
        const ta = h.page.locator("textarea >> visible=true").first();
        await h.click(ta);
        await h.page.keyboard.press("Control+A");
        await h.page.keyboard.type('{"queue":"vip","fallback":"default"', { delay: 55 }); await h.wait(400);
        await h.click(save(h)); await h.wait(2200);
        await h.click(ta); await h.page.keyboard.press("Control+End");
        await h.page.keyboard.type("}", { delay: 80 }); await h.wait(700);
        await h.click(save(h)); await h.wait(1800);
      } },
    { key: "clear-override",
      en: ["4 · Fall back to the default", "Clear override deletes this environment's value: the variable goes back to its definition's default."],
      fr: ["4 · Revenir à la valeur par défaut", "« Clear override » supprime la valeur de cet environnement : la variable retombe sur la valeur par défaut de sa définition."],
      run: async (h) => {
        await h.hover(h.page.locator('text="https://prod.api.contoso.com" >> visible=true').first()); await h.wait(900);
        await h.click(row(h, "new_ApiBaseUrl").getByRole("button", { name: /Clear override/ })); await h.wait(1300);
        await h.hover(h.page.locator('text="https://dev.api.contoso.com" >> visible=true').first()); await h.wait(1500);
      } },
    { key: "overridden",
      en: ["5 · What this environment sets", "The Overridden filter lists the variables that carry their own value in this environment, on top of the definition's default."],
      fr: ["5 · Ce que cet environnement définit", "Le filtre Overridden liste les variables qui ont leur propre valeur dans cet environnement, en plus de la valeur par défaut de la définition."],
      run: async (h) => {
        await h.click(btn(h, /^Overridden \(\d+\)$/)); await h.wait(1600);
        await h.hover(h.page.locator('text=/"queue":"vip"/ >> visible=true').first()); await h.wait(1400);
      } },
    { key: "secrets",
      en: ["6 · Secrets stay in Key Vault", "Secret variables hold a Key Vault reference path: Colvio shows and edits the reference, never the secret itself."],
      fr: ["6 · Les secrets restent dans Key Vault", "Les variables Secret contiennent un chemin de référence Key Vault : Colvio affiche et modifie la référence, jamais le secret lui-même."],
      run: async (h) => {
        await h.click(btn(h, /^Secrets \(\d+\)$/)); await h.wait(1300);
        await h.click(row(h, "new_ApiKeyRef").getByRole("button", { name: /Edit value/ })); await h.wait(2800);
      } },
    { key: "search-export",
      en: ["7 · Search, then export", "Search by display or schema name. CSV and Excel export the list on screen: default, current value and where the effective value comes from."],
      fr: ["7 · Rechercher, puis exporter", "Recherche par nom d'affichage ou nom de schéma. Les exports CSV et Excel reprennent la liste affichée : défaut, valeur actuelle et origine de la valeur effective."],
      run: async (h) => {
        await h.click(h.page.getByRole("button", { name: "Cancel", exact: true })); await h.wait(500);
        await h.click(btn(h, /^All \(\d+\)$/)); await h.wait(600);
        await h.type(h.page.getByPlaceholder(/Search name or schema name/), "api"); await h.wait(1500);
        await h.hover(btn(h, /CSV$/)); await h.wait(900);
        await h.hover(btn(h, /Excel$/)); await h.wait(1300);
      } },
  ],
};
