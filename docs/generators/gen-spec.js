// Generates Colvio_Spec_Technique.docx (FR) and Colvio_Technical_Spec_EN.docx.
// Run: node gen-spec.js
const { h1, h2, h3, p, note, bullets, num, pageBreak, table, img, coverAndToc, buildDoc, writeDoc } = require("./helpers");

const VERSION = "v1.11.7";

function build(L) {
  const c = [];
  c.push(...coverAndToc({ title: L.title, subtitle: L.subtitle, version: VERSION, date: L.date, tocTitle: L.toc }));

  c.push(h1(L.s1));
  c.push(p(L.s1p1));
  c.push(table(L.statsHead, L.statsRows, [2, 3]));

  c.push(h1(L.s2));
  c.push(p(L.s2p1));
  c.push(img("architecture.png", 640, "Architecture"));
  c.push(h2(L.s2aT)); c.push(...bullets(L.s2comp));
  c.push(h2(L.s2bT)); c.push(p(L.s2msg)); c.push(...bullets(L.s2msgb));

  c.push(pageBreak(), h1(L.s3));
  c.push(p(L.s3p1));
  c.push(table(L.modHead, L.modRows, [1.6, 4]));

  c.push(pageBreak(), h1(L.s4));
  c.push(h2(L.s4aT)); c.push(p(L.s4ctx));
  c.push(h2(L.s4bT)); c.push(p(L.s4env));
  c.push(h2(L.s4cT)); c.push(p(L.s4cache)); c.push(table(L.cacheHead, L.cacheRows, [2, 1.4, 3]));

  c.push(pageBreak(), h1(L.s5));
  c.push(h2(L.s5aT)); c.push(p(L.s5parse));
  c.push(h2(L.s5bT)); c.push(p(L.s5transforms));
  c.push(h2(L.s5cT)); c.push(p(L.s5modes));
  c.push(img("modes.png", 620, "Import modes"));
  c.push(h2(L.s5dT)); c.push(p(L.s5batch));
  c.push(img("batch.png", 600, "Bulk engine"));
  c.push(h2(L.s5eT)); c.push(p(L.s5cancel));
  c.push(h2(L.s5fT)); c.push(p(L.s5log));

  c.push(pageBreak(), h1(L.s6));
  c.push(p(L.s6p1));
  c.push(img("security.png", 620, "Defense in depth"));
  c.push(...bullets(L.s6b));

  c.push(h1(L.s7));
  c.push(...bullets(L.s7b));

  c.push(h1(L.s8));
  c.push(p(L.s8p1));
  c.push(...bullets(L.s8b));
  c.push(note(L.s8n));

  return buildDoc({ title: `Colvio — ${L.title}`, footerText: `Colvio ${VERSION} — ${L.title}`, children: c });
}

const COMMON_STATS = (L) => [
  [L.stats1, "~11 400"],
  [L.stats2, "30"],
  [L.stats3, "48"],
  [L.stats4, "215 (Vitest)"],
  [L.stats5, "~490 KB (+ ~430 KB xlsx " + L.onDemand + ")"],
  [L.stats6, "React 18, react-dom, xlsx (lazy)"],
  [L.stats7, "activeTab · scripting · storage · declarativeContent"],
];

