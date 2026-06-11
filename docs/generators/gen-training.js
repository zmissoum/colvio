// Generates Colvio_Guide_Formation.docx (FR) and Colvio_Training_Guide_EN.docx.
// Run: node gen-training.js
const { h1, h2, h3, p, note, bullets, num, pageBreak, table, img, coverAndToc, buildDoc, writeDoc } = require("./helpers");

const VERSION = "v1.10.26";

function build(L) {
  const c = [];
  c.push(...coverAndToc({ title: L.title, subtitle: L.subtitle, version: VERSION, date: L.date, tocTitle: L.toc }));

  // 1 — Introduction
  c.push(h1(L.s1));
  c.push(p(L.s1p1));
  c.push(...bullets(L.s1b));
  c.push(img("modules.png", 620, "Colvio modules"));
  c.push(note(L.s1n));

  // 2 — Installation
  c.push(h1(L.s2));
  c.push(h2(L.s2a)); c.push(...L.s2steps.map(num));
  c.push(h2(L.s2b)); c.push(p(L.s2env));
  c.push(h2(L.s2c)); c.push(p(L.s2perm));

  // 3 — Data Explorer
  c.push(pageBreak(), h1(L.s3));
  c.push(p(L.s3p1));
  c.push(h2(L.s3a)); c.push(...bullets(L.s3modes));
  c.push(h2(L.s3b)); c.push(...bullets(L.s3feat));
  c.push(h2(L.s3c)); c.push(p(L.s3sql)); c.push(...bullets(L.s3sqlb));

  // 4 — API Tester
  c.push(pageBreak(), h1(L.s4));
  c.push(p(L.s4p1));
  c.push(...bullets(L.s4b));
  c.push(note(L.s4n));

  // 5 — Show All Data + Metadata
  c.push(h1(L.s5));
  c.push(h2(L.s5a)); c.push(p(L.s5show));
  c.push(h2(L.s5b)); c.push(p(L.s5meta));

  // 6 — Data Loader (the big one)
  c.push(pageBreak(), h1(L.s6));
  c.push(p(L.s6p1));
  c.push(img("wizard.png", 620, "Data Loader wizard"));
  c.push(h2(L.s6a)); c.push(p(L.s6src));
  c.push(h2(L.s6b)); c.push(p(L.s6map)); c.push(...bullets(L.s6transforms)); c.push(note(L.s6tplnote));
  c.push(h2(L.s6c)); c.push(p(L.s6lk));
  c.push(h2(L.s6d)); c.push(p(L.s6modesIntro));
  c.push(img("modes.png", 620, "The 4 import modes"));
  c.push(table(L.s6modesHead, L.s6modesRows, [1.2, 3, 3]));
  c.push(note(L.s6updNote));
  c.push(h2(L.s6e)); c.push(p(L.s6perf));
  c.push(img("batch.png", 600, "Bulk engine"));
  c.push(...bullets(L.s6boost));
  c.push(h2(L.s6f)); c.push(p(L.s6log));

  // 7 — Modeling modules
  c.push(pageBreak(), h1(L.s7));
  c.push(h2("Schema (ERD)")); c.push(p(L.s7erd));
  c.push(h2(L.s7relT)); c.push(p(L.s7rel));
  c.push(h2("Solutions")); c.push(p(L.s7sol));
  c.push(h2("Translations")); c.push(p(L.s7trans));

  // 8 — Admin modules
  c.push(h1(L.s8));
  c.push(h2(L.s8aT)); c.push(p(L.s8lic));
  c.push(h2("Security Audit")); c.push(p(L.s8sec));
  c.push(h2("Login History")); c.push(p(L.s8log));

  // 9 — Exports
  c.push(h1(L.s9));
  c.push(p(L.s9p1));
  c.push(...bullets(L.s9b));
  c.push(note(L.s9n));

  // 10 — FAQ
  c.push(pageBreak(), h1(L.s10));
  c.push(table(L.faqHead, L.faqRows, [2.4, 4]));

  // 11 — Shortcuts
  c.push(h1(L.s11));
  c.push(table(L.shHead, L.shRows, [1.5, 3]));

  return buildDoc({ title: `Colvio — ${L.title}`, footerText: `Colvio ${VERSION} — ${L.title}`, children: c });
}