const FR = {
  title: "Spécification technique", subtitle: "Architecture, intégration Dataverse, moteur de chargement, sécurité",
  date: "Juin 2026", toc: "Sommaire",
  s1: "1. Vue d'ensemble",
  s1p1: "Colvio est une extension Chrome **Manifest V3** (React 18 + Vite) pour Microsoft Dynamics 365 / Dataverse. Elle fournit 12 modules d'exploration, de chargement et d'audit, sans aucun backend : toutes les requêtes partent du navigateur de l'utilisateur vers sa propre org, authentifiées par la session existante.",
  statsHead: ["Métrique", "Valeur"],
  stats1: "Lignes de code (src)", stats2: "Composants React", stats3: "Actions API (content script)",
  stats4: "Tests unitaires", stats5: "Bundle panel", stats6: "Dépendances runtime", stats7: "Permissions Chrome",
  onDemand: "à la demande",
  get statsRows() { return COMMON_STATS(this); },
  s2: "2. Architecture",
  s2p1: "Trois contextes d'exécution isolés communiquent par messages Chrome. Le **panel** (React) ne touche jamais Dataverse directement : chaque appel transite par le **service worker** (relais pur) vers le **content script**, seul contexte privilégié, qui exécute le `fetch` same-origin avec les cookies de session.",
  s2aT: "Composants",
  s2comp: [
    "`panel` (src/) — l'application React : 24 composants, un module = un onglet. Le bridge (`d365-bridge.js`) expose l'API typée, gère le rate-limit (30 req/s), le cache et les pools de workers des opérations bulk.",
    "`background.js` — service worker minimal : relais de messages panel ↔ content script, suivi de l'onglet D365 actif. Rejette tout message dont `sender.id` n'est pas l'extension.",
    "`content.js` — injecté sur `*.dynamics.com` : extraction du contexte org, **42 actions** (query, metadata, batch…), validation des entrées (regex noms d'entités/champs, GUIDs, strip des caractères de contrôle), construction des $batch, back-off 429.",
  ],
  s2bT: "Protocole de messages",
  s2msg: "Requête : `{__d365InspectorRequest, id, action, params, d365TabId}` ; réponse : `{result}` ou `{error}`. Timeouts côté bridge : 30 s standard, 5 min pour les opérations bulk. Les chunks bulk sont plafonnés à 500 enregistrements par message pour rester sous la limite IPC de 64 Mo de Chrome.",
  s2msgb: [
    "Erreurs 401/403 → signal `SESSION_EXPIRED` propagé à l'UI (bouton Reconnect).",
    "Annulation bulk : le bridge envoie `abortBatch` ; le content script arrête retries 429 et chunks restants (`resetBatchAbort` au début de chaque run).",
  ],
  s3: "3. Modules",
  s3p1: "Un module = un composant React monté dans son ErrorBoundary (un crash n'affecte pas les autres onglets).",
  modHead: ["Module", "Rôle technique"],
  modRows: [
    ["Data Explorer", "4 modes de requête (Builder/OData/FetchXML/SQL), pagination auto (nextLink + paging cookies), virtual scrolling, édition inline (PATCH), bulk update/delete."],
    ["SQL → FetchXML", "Parseur dédié (`sqlToFetchXml.js`, 43 tests) : SELECT/JOIN/WHERE/GROUP BY/agrégats → link-entity, attributs, filtres."],
    ["API Tester", "Action `customRequest` : méthode whitelistée, hôte re-validé deux fois, timeout 60 s, réponse brute (statut/headers/body) non interprétée."],
    ["Data Loader", "Voir section 5 — parsing, transforms, 4 modes, moteur $batch."],
    ["Show All Data / Metadata", "EntityDefinitions + attributs ; exports CSV dictionnaire de données et OptionSets."],
    ["Schema (ERD) / Relationships", "Rendu SVG custom (drag/zoom/pan), exports PNG 2x / SVG / Mermaid."],
    ["Solutions / Translations", "Composants de solution résolus (13 types) ; labels multilingues via LocLabels, publication auto."],
    ["Recycle Bin", "FetchXML datasource='bin' + unbound Restore action (PK only); recyclebinconfig enablement detection; MS limitations surfaced."],
    ["Audit History / System Ops", "audits + RetrieveAuditDetails per entry; asyncoperation state machine (cancel 3/32, resume), plugintracelog viewer."],
    ["Schema diff", "JSON schema snapshots (getFields per table) + ranked diff vs current org."],
    ["Users & Licenses / Security Audit / Login History", "Pagination complète systemusers, privilèges par rôle (FetchXML), audit logs (logins). Onglets masqués sans droits."],
  ],
  s4: "4. Intégration Dataverse",
  s4aT: "Contexte & authentification",
  s4ctx: "Le content script extrait `clientUrl` et la version d'API du contexte de la page D365. Tous les appels sont des `fetch` **same-origin** avec `credentials:\"same-origin\"` — les cookies de session Azure AD/Entra portent l'authentification. Aucun token n'est extrait, stocké ni manipulé.",
  s4bT: "Détection d'environnement",
  s4env: "`RetrieveCurrentOrganization` fournit `OrganizationType` (Production, Sandbox, CustomerTest→UAT, Trial…) — source de vérité du badge d'environnement. Une heuristique sur le hostname (sandbox, uat, dev, recette…) sert uniquement de secours pour les orgs qui n'exposent pas l'API.",
  s4cT: "Cache de métadonnées",
  s4cache: "Double niveau : mémoire (session) + `chrome.storage.local` (persistant). Les clés sont **préfixées par l'org** (`d365_cache_<org>_…`) — aucun mélange entre environnements.",
  cacheHead: ["Donnée", "TTL", "Contenu"],
  cacheRows: [
    ["Entités", "2 h", "logical name, display name, EntitySetName"],
    ["Champs", "1 h", "type, requis, IsValidForCreate/Update, custom"],
    ["Lookups / OptionSets", "1 h", "relations N:1, valeurs d'option"],
    ["EntitySetName (résolution unitaire)", "24 h", "nom de collection exact (pluriels irréguliers)"],
  ],
  s5: "5. Moteur du Data Loader",
  s5aT: "Parsing (loaderUtils.js — testé unitairement)",
  s5parse: "Parseur **RFC-4180** caractère par caractère : guillemets, délimiteurs et sauts de ligne imbriqués, `\"\"` échappés. Détection du délimiteur : tabulation prioritaire (collage Excel), sinon comptage `;` vs `,` hors guillemets. Les fichiers Excel sont lus **directement en lignes** (sheet_to_json, pas d'aller-retour CSV). Valeurs trimées, zéros en tête préservés (pas de coercition numérique).",
  s5bT: "Transforms",
  s5transforms: "`applyTransform(valeur, transform, optionMap)` — fonctions pures testées : picklist/statecode (label→valeur via OptionSet préchargé, **lookup du label avant** le passthrough numérique strict), date_iso (DateOnly verbatim, dd/mm/yyyy, bascule US si mois > 12, heure 24h/AM-PM → ISO local→UTC), int/float conscients de la locale (espaces/NBSP, virgule décimale, milliers), booléens EN/FR. Les labels non convertis sont collectés et affichés en fin de run.",
  s5cT: "Les 4 modes",
  s5modes: "La clé (PK ou alternate key mono-attribut) adresse l'enregistrement dans l'URL — jamais dupliquée dans le body (`buildClean` la retire en défense). **UPDATE** : `If-Match: *` sur chaque PATCH du $batch **et** du fallback série ; lignes à clé vide rejetées côté client ; pré-check d'existence optionnel (requêtes OR par 80, normalisation des GUIDs des deux côtés, fallback par valeur en cas de 400, jamais d'abort global). **UPSERT** par alt-key : binding direct `entityset(champ='valeur')`. **DELETE** : DELETE par clé, mêmes garanties de log.",
  s5dT: "Moteur $batch",
  s5batch: "Le bridge découpe en chunks (≤500) distribués sur un pool de workers (1-10, défaut 6). Le content script construit le multipart : **un changeset par enregistrement** (atomicité par ligne, pas de rollback de lot), headers If-Match/MSCRM injectés par opération. Réponses parsées par Content-ID positionnel → log par ligne. 429 : retry avec `Retry-After` (cap 30 s, 4 tentatives) au niveau $batch **et** dans `dvRequest` (résolutions, pré-checks).",
  s5eT: "Annulation",
  s5cancel: "Trois niveaux : le pool du bridge cesse de distribuer (`shouldAbort`), le content script reçoit `abortBatch` (flag de run) qui interrompt les retries 429 en attente et les chunks restants, et `resetBatchAbort` réarme au run suivant. Garantie : **aucune écriture après l'annulation**.",
  s5fT: "Journalisation",
  s5log: "Deux structures : `fullLog` (ref, hors React — toutes les lignes, O(1) mémoire par ligne) et un buffer d'affichage borné à 2 000 entrées (ring buffer, compteurs agrégés). Le détail par ligne reconstruit la requête exacte (mêmes transforms + optionMaps que l'envoi). Exports : log complet, erreurs seules, en CSV protégé.",
  s6: "6. Sécurité",
  s6p1: "Audit complet (4 dimensions) + revue de code à 7 angles en juin 2026 : **0 finding critique ou élevé ouvert**. Toutes les écritures restent soumises aux rôles Dataverse côté serveur.",
  s6b: [
    "**Zéro egress** : tous les `fetch` ciblent l'org de l'utilisateur ; pas d'analytics, télémétrie, CDN ou fonts externes.",
    "Validation systématique côté content script : regex noms entités/champs, GUIDs, strip des caractères de contrôle dans les clés (anti-CRLF dans les $batch).",
    "API Tester : hôte re-validé après assemblage de l'URL finale ; historique avec **headers secrets masqués**.",
    "Exports CSV : préfixe anti-injection de formules ; XLSX : cellules typées (les chaînes y sont inertes).",
    "Boosters MSCRM conditionnés au privilège `prvBypassCustomPlugins` (System Administrator).",
    "CSP explicite sur panel.html ; marqueur du content script non-énumérable ; `sender.id` vérifié dans le service worker.",
  ],
  s7: "7. Performance",
  s7b: [
    "Rate-limit client 30 req/s + back-off 429 ; pools de workers bulk (6 par défaut, 52 connexions max Dataverse).",
    "Virtual scrolling (~35 lignes rendues quel que soit le volume) ; live log borné (2 000) + ref complète hors re-render.",
    "xlsx **lazy-loadé** : panel ~490 KB, le chunk xlsx (~430 KB) ne charge qu'au drop/export Excel.",
    "Cache métadonnées 2 niveaux ; debounce des recherches ; préchargement parallèle des OptionSets.",
  ],
  s8: "8. Build, tests et release",
  s8p1: "Vite (build < 2 s) + script post-build (copie manifest/content/background, icônes). **207 tests Vitest** : parseur SQL (43), validations (30), loaderUtils (transforms, parser RFC-4180, résolution EntitySet) et utilitaires.",
  s8b: [
    "`npm run build` → `dist/` chargeable en mode développeur ; zip de release `colvio-<version>.zip`.",
    "Flux : branche → PR → squash-merge → build → zip → upload Chrome Web Store.",
    "Versionnage synchronisé `package.json` + `manifest.json` ; CHANGELOG.md exhaustif.",
  ],
  s8n: "Code source : github.com/zmissoum/colvio — licence MIT.",
};