const FR = {
  title: "Guide de formation", subtitle: "Explorer, charger et auditer Dynamics 365 / Dataverse depuis le navigateur",
  date: "Juin 2026", toc: "Sommaire",
  s1: "1. Introduction",
  s1p1: "Colvio est une extension Chrome **gratuite et open-source** pour Microsoft Dynamics 365 / Dataverse. Elle s'appuie sur votre session navigateur existante : **aucune clé API, aucun enregistrement d'application, aucun compte**. Ouvrez une page D365, cliquez sur l'icône Colvio, et travaillez.",
  s1b: [
    "**Zéro configuration** — l'authentification réutilise vos cookies de session D365.",
    "**Confidentialité totale** — aucune donnée ne quitte le navigateur : pas de télémétrie, pas de serveur tiers.",
    "**12 modules** couvrant l'exploration, le chargement de données, le test d'API et l'audit.",
    "Interface **EN / FR**, thème sombre/clair, aide intégrée avec recherche.",
  ],
  s1n: "💡 Capture d'écran recommandée ici : la barre latérale Colvio avec les 12 onglets, sur votre org de démo.",
  s2: "2. Installation et premier lancement",
  s2a: "Installation",
  s2steps: [
    "Depuis le **Chrome Web Store** : recherchez « Colvio for Dynamics 365 » et cliquez Installer (ou depuis les sources : `npm install`, `npm run build`, puis charger `dist/` via chrome://extensions en mode développeur).",
    "Épinglez l'icône Colvio à la barre d'outils Chrome.",
    "Ouvrez n'importe quelle page **Dynamics 365** (votre org habituelle).",
    "Cliquez sur l'icône Colvio : le panneau s'ouvre dans un nouvel onglet, déjà connecté à votre org.",
  ],
  s2b: "Badge d'environnement",
  s2env: "En haut du panneau, un badge indique l'environnement : **PROD**, **SANDBOX**, **UAT**, **DEV**, **TRIAL**… Il provient de l'API `RetrieveCurrentOrganization` de Microsoft (champ OrganizationType) — la source la plus fiable — avec une heuristique d'URL en simple secours. Vérifiez-le toujours avant un chargement de données.",
  s2c: "Onglets selon vos droits",
  s2perm: "Au démarrage, Colvio sonde vos permissions et masque les onglets que vous ne pouvez pas utiliser (Security Audit, Login History, Users & Licenses exigent des droits de lecture d'audit/utilisateurs ; les Speed boosters du Loader exigent System Administrator). Les droits sont **toujours réappliqués côté serveur** par Dataverse : Colvio ne peut jamais dépasser vos rôles de sécurité.",
  s3: "3. Data Explorer",
  s3p1: "Le module central : interrogez n'importe quelle table de votre org avec l'un des **4 modes de requête**, puis triez, éditez et exportez les résultats.",
  s3a: "Les 4 modes de requête",
  s3modes: [
    "**Builder** — visuel : choix des colonnes, filtres WHERE en groupes ET/OU (14 opérateurs), $expand parents et enfants (avec filtres par expand), tri, limite.",
    "**OData** — l'URL brute, éditable directement.",
    "**FetchXML** — éditeur avec 3 modèles (simple, jointure, agrégation) et pagination par paging cookie.",
    "**SQL** — écrivez du SQL familier, Colvio le traduit en FetchXML (voir ci-dessous).",
  ],
  s3b: "Travailler avec les résultats",
  s3feat: [
    "**Pagination automatique** sans plafond de 5 000 lignes, défilement virtuel fluide sur 10 000+ enregistrements.",
    "**Édition inline** — double-cliquez une cellule pour la modifier (PATCH direct).",
    "**Bulk update / bulk delete** sur sélection, avec confirmation tapée et pré-contrôle `CanBeDeleted`.",
    "**Requêtes sauvegardées** (20), **historique** (20) et **5 modèles** prêts à l'emploi.",
    "Lookups cliquables (ouvre l'enregistrement dans D365), copie de l'URL OData.",
    "Export **CSV / XLSX / JSON**.",
  ],
  s3c: "Mode SQL",
  s3sql: "Écrivez `SELECT`, `FROM`, `JOIN`, `WHERE`, `ORDER BY`, `TOP`, `DISTINCT`, `GROUP BY` et les agrégats (`COUNT(*)`, `SUM`, `AVG`, `MIN`, `MAX`). La traduction en FetchXML garantit une pagination fiable et des jointures via `link-entity` :",
  s3sqlb: [
    "`SELECT name, revenue FROM account WHERE statecode = 0 ORDER BY revenue DESC TOP 100`",
    "`SELECT a.name, c.fullname FROM account a JOIN contact c ON a.primarycontactid = c.contactid`",
    "Le bouton « View FetchXML » montre le XML généré — pratique pour apprendre FetchXML.",
  ],
  s4: "4. API Tester",
  s4p1: "Un client **façon Postman** pour la Web API Dataverse, sans aucune configuration : l'authentification passe par votre session D365 active (pas d'OAuth, pas de secret client, pas de token à rafraîchir).",
  s4b: [
    "Méthodes **GET / POST / PATCH / PUT / DELETE** sur un chemin relatif (`accounts?$top=5`) ou une URL complète de la même org (l'hôte est re-validé : impossible d'appeler un autre domaine).",
    "**Autocomplétion des headers** Dataverse courants : `Prefer`, `If-Match`, `MSCRM.SuppressDuplicateDetection`, `MSCRM.BypassCustomPluginExecution`…",
    "Éditeur de **body JSON** avec numéros de ligne et validation en direct (l'erreur pointe la ligne exacte).",
    "Réponse : statut, temps, taille, JSON formaté, onglet headers.",
    "**Templates** : WhoAmI, CREATE, PATCH, UPSERT par alternate key, DELETE, RetrieveCurrentOrganization.",
    "**Historique** des 50 dernières requêtes (les headers sensibles comme `Authorization` sont masqués avant sauvegarde locale).",
    "**Copy as cURL**, envoi par **Ctrl/Cmd+Entrée**, multi-onglets.",
  ],
  s4n: "💡 Cas d'usage typiques : tester un appel avant de l'intégrer dans un plugin ou Power Automate, reproduire un ticket, vérifier le comportement d'un header MSCRM.",
  s5: "5. Inspecter un enregistrement et les métadonnées",
  s5a: "Show All Data",
  s5show: "Détecte automatiquement l'enregistrement ouvert dans votre onglet D365 (ou collez une URL / un GUID) et affiche **tous ses champs** : nom logique, libellé, type, valeur. Lookups cliquables, copie champ par champ ou JSON complet.",
  s5b: "Metadata Browser",
  s5meta: "Parcourez entités, champs et OptionSets (valeur, libellé, description, couleur). **Export CSV de tous les champs** d'une entité (nom logique, nom OData, type, requis, custom) — un dictionnaire de données instantané — et **export de tous les OptionSets**. C'est ici que vous vérifiez les libellés exacts d'une picklist avant un import par labels.",
  s6: "6. Data Loader — charger des données en masse",
  s6p1: "Le Data Loader importe des fichiers **CSV, TSV ou Excel** dans n'importe quelle table, via un assistant en 5 étapes. Il est conçu pour des volumes importants (plusieurs centaines de milliers de lignes) avec un retour ligne par ligne en temps réel.",
  s6a: "Étape 1 — Source",
  s6src: "Glissez-déposez un fichier (`.csv`, `.tsv`, `.txt`, `.xlsx`, `.xls`) ou collez directement depuis Excel. Le délimiteur est auto-détecté (virgule, tabulation, point-virgule) et le parseur respecte **RFC-4180** : cellules entre guillemets, virgules et retours à la ligne dans les cellules, guillemets échappés. Les valeurs sont trimées et les zéros en tête préservés (codes SAP…).",
  s6b: "Étape 2 — Mapping et transforms",
  s6map: "Les colonnes du fichier s'auto-mappent aux champs D365 (correspondance par nom + champs courants). Les colonnes de type lookup sont détectées et **routées vers l'étape Lookups** — jamais écrites en dur. Un avertissement signale les champs **non inscriptibles** pour le mode choisi (calculés, rollup). Chaque colonne peut recevoir un transform :",
  s6transforms: [
    "**picklist / statecode** — accepte la valeur numérique **ou le label** (« Chaud », « 3 - Hot ») : l'OptionSet est préchargé et les labels convertis ; les labels sans correspondance sont **listés en fin d'import** au lieu d'être perdus.",
    "**date ISO** — `2026-06-13` inchangé (pas de décalage de fuseau), `13/06/2026` (EU), `12/31/2026` (US auto-détecté), avec heure optionnelle 24h ou AM/PM.",
    "**int / float** — locale gérée : `1 000`, `1,5`, `1.234,56`.",
    "**boolean / oui-non**, MAJUSCULES / minuscules.",
  ],
  s6tplnote: "💾 **Templates de mapping** : sauvegardez la configuration complète (mappings, lookups, clé, mode, perfs) et rechargez-la au prochain import de la même entité.",
  s6c: "Étape 3 — Parent Lookups",
  s6lk: "Pour chaque relation parent, choisissez le **mode** : `direct` (la colonne contient déjà le GUID), `resolve` (Colvio résout la valeur — ex. un email — vers le GUID via une requête par valeur unique), ou **binding direct par alternate key** (`entityset(champ='valeur')`, sans aucune requête de résolution — le plus rapide). En cas de non-correspondance, le **fallback** que vous choisissez s'applique : Skip (ligne ignorée), Null (ligne chargée sans le lookup) ou Error.",
  s6d: "Étape 4 — Choisir le mode d'import",
  s6modesIntro: "Le choix le plus important de l'assistant. La clé (GUID ou **alternate key**) adresse l'enregistrement dans l'URL — elle n'est jamais dupliquée dans le body.",
  s6modesHead: ["Mode", "Ce qu'il fait", "À utiliser pour"],
  s6modesRows: [
    ["**CREATE**", "Chaque ligne devient un nouvel enregistrement (POST).", "Reprise initiale, données neuves."],
    ["**UPSERT**", "Match sur la clé : met à jour si trouvé, **crée sinon**.", "Synchronisations répétées, migrations idempotentes."],
    ["**UPDATE**", "Strictement mise à jour : header natif `If-Match: *` sur chaque PATCH → **404 si absent, jamais de création**. Clé vide = erreur. Option « vérifier l'existence d'abord » en filet de sécurité.", "Mises à jour de masse où toute création serait une erreur (ex. enrichir 400 000 contacts existants)."],
    ["**DELETE**", "Supprime les enregistrements matchés sur la clé. Confirmation à taper.", "Purges ciblées par clé métier, rollback d'un import."],
  ],
  s6updNote: "⚠️ En mode UPDATE, des lignes en échec 404 sont un **comportement voulu** : la clé ne correspond à aucun enregistrement et rien n'est créé. Passez en UPSERT si la création est souhaitée.",
  s6e: "Étape 5 — Performance",
  s6perf: "Les enregistrements partent en **$batch multipart** avec un changeset par enregistrement : une ligne en erreur n'annule jamais les autres. Réglez **taille de lot (1-500) × threads (1-10)** — par défaut 200 × 6 ≈ 3-4 000 enregistrements/seconde. Le throttling Dataverse (429) est retryé automatiquement en respectant `Retry-After`. **Annuler** stoppe tout, y compris les retries en attente : aucune écriture après l'annulation.",
  s6boost: [
    "**Speed boosters** (System Administrator uniquement) : `BypassCustomPluginExecution`, `SuppressDuplicateDetection`, `BypassSynchronousLogic` par enregistrement.",
    "Peuvent multiplier le débit sur les entités très customisées — mais la logique métier serveur est sautée : réservez-les à des données déjà validées.",
  ],
  s6f: "Le log temps réel",
  s6log: "Pendant le run, chaque ligne s'affiche avec ses valeurs CSV et son statut **Success / Failed** + le message d'erreur Dataverse exact. Après le run : cliquez une ligne pour voir la **requête exacte envoyée** (méthode, URL, headers, body), exportez le log complet ou seulement les erreurs en CSV, et consultez la liste des labels d'option-set non convertis.",
  s7: "7. Modéliser : schéma, relations, solutions, traductions",
  s7erd: "Diagramme Entité-Relation interactif : ajoutez des entités au canevas, les cartes montrent les champs avec badges FK, des courbes relient chaque lookup à sa cible. Glissez, zoomez, « + » ajoute les entités liées. Export **PNG, SVG, Mermaid**.",
  s7relT: "Relations",
  s7rel: "Graphe des relations d'une entité : parents N:1, enfants 1:N, N:N. Profondeur 1-2, clic pour naviguer.",
  s7sol: "Parcourez les solutions installées et leurs composants, résolus en noms lisibles (13 types : entités, attributs, vues, plugins, web resources, rôles…). Badges Managed/Unmanaged.",
  s7trans: "Affichez et éditez les libellés de champs dans toutes les langues installées, inline. Les champs non renommables sont verrouillés. Export/import CSV pour les traductions en masse, publication automatique.",
  s8: "8. Modules d'administration",
  s8aT: "Users & Licenses",
  s8lic: "Tous les utilisateurs avec Access Mode, CAL Type, BU, rôles de sécurité et **dernière connexion** (via l'audit). Statistiques par type de licence, détection des licences inutilisées (désactivés, jamais connectés). Export CSV.",
  s8sec: "Tous les rôles de sécurité avec leurs privilèges en libellés lisibles (`prvDeleteAccount` → « Delete · Account »), badges de profondeur (User / BU / Parent:Child / **Org** en rouge), et plus de 30 privilèges sensibles signalés. Export CSV par rôle.",
  s8log: "Timeline de connexions/déconnexions par utilisateur (via l'audit D365), durées de session, répartition par type d'accès, export CSV. Nécessite l'audit activé avec « Audit user access ».",
  s9: "9. Exports et nommage des fichiers",
  s9p1: "Tous les exports suivent la même convention de nommage :",
  s9b: [
    "`<objet>_<YYYYMMDD>.<ext>` — ex. `account_20260610.csv`, `contact_fields_20260610.csv`.",
    "Les logs d'import ajoutent l'heure : `colvio_load_contact_20260610_103000.csv` — plusieurs runs le même jour ne s'écrasent pas.",
    "Les cellules CSV sont protégées contre l'injection de formules ; les exports XLSX conservent de **vraies cellules numériques** (SUM fonctionne).",
  ],
  s9n: "ℹ️ Excel ouvre les fichiers téléchargés en **Mode protégé** (« Activer la modification ») : c'est une protection Windows/Office sur tout téléchargement internet, pas un réglage Colvio. Pour l'éviter au quotidien, ajoutez votre dossier d'exports aux Emplacements approuvés d'Excel.",
  s10: "10. Dépannage / FAQ",
  faqHead: ["Symptôme", "Explication et solution"],
  faqRows: [
    ["« Session expirée »", "La session D365 a expiré. Rafraîchissez l'onglet D365 (F5) puis cliquez Reconnect dans Colvio."],
    ["Lignes en 404 en mode UPDATE", "Comportement voulu : la clé ne matche aucun enregistrement et UPDATE ne crée jamais. Utilisez UPSERT pour créer."],
    ["« Lookup not found / check failed »", "La valeur n'a pas pu être résolue. La ligne suit votre fallback (Skip/Null/Error). Vérifiez le champ clé D365 du lookup."],
    ["Labels d'option-set non convertis", "Le label CSV n'existe pas dans l'OptionSet. Vérifiez les libellés exacts dans le Metadata Browser, ou utilisez les valeurs numériques."],
    ["HTTP 429", "Throttling Dataverse (Service Protection). Colvio retry automatiquement ; si cela persiste, baissez threads et taille de lot."],
    ["Badge PROD inattendu", "Le badge vient de l'API OrganizationType. Si l'org est récente, re-cliquez l'icône Colvio depuis l'onglet D365."],
    ["Import lent sur de très gros fichiers", "Montez à 8-10 threads et 500 de lot ; en tant qu'admin, envisagez les Speed boosters (données déjà validées uniquement)."],
    ["Excel demande « Activer la modification »", "Mode protégé Windows/Office sur les téléchargements — voir section 9."],
  ],
  s11: "11. Raccourcis clavier",
  shHead: ["Raccourci", "Action"],
  shRows: [
    ["`Ctrl/Cmd + Entrée`", "Exécuter la requête (Explorer, SQL, API Tester)"],
    ["`Ctrl + /`", "Ouvrir le panneau des raccourcis"],
    ["`Échap`", "Fermer la fenêtre / le panneau actif"],
    ["Double-clic sur une cellule", "Édition inline (Explorer)"],
  ],
};