const EN = {
  title: "Technical Specification", subtitle: "Architecture, Dataverse integration, load engine, security",
  date: "June 2026", toc: "Contents",
  s1: "1. Overview",
  s1p1: "Colvio is a **Manifest V3** Chrome extension (React 18 + Vite) for Microsoft Dynamics 365 / Dataverse. It ships 12 exploration, loading and audit modules with no backend at all: every request goes from the user's browser to their own org, authenticated by the existing session.",
  statsHead: ["Metric", "Value"],
  stats1: "Lines of code (src)", stats2: "React components", stats3: "API actions (content script)",
  stats4: "Unit tests", stats5: "Panel bundle", stats6: "Runtime dependencies", stats7: "Chrome permissions",
  onDemand: "on demand",
  get statsRows() { return COMMON_STATS(this); },
  s2: "2. Architecture",
  s2p1: "Three isolated execution contexts communicate over Chrome messaging. The **panel** (React) never touches Dataverse directly: every call relays through the **service worker** (pure relay) to the **content script** — the only privileged context — which performs the same-origin `fetch` with session cookies.",
  s2aT: "Components",
  s2comp: [
    "`panel` (src/) — the React app: 24 components, one module = one tab. The bridge (`d365-bridge.js`) exposes the typed API and owns rate limiting (30 req/s), caching, and the bulk worker pools.",
    "`background.js` — minimal service worker: panel ↔ content-script relay, active D365 tab tracking. Rejects any message whose `sender.id` isn't the extension.",
    "`content.js` — injected on `*.dynamics.com`: org context extraction, **42 actions** (query, metadata, batch…), input validation (entity/field regexes, GUIDs, control-char stripping), $batch building, 429 back-off.",
  ],
  s2bT: "Message protocol",
  s2msg: "Request: `{__d365InspectorRequest, id, action, params, d365TabId}`; response: `{result}` or `{error}`. Bridge timeouts: 30 s standard, 5 min for bulk operations. Bulk chunks are capped at 500 records per message to stay under Chrome's 64 MB IPC limit.",
  s2msgb: [
    "401/403 → `SESSION_EXPIRED` signal surfaced to the UI (Reconnect button).",
    "Bulk cancellation: the bridge sends `abortBatch`; the content script stops pending 429 retries and remaining chunks (`resetBatchAbort` re-arms at each run start).",
  ],
  s3: "3. Modules",
  s3p1: "One module = one React component mounted in its own ErrorBoundary (a crash never takes down other tabs).",
  modHead: ["Module", "Technical role"],
  modRows: [
    ["Data Explorer", "4 query modes (Builder/OData/FetchXML/SQL), auto-pagination (nextLink + paging cookies), virtual scrolling, inline edit (PATCH), bulk update/delete."],
    ["SQL → FetchXML", "Dedicated parser (`sqlToFetchXml.js`, 43 tests): SELECT/JOIN/WHERE/GROUP BY/aggregates → link-entity, attributes, filters."],
    ["API Tester", "`customRequest` action: whitelisted methods, host validated twice, 60 s timeout, raw response (status/headers/body) returned unmodified."],
    ["Data Loader", "See section 5 — parsing, transforms, 4 modes, $batch engine."],
    ["Show All Data / Metadata", "EntityDefinitions + attributes; data-dictionary and OptionSet CSV exports."],
    ["Schema (ERD) / Relationships", "Custom SVG rendering (drag/zoom/pan), PNG 2x / SVG / Mermaid exports."],
    ["Solutions / Translations", "Solution components resolved (13 types); multilingual labels via LocLabels, auto-publish."],
    ["Recycle Bin", "FetchXML datasource='bin' + unbound Restore action (PK only); recyclebinconfig enablement detection; MS limitations surfaced."],
    ["Audit History / System Ops", "audits + RetrieveAuditDetails per entry; asyncoperation state machine (cancel 3/32, resume), plugintracelog viewer."],
    ["Schema diff", "JSON schema snapshots (getFields per table) + ranked diff vs current org."],
    ["Users & Licenses / Security Audit / Login History", "Full systemusers pagination, per-role privileges (FetchXML), audit logs (logins). Tabs hidden without rights."],
  ],
  s4: "4. Dataverse integration",
  s4aT: "Context & authentication",
  s4ctx: "The content script extracts `clientUrl` and the API version from the D365 page context. All calls are **same-origin** `fetch` with `credentials:\"same-origin\"` — Azure AD/Entra session cookies carry authentication. No token is ever extracted, stored or handled.",
  s4bT: "Environment detection",
  s4env: "`RetrieveCurrentOrganization` provides `OrganizationType` (Production, Sandbox, CustomerTest→UAT, Trial…) — the authoritative source for the environment badge. A hostname heuristic (sandbox, uat, dev…) is fallback only.",
  s4cT: "Metadata cache",
  s4cache: "Two tiers: in-memory (session) + `chrome.storage.local` (persistent). Keys are **org-prefixed** (`d365_cache_<org>_…`) — no cross-environment bleed.",
  cacheHead: ["Data", "TTL", "Contents"],
  cacheRows: [
    ["Entities", "2 h", "logical name, display name, EntitySetName"],
    ["Fields", "1 h", "type, required, IsValidForCreate/Update, custom"],
    ["Lookups / OptionSets", "1 h", "N:1 relationships, option values"],
    ["EntitySetName (single resolution)", "24 h", "exact collection name (irregular plurals)"],
  ],
  s5: "5. Data Loader engine",
  s5aT: "Parsing (loaderUtils.js — unit-tested)",
  s5parse: "Character-level **RFC-4180** parser: quoted fields, embedded delimiters and line breaks, escaped `\"\"`. Delimiter detection: an unquoted tab wins (Excel paste), else `;` vs `,` count outside quotes. Excel files are read **straight to rows** (sheet_to_json, no CSV round-trip). Values trimmed, leading zeros preserved (no numeric coercion).",
  s5bT: "Transforms",
  s5transforms: "`applyTransform(value, transform, optionMap)` — pure, tested functions: picklist/statecode (label→value via preloaded OptionSet, **label lookup before** strict numeric passthrough), date_iso (DateOnly verbatim, dd/mm/yyyy, US swap when month > 12, 24h/AM-PM time → local→UTC ISO), locale-aware int/float (spaces/NBSP, decimal comma, thousands), EN/FR booleans. Unconverted labels are collected and surfaced after the run.",
  s5cT: "The 4 modes",
  s5modes: "The key (PK or single-attribute alternate key) addresses the record in the URL — never duplicated in the body (`buildClean` strips it as defense). **UPDATE**: `If-Match: *` on every $batch PATCH **and** on the serial fallback; empty-key rows rejected client-side; optional existence pre-check (OR queries of 80, GUID normalization on both sides, per-value fallback on 400, never a global abort). **UPSERT** by alt-key: direct `entityset(field='value')` binding. **DELETE**: DELETE by key, same logging guarantees.",
  s5dT: "$batch engine",
  s5batch: "The bridge chunks (≤500) across a worker pool (1-10, default 6). The content script builds the multipart: **one changeset per record** (per-row atomicity, no batch rollback), If-Match/MSCRM headers injected per operation. Responses parsed by positional Content-ID → per-row log. 429: `Retry-After` retry (30 s cap, 4 attempts) at the $batch level **and** inside `dvRequest` (resolutions, pre-checks).",
  s5eT: "Cancellation",
  s5cancel: "Three levels: the bridge pool stops dispatching (`shouldAbort`), the content script receives `abortBatch` (run-scoped flag) which interrupts waiting 429 retries and remaining chunks, and `resetBatchAbort` re-arms the next run. Guarantee: **no writes after cancel**.",
  s5fT: "Logging",
  s5log: "Two structures: `fullLog` (ref, outside React — every row, O(1) memory per row) and a display buffer bounded at 2,000 entries (ring buffer, aggregated counters). Per-row details rebuild the exact request (same transforms + optionMaps as the send). Exports: full log, errors only, injection-protected CSV.",
  s6: "6. Security",
  s6p1: "Full 4-dimension audit + 7-angle code review in June 2026: **0 open critical or high findings**. All writes remain subject to server-side Dataverse roles.",
  s6b: [
    "**Zero egress**: every `fetch` targets the user's own org; no analytics, telemetry, CDNs or external fonts.",
    "Systematic content-script validation: entity/field regexes, GUIDs, control-char stripping in key values (anti-CRLF in $batch).",
    "API Tester: host re-validated after final URL assembly; history saved with **secret headers redacted**.",
    "CSV exports: formula-injection prefix; XLSX: typed cells (strings are inert there).",
    "MSCRM boosters gated on the `prvBypassCustomPlugins` privilege (System Administrator).",
    "Explicit CSP on panel.html; non-enumerable content-script marker; `sender.id` checked in the service worker.",
  ],
  s7: "7. Performance",
  s7b: [
    "Client rate-limit 30 req/s + 429 back-off; bulk worker pools (default 6; Dataverse allows 52 connections).",
    "Virtual scrolling (~35 rendered rows regardless of volume); bounded live log (2,000) + full ref outside re-renders.",
    "**Lazy-loaded xlsx**: panel ~490 KB; the ~430 KB xlsx chunk loads only on Excel drop/export.",
    "Two-tier metadata cache; debounced searches; parallel OptionSet preloading.",
  ],
  s8: "8. Build, tests & release",
  s8p1: "Vite (build < 2 s) + post-build script (manifest/content/background copy, icons). **207 Vitest tests**: SQL parser (43), validations (30), loaderUtils (transforms, RFC-4180 parser, EntitySet resolution) and utilities.",
  s8b: [
    "`npm run build` → `dist/` loadable in Developer Mode; release zip `colvio-<version>.zip`.",
    "Flow: branch → PR → squash-merge → build → zip → Chrome Web Store upload.",
    "Version kept in sync across `package.json` + `manifest.json`; exhaustive CHANGELOG.md.",
  ],
  s8n: "Source code: github.com/zmissoum/colvio — MIT license.",
};

(async () => {
  await writeDoc(build(FR), "Colvio_Spec_Technique.docx");
  await writeDoc(build(EN), "Colvio_Technical_Spec_EN.docx");
})();