const EN = {
  title: "Training Guide", subtitle: "Explore, load and audit Dynamics 365 / Dataverse from the browser",
  date: "June 2026", toc: "Contents",
  s1: "1. Introduction",
  s1p1: "Colvio is a **free, open-source** Chrome extension for Microsoft Dynamics 365 / Dataverse. It rides on your existing browser session: **no API key, no app registration, no account**. Open a D365 page, click the Colvio icon, start working.",
  s1b: [
    "**Zero configuration** — authentication reuses your D365 session cookies.",
    "**Privacy first** — nothing leaves the browser: no telemetry, no third-party servers.",
    "**12 modules** covering exploration, data loading, API testing and auditing.",
    "**EN / FR** interface, dark/light theme, searchable built-in Help.",
  ],
  s1n: "💡 Recommended screenshot here: the Colvio sidebar with all 12 tabs, on your demo org.",
  s2: "2. Installation & first launch",
  s2a: "Install",
  s2steps: [
    "From the **Chrome Web Store**: search “Colvio for Dynamics 365” and Install (or from source: `npm install`, `npm run build`, then load `dist/` via chrome://extensions in Developer Mode).",
    "Pin the Colvio icon to the Chrome toolbar.",
    "Open any **Dynamics 365** page (your usual org).",
    "Click the Colvio icon: the panel opens in a new tab, already connected to your org.",
  ],
  s2b: "Environment badge",
  s2env: "At the top of the panel, a badge shows the environment: **PROD**, **SANDBOX**, **UAT**, **DEV**, **TRIAL**… It comes from Microsoft's `RetrieveCurrentOrganization` API (OrganizationType field) — the authoritative source — with a URL heuristic as fallback only. Always check it before a data load.",
  s2c: "Permission-based tabs",
  s2perm: "On startup Colvio probes your permissions and hides tabs you can't use (Security Audit, Login History, Users & Licenses need audit/user read rights; the Loader's Speed boosters require System Administrator). Rights are **always re-enforced server-side** by Dataverse: Colvio can never exceed your security roles.",
  s3: "3. Data Explorer",
  s3p1: "The core module: query any table in your org with one of **4 query modes**, then sort, edit and export the results.",
  s3a: "The 4 query modes",
  s3modes: [
    "**Builder** — visual: column picker, WHERE filters in AND/OR groups (14 operators), parent and child $expand (with per-expand filters), sorting, limit.",
    "**OData** — the raw URL, directly editable.",
    "**FetchXML** — editor with 3 templates (simple, join, aggregation) and paging-cookie pagination.",
    "**SQL** — write familiar SQL, Colvio translates it to FetchXML (see below).",
  ],
  s3b: "Working with results",
  s3feat: [
    "**Auto-pagination** with no 5,000-row cap, smooth virtual scrolling on 10,000+ records.",
    "**Inline edit** — double-click a cell to modify it (direct PATCH).",
    "**Bulk update / bulk delete** on selection, with typed confirmation and `CanBeDeleted` pre-check.",
    "**Saved queries** (20), **history** (20) and **5 ready-made templates**.",
    "Clickable lookups (opens the record in D365), copy OData URL.",
    "Export **CSV / XLSX / JSON**.",
  ],
  s3c: "SQL mode",
  s3sql: "Write `SELECT`, `FROM`, `JOIN`, `WHERE`, `ORDER BY`, `TOP`, `DISTINCT`, `GROUP BY` and aggregates (`COUNT(*)`, `SUM`, `AVG`, `MIN`, `MAX`). Translation to FetchXML guarantees reliable pagination and joins via `link-entity`:",
  s3sqlb: [
    "`SELECT name, revenue FROM account WHERE statecode = 0 ORDER BY revenue DESC TOP 100`",
    "`SELECT a.name, c.fullname FROM account a JOIN contact c ON a.primarycontactid = c.contactid`",
    "The “View FetchXML” button shows the generated XML — a great way to learn FetchXML.",
  ],
  s4: "4. API Tester",
  s4p1: "A **Postman-style** client for the Dataverse Web API with zero setup: authentication rides on your active D365 session (no OAuth, no client secret, no token refresh).",
  s4b: [
    "**GET / POST / PATCH / PUT / DELETE** on a relative path (`accounts?$top=5`) or a full same-org URL (the host is re-validated: calling another domain is impossible).",
    "**Header autocomplete** for common Dataverse headers: `Prefer`, `If-Match`, `MSCRM.SuppressDuplicateDetection`, `MSCRM.BypassCustomPluginExecution`…",
    "**JSON body editor** with line numbers and live validation (errors point at the exact line).",
    "Response: status, elapsed time, size, pretty JSON, headers tab.",
    "**Templates**: WhoAmI, CREATE, PATCH, UPSERT by alternate key, DELETE, RetrieveCurrentOrganization.",
    "**History** of the last 50 requests (secret-bearing headers like `Authorization` are redacted before local save).",
    "**Copy as cURL**, send with **Ctrl/Cmd+Enter**, multiple tabs.",
  ],
  s4n: "💡 Typical uses: test a call before wiring it into a plugin or Power Automate, reproduce a support ticket, check how an MSCRM header behaves.",
  s5: "5. Inspecting a record and the metadata",
  s5a: "Show All Data",
  s5show: "Auto-detects the record open in your D365 tab (or paste a URL / GUID) and shows **every field**: logical name, label, type, value. Clickable lookups, copy per-field or full JSON.",
  s5b: "Metadata Browser",
  s5meta: "Browse entities, fields and OptionSets (value, label, description, color). **CSV export of all fields** of an entity (logical name, OData name, type, required, custom) — an instant data dictionary — and **export of all OptionSets**. This is where you check a picklist's exact labels before a label-based import.",
  s6: "6. Data Loader — bulk data loading",
  s6p1: "The Data Loader imports **CSV, TSV or Excel** files into any table through a 5-step wizard. It is built for large volumes (hundreds of thousands of rows) with real-time per-row feedback.",
  s6a: "Step 1 — Source",
  s6src: "Drag-drop a file (`.csv`, `.tsv`, `.txt`, `.xlsx`, `.xls`) or paste straight from Excel. The delimiter is auto-detected (comma, tab, semicolon) and the parser is **RFC-4180** compliant: quoted cells, embedded commas and line breaks, escaped quotes. Values are trimmed and leading zeros preserved (SAP-style codes…).",
  s6b: "Step 2 — Mapping & transforms",
  s6map: "File columns auto-map to D365 fields (name matching + common fields). Lookup-type columns are detected and **routed to the Lookups step** — never written raw. A pre-flight warning flags fields that are **not writable** for the chosen mode (calculated, rollup). Each column can take a transform:",
  s6transforms: [
    "**picklist / statecode** — accepts the numeric value **or the label** (“Hot”, “3 - Hot”): the OptionSet is preloaded and labels converted; unmatched labels are **listed after the run** instead of silently dropped.",
    "**date ISO** — `2026-06-13` kept as-is (no timezone shift), `13/06/2026` (EU), `12/31/2026` (US auto-detected), optional 24h or AM/PM time.",
    "**int / float** — locale-aware: `1 000`, `1,5`, `1.234,56`.",
    "**boolean / yes-no**, UPPER / lower.",
  ],
  s6tplnote: "💾 **Mapping templates**: save the full configuration (mappings, lookups, key, mode, performance) and reload it next time you import into the same entity.",
  s6c: "Step 3 — Parent Lookups",
  s6lk: "For each parent relationship pick the **mode**: `direct` (the column already holds the GUID), `resolve` (Colvio resolves the value — e.g. an email — to the GUID with one query per unique value), or **direct alternate-key binding** (`entityset(field='value')`, no resolution query at all — fastest). When a value doesn't match, your chosen **fallback** applies: Skip (row skipped), Null (row loaded without the lookup) or Error.",
  s6d: "Step 4 — Pick the import mode",
  s6modesIntro: "The most important choice in the wizard. The key (GUID or **alternate key**) addresses the record in the URL — it is never duplicated in the body.",
  s6modesHead: ["Mode", "What it does", "Use it for"],
  s6modesRows: [
    ["**CREATE**", "Every row becomes a new record (POST).", "Initial loads, brand-new data."],
    ["**UPSERT**", "Match on the key: update if found, **create otherwise**.", "Repeated syncs, idempotent migrations."],
    ["**UPDATE**", "Strictly update: native `If-Match: *` header on every PATCH → **404 when missing, never a create**. Empty key = error. Optional “verify existence first” safety net.", "Mass updates where any create would be a bug (e.g. enriching 400k existing contacts)."],
    ["**DELETE**", "Deletes the records matched on the key. Typed confirmation.", "Targeted purges by business key, import rollbacks."],
  ],
  s6updNote: "⚠️ In UPDATE mode, rows failing with 404 are **by design**: the key matches no record and nothing is created. Switch to UPSERT if creation is desired.",
  s6e: "Step 5 — Performance",
  s6perf: "Records are sent as **multipart $batch** with one changeset per record: a failing row never rolls back the others. Tune **batch size (1-500) × threads (1-10)** — defaults 200 × 6 ≈ 3-4k records/second. Dataverse throttling (429) is retried automatically honoring `Retry-After`. **Cancel** stops everything, including pending retries: no writes after cancel.",
  s6boost: [
    "**Speed boosters** (System Administrator only): per-record `BypassCustomPluginExecution`, `SuppressDuplicateDetection`, `BypassSynchronousLogic`.",
    "They can multiply throughput on heavily customized entities — but server-side business logic is skipped: only use on already-validated data.",
  ],
  s6f: "The live log",
  s6log: "During the run every row appears with its CSV values and **Success / Failed** status + the exact Dataverse error. After the run: click a row to see the **exact request sent** (method, URL, headers, body), export the full log or only the errors as CSV, and review the list of unconverted option-set labels.",
  s7: "7. Modeling: schema, relationships, solutions, translations",
  s7erd: "Interactive Entity-Relationship Diagram: add entities to the canvas, cards show fields with FK badges, curves connect each lookup to its target. Drag, zoom, “+” adds related entities. Export **PNG, SVG, Mermaid**.",
  s7relT: "Relationships",
  s7rel: "Relationship graph for one entity: N:1 parents, 1:N children, N:N. Depth 1-2, click to drill down.",
  s7sol: "Browse installed solutions and their components, resolved to readable names (13 types: entities, attributes, views, plugins, web resources, roles…). Managed/Unmanaged badges.",
  s7trans: "View and edit field labels across all installed languages, inline. Non-renameable fields are locked. CSV export/import for bulk translation, auto-publish.",
  s8: "8. Admin modules",
  s8aT: "Users & Licenses",
  s8lic: "All users with Access Mode, CAL Type, BU, security roles and **last login** (from audit). License-type breakdown, unused-license detection (disabled users, never logged in). CSV export.",
  s8sec: "All security roles with privileges as readable labels (`prvDeleteAccount` → “Delete · Account”), depth badges (User / BU / Parent:Child / **Org** in red), and 30+ sensitive privileges flagged. CSV export per role.",
  s8log: "Login/logout timeline per user (from D365 audit), session durations, access-type breakdown, CSV export. Requires auditing enabled with “Audit user access”.",
  s9: "9. Exports & file naming",
  s9p1: "Every export follows the same naming convention:",
  s9b: [
    "`<object>_<YYYYMMDD>.<ext>` — e.g. `account_20260610.csv`, `contact_fields_20260610.csv`.",
    "Import run logs add the time: `colvio_load_contact_20260610_103000.csv` — several runs the same day never overwrite each other.",
    "CSV cells are protected against formula injection; XLSX exports keep **real numeric cells** (SUM works).",
  ],
  s9n: "ℹ️ Excel opens downloaded files in **Protected View** (“Enable Editing”): that's a Windows/Office safeguard on every internet download, not a Colvio setting. To avoid it daily, add your export folder to Excel's Trusted Locations.",
  s10: "10. Troubleshooting / FAQ",
  faqHead: ["Symptom", "Explanation & fix"],
  faqRows: [
    ["“Session expired”", "The D365 session timed out. Refresh the D365 tab (F5), then click Reconnect in Colvio."],
    ["Rows fail with 404 in UPDATE mode", "By design: the key matches no record and UPDATE never creates. Use UPSERT to create."],
    ["“Lookup not found / check failed”", "The value couldn't be resolved. The row follows your fallback (Skip/Null/Error). Check the lookup's D365 key field."],
    ["Unconverted option-set labels", "The CSV label doesn't exist in the OptionSet. Check exact labels in the Metadata Browser, or use numeric values."],
    ["HTTP 429", "Dataverse Service Protection throttling. Colvio retries automatically; if it persists, lower threads and batch size."],
    ["Unexpected PROD badge", "The badge comes from the OrganizationType API. For a brand-new org, re-click the Colvio icon from the D365 tab."],
    ["Slow import on huge files", "Raise to 8-10 threads and batch 500; as an admin, consider Speed boosters (validated data only)."],
    ["Excel asks to “Enable Editing”", "Windows/Office Protected View on downloads — see section 9."],
  ],
  s11: "11. Keyboard shortcuts",
  shHead: ["Shortcut", "Action"],
  shRows: [
    ["`Ctrl/Cmd + Enter`", "Run the query (Explorer, SQL, API Tester)"],
    ["`Ctrl + /`", "Open the shortcuts panel"],
    ["`Esc`", "Close the active modal / panel"],
    ["Double-click a cell", "Inline edit (Explorer)"],
  ],
};

(async () => {
  await writeDoc(build(FR), "Colvio_Guide_Formation.docx");
  await writeDoc(build(EN), "Colvio_Training_Guide_EN.docx");
})();
