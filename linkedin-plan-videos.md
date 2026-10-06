# Plan LinkedIn — les fonctionnalités de Colvio en vidéo

**Objectif :** présenter les fonctionnalités de Colvio en vidéo, et rien d'autre. Les posts 1 à 25 (`linkedin-posts.md`) ont déjà présenté Colvio et annoncé chaque nouveauté ; aucun n'a encore montré les fonctionnalités en action. Donc ici : pas d'annonce de version, pas de « quoi de neuf », pas de coulisses. Un post = une vidéo + ce qu'elle montre.

**21 posts, 21 vidéos :** la présentation générale (2 min 54, 20 modules) puis une vidéo détaillée par module (52 s à 1 min 54) — tous les modules sauf System Ops, toutes en anglais et en français, légendes incrustées, données de démo uniquement.

**Démarrage :** J = le premier mardi après que le Chrome Web Store affiche la **v1.11.174** (ou plus récente) — les vidéos montrent Teams, Stockage, le Login History actuel et les démos enrichies de la v1.11.174, absents des versions plus anciennes du store.

## Règles de publication

- Page **Colvio**, voix « nous / Colvio » (jamais « je »).
- Importer le **MP4 directement sur LinkedIn** (pas de lien YouTube : une vidéo native touche beaucoup plus de monde). Les légendes sont incrustées : la vidéo se comprend sans le son.
- **Lien en premier commentaire**, jamais dans le texte : `🔗 Chrome Web Store : https://chromewebstore.google.com/detail/edieednbdaclheikneelkjfbckibhdgl · Code source : https://github.com/zmissoum/colvio`
- Répondre à **tous les commentaires dans la première heure**.
- **Version française :** post séparé le même jour à 12h15, ou la fonction « ajouter une traduction » de LinkedIn si elle est disponible.
- Chaque affirmation des textes est visible dans la vidéo ou dans ses légendes (`tools/video/deep/<module>.mjs`).

## Calendrier

Deux posts par semaine le premier mois (mardi 8h30, jeudi 17h30), puis un par semaine le mardi. Les dates sont un exemple si la v1.11.174 est en ligne le lundi 12 octobre, avec une pause pendant les fêtes. Cochez « Publié » au fur et à mesure.

| Post | Sem. | Créneau | Date (exemple) | Sujet | Vidéo (`tools/video/out/…`) | Durée | Publié |
|---|---|---|---|---|---|---|---|
| 26 | 1 | Mar 8h30 | 13/10 | Colvio en quelques minutes (présentation) | `video/colvio_tour_en.mp4` / `_fr.mp4` | 2 min 54 | ☐ |
| 27 | 1 | Jeu 17h30 | 15/10 | Data Explorer | `deep/colvio_explorer_en.mp4` / `_fr.mp4` | 94 s | ☐ |
| 28 | 2 | Mar 8h30 | 20/10 | Data Loader | `deep/colvio_loader_en.mp4` / `_fr.mp4` | 95 s | ☐ |
| 29 | 2 | Jeu 17h30 | 22/10 | Security Audit | `deep/colvio_security_en.mp4` / `_fr.mp4` | 90 s | ☐ |
| 30 | 3 | Mar 8h30 | 27/10 | Adoption | `deep/colvio_adoption_en.mp4` / `_fr.mp4` | 87 s | ☐ |
| 31 | 3 | Jeu 17h30 | 29/10 | Stockage | `deep/colvio_storage_en.mp4` / `_fr.mp4` | 62 s | ☐ |
| 32 | 4 | Mar 8h30 | 03/11 | Teams | `deep/colvio_teams_en.mp4` / `_fr.mp4` | 73 s | ☐ |
| 33 | 4 | Jeu 17h30 | 05/11 | Show All Data | `deep/colvio_showalldata_en.mp4` / `_fr.mp4` | 67 s | ☐ |
| 34 | 5 | Mar 8h30 | 10/11 | Apps | `deep/colvio_apps_en.mp4` / `_fr.mp4` | 68 s | ☐ |
| 35 | 6 | Mar 8h30 | 17/11 | API Tester | `deep/colvio_apitester_en.mp4` / `_fr.mp4` | 1 min 54 | ☐ |
| 36 | 7 | Mar 8h30 | 24/11 | Recycle Bin | `deep/colvio_recyclebin_en.mp4` / `_fr.mp4` | 79 s | ☐ |
| 37 | 8 | Mar 8h30 | 01/12 | Business Units | `deep/colvio_bu_en.mp4` / `_fr.mp4` | 81 s | ☐ |
| 38 | 9 | Mar 8h30 | 08/12 | Solutions | `deep/colvio_solutions_en.mp4` / `_fr.mp4` | 70 s | ☐ |
| 39 | 10 | Mar 8h30 | 15/12 | Variables d'environnement | `deep/colvio_envvars_en.mp4` / `_fr.mp4` | 75 s | ☐ |
| 40 | 11 | Mar 8h30 | 05/01 | Automation | `deep/colvio_automation_en.mp4` / `_fr.mp4` | 72 s | ☐ |
| 41 | 12 | Mar 8h30 | 12/01 | Metadata | `deep/colvio_metadata_en.mp4` / `_fr.mp4` | 83 s | ☐ |
| 42 | 13 | Mar 8h30 | 19/01 | Schema | `deep/colvio_schema_en.mp4` / `_fr.mp4` | 76 s | ☐ |
| 43 | 14 | Mar 8h30 | 26/01 | Relationships | `deep/colvio_relationships_en.mp4` / `_fr.mp4` | 59 s | ☐ |
| 44 | 15 | Mar 8h30 | 02/02 | Users & Licenses | `deep/colvio_licenses_en.mp4` / `_fr.mp4` | 64 s | ☐ |
| 45 | 16 | Mar 8h30 | 09/02 | Translations | `deep/colvio_translations_en.mp4` / `_fr.mp4` | 64 s | ☐ |
| 46 | 17 | Mar 8h30 | 16/02 | Login History | `deep/colvio_logins_en.mp4` / `_fr.mp4` | 52 s | ☐ |

Les vidéos se régénèrent avec `node make-deep.mjs --module=<module>` et `node make-video.mjs` dans `tools/video` (voir son README).

## Les 21 textes (EN puis FR)

### Post 26 — Colvio in a few minutes (tour) (2 min 54)

**EN**

🎬 2 min 54, 20 modules, zero setup.

We keep getting the same question: "OK, but what does Colvio actually DO?"

Here's the answer, in motion: 20 modules on demo data, back to back.

🔎 Data: query any table (Builder, OData, FetchXML or SQL), load a spreadsheet, restore deleted records, inspect every field of a record
🛠 Develop: API tester, metadata, automation, apps, relationships, data model diagram, solutions, environment variables, translations
🛡 Admin: users & licenses, business units, security roles, teams, adoption, login history, storage

What you won't see in the video: a sign-up screen, an API key, an app registration. Colvio runs in your browser on the Dynamics 365 session you already have, and talks to nothing but your own org.

Over the next weeks we'll take them one by one, each in its own video.

Which module would you open first? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #OpenSource

**FR**

🎬 2 min 54, 20 modules, zéro configuration.

On nous pose souvent la même question : « OK, mais concrètement, Colvio fait quoi ? »

La réponse, en vidéo : 20 modules sur des données de démo, l'un après l'autre.

🔎 Données : interroger n'importe quelle table (Builder, OData, FetchXML ou SQL), charger un tableur, restaurer des enregistrements supprimés, inspecter chaque champ d'un enregistrement
🛠 Développement : API tester, métadonnées, automatisations, apps, relations, schéma du modèle de données, solutions, variables d'environnement, traductions
🛡 Administration : utilisateurs et licences, business units, rôles de sécurité, teams, adoption, historique de connexion, stockage

Ce que vous ne verrez pas dans la vidéo : un écran d'inscription, une clé d'API, une app registration. Colvio tourne dans votre navigateur, sur la session Dynamics 365 que vous avez déjà, et ne parle qu'à votre propre org.

Dans les semaines qui viennent, on les reprend un par un, chacun dans sa vidéo.

Quel module ouvririez-vous en premier ? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #OpenSource

---

### Post 27 — Data Explorer (`explorer`, 94 s)

**EN**

⏱ 94 seconds inside Colvio's Data Explorer.

One table, one query, and everything you can do with it in eight steps:

1. Pick a table and its columns (every table shows its row count)
2. Filter visually, with operators that fit each column type
3. Run it (no 5,000-row cap), then sort and narrow down the results
4. See the same query in OData or FetchXML, or write SQL: run natively by Dataverse, or converted to FetchXML
5. Double-click a cell to edit it: the value is checked against the column's type before anything is sent
6. Tick records, pick a column and a value: one bulk update, confirmation first
7. Find duplicates on the columns YOU choose, with the extras pre-selected for cleanup
8. Query tabs, a history with filter values redacted, and Excel / CSV / JSON exports

All on demo data. No real org on screen.

Which of the eight do you still do by hand today? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #DataManagement

**FR**

⏱ 94 secondes dans le Data Explorer de Colvio.

Une table, une requête, et tout ce qu'on peut en faire, en huit étapes :

1. Choisir une table et ses colonnes (chaque table affiche son volume)
2. Filtrer visuellement, avec les opérateurs adaptés au type de chaque colonne
3. Exécuter (sans plafond à 5 000 lignes), puis trier et affiner les résultats
4. Voir la même requête en OData ou en FetchXML, ou écrire du SQL : exécuté nativement par Dataverse, ou converti en FetchXML
5. Double-cliquer une cellule pour la modifier : la valeur est vérifiée selon le type de la colonne avant tout envoi
6. Cocher des enregistrements, choisir une colonne et une valeur : une mise à jour en masse, après confirmation
7. Trouver les doublons sur les colonnes que VOUS choisissez, l'excédent présélectionné pour le nettoyage
8. Des onglets de requêtes, un historique sans les valeurs de filtre, et les exports Excel / CSV / JSON

Tout sur des données de démo. Aucune vraie org à l'écran.

Laquelle de ces huit étapes faites-vous encore à la main aujourd'hui ? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #DataManagement

---

### Post 28 — Data Loader (`loader`, 95 s)

**EN**

📥 From a spreadsheet to Dataverse, without a single blind click.

▶️ 95 seconds in Colvio's Data Loader:

→ Paste rows straight from Excel: the delimiter is detected, the headers come along
→ Pick the target table: columns named after a field map themselves
→ Four modes: CREATE, UPSERT on an alternate key, UPDATE that never creates, DELETE with a typed confirmation, and Delta skips rows that wouldn't change
→ Checked before anything is sent: the exact record that will be written, and pre-flight warnings
→ One transform per column: option-set labels to values, HTML to plain text
→ A dry run that writes nothing, then the real load: every row lands in a live log, and any row shows the exact request sent
→ Rollback: type ROLLBACK and the records this run created are deleted again

Demo data in the video. Free and open source.

What's the biggest file you've ever had to load into Dataverse? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #DataMigration

**FR**

📥 D'un tableur à Dataverse, sans un seul clic à l'aveugle.

▶️ 95 secondes dans le Data Loader de Colvio :

→ Collez les lignes directement depuis Excel : le séparateur est détecté, les en-têtes suivent
→ Choisissez la table cible : les colonnes qui portent le nom d'un champ se mappent toutes seules
→ Quatre modes : CREATE, UPSERT sur une clé alternative, UPDATE qui ne crée jamais, DELETE avec confirmation saisie, et le mode Delta ignore les lignes qui ne changeraient rien
→ Vérifié avant tout envoi : l'enregistrement exact qui sera écrit, et les alertes de contrôle préalable
→ Une transformation par colonne : libellés d'option set en valeurs, HTML en texte brut
→ Une simulation qui n'écrit rien, puis le vrai chargement : chaque ligne arrive dans un journal en direct, et chacune montre la requête exacte envoyée
→ Retour arrière : tapez ROLLBACK et les enregistrements créés par ce chargement sont supprimés

Données de démo dans la vidéo. Gratuit et open source.

Quel est le plus gros fichier que vous ayez dû charger dans Dataverse ? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #DataMigration

---

### Post 29 — Security Audit (`security`, 90 s)

**EN**

🛡 "Who can delete accounts in this org?"

The question every audit asks, and the one the role editor makes you answer role by role.

▶️ 90 seconds in Colvio's Security Audit:

→ Every role in plain words: Org-level grants and sensitive privileges (deletes, exports, user and role admin, customization) counted and flagged
→ The matrix view: each table × the 8 access rights, depth drawn as a filling circle
→ Who really holds the role: members across every business-unit copy, and the teams that pass it on without it ever showing on the user
→ Assigning the role to a list of people: paste their emails, Colvio picks each user's own business-unit copy of the role
→ Org-wide in one scan: pick a right and a minimum depth ("Delete" at Organization), then flip it by table, exportable to CSV or Excel

Demo data in the video. Free and open source.

When did you last review who can delete what? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #SecurityAudit

**FR**

🛡 « Qui peut supprimer des comptes dans cette org ? »

La question que pose chaque audit, et à laquelle l'éditeur de rôles vous fait répondre rôle par rôle.

▶️ 90 secondes dans l'audit de sécurité de Colvio :

→ Chaque rôle en clair : privilèges niveau Organisation et privilèges sensibles (suppressions, exports, gestion des utilisateurs et des rôles, personnalisation) comptés et signalés
→ La vue matrice : chaque table × les 8 droits d'accès, la profondeur dessinée en cercle qui se remplit
→ Qui détient vraiment le rôle : les membres de toutes les copies du rôle par business unit, et les teams qui le transmettent sans qu'il apparaisse jamais sur l'utilisateur
→ Attribuer le rôle à une liste de personnes : collez leurs emails, Colvio prend pour chacun la copie du rôle de sa propre business unit
→ Toute l'org en une analyse : choisissez un droit et une profondeur minimale (« Delete » niveau Organisation), puis regroupez par table, exportable en CSV ou Excel

Données de démo dans la vidéo. Gratuit et open source.

À quand remonte votre dernière revue de « qui peut supprimer quoi » ? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #SecurityAudit

---

### Post 30 — Adoption (`adoption`, 87 s)

**EN**

📈 "How many people actually use the CRM we pay for?"

Management asks. Nobody has the number ready.

▶️ 87 seconds in Colvio's Adoption module:

→ Access events, distinct users, DAU / WAU / MAU, read from Dataverse's own access audit
→ The trend, day by day: logins, distinct users, or both
→ Who uses it most, by active days or most recent access
→ The list nobody has ready: users who never signed in
→ Everyone in scope with license and inactivity: who hasn't been in for 30 days or more
→ Filter by security role or business unit, sub-units included; 7, 30, 90 days or a custom range
→ Compare with the previous period, export to CSV or Excel, or a 5-slide PowerPoint

Honest by design: Dataverse records access at most once per user per interval (4 h by default), so Colvio counts "access events", not logins, and service accounts are left out by default. It needs "Audit user access" turned on, and the screen says so.

If you could know one adoption number for your org today, which would it be? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #Adoption

**FR**

📈 « Combien de personnes utilisent vraiment le CRM qu'on paie ? »

La direction pose la question. Personne n'a le chiffre sous la main.

▶️ 87 secondes dans le module Adoption de Colvio :

→ Événements d'accès, utilisateurs distincts, DAU / WAU / MAU, lus dans l'audit d'accès de Dataverse
→ La tendance jour par jour : connexions, utilisateurs distincts, ou les deux
→ Qui l'utilise le plus, par jours actifs ou par accès le plus récent
→ La liste que personne n'a sous la main : les utilisateurs qui ne se sont jamais connectés
→ Tout le périmètre avec licence et inactivité : qui n'est pas venu depuis 30 jours ou plus
→ Filtre par rôle de sécurité ou business unit, sous-BU comprises ; 7, 30, 90 jours ou une période libre
→ Comparaison avec la période précédente, export CSV ou Excel, ou un PowerPoint de 5 diapositives

Honnête par conception : Dataverse enregistre au plus un accès par utilisateur et par intervalle (4 h par défaut), donc Colvio compte des « événements d'accès », pas des connexions, et les comptes de service sont exclus par défaut. Il faut que l'audit de l'accès utilisateur (« Audit user access ») soit activé, et l'écran le dit.

Si vous pouviez connaître un seul chiffre d'adoption de votre org aujourd'hui, ce serait lequel ? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #Adoption

---

### Post 31 — Storage (`storage`, 62 s)

**EN**

💾 "We're over our Dataverse capacity. Which tables are filling it?"

The admin center tells you HOW MUCH you use. It doesn't tell you WHERE.

▶️ 62 seconds in Colvio's Storage module:

→ Row counts for every table in the org, in seconds, read from Dataverse's own snapshot (refreshed by the platform, at most 24 h old)
→ The tables that grow silently (audit, system jobs, workflow logs, plug-in traces, emails, import leftovers), each with the cleanup that applies
→ File storage measured in real bytes per table: notes, file and image columns, email attachments
→ Filter by storage class (Database, File, Log) or search any table
→ Refresh on demand

What it won't pretend: the GB you're billed on only live in the Power Platform admin center. Colvio says so on screen and links you there.

What's the biggest table in your org, and would you have guessed it? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #Storage

**FR**

💾 « On a dépassé notre capacité Dataverse. Quelles tables la remplissent ? »

Le centre d'administration vous dit COMBIEN vous consommez. Pas OÙ.

▶️ 62 secondes dans le module Stockage de Colvio :

→ Le volume de chaque table de l'org en quelques secondes, lu dans le snapshot de Dataverse lui-même (rafraîchi par la plateforme, 24 h maximum)
→ Les tables qui grossissent en silence (audit, travaux système, journaux de workflow, traces de plug-ins, emails, restes d'imports), chacune avec le nettoyage adapté
→ Le stockage fichier mesuré en octets réels par table : notes, colonnes fichier et image, pièces jointes d'emails
→ Filtre par type de stockage (Base de données, Fichier, Journal) ou recherche sur n'importe quelle table
→ Actualisation à la demande

Ce qu'il ne prétend pas : les Go qui vous sont facturés ne se lisent que dans le centre d'administration Power Platform. Colvio le dit à l'écran et vous y emmène.

Quelle est la plus grosse table de votre org, et l'auriez-vous devinée ? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #Stockage

---

### Post 32 — Teams (`teams`, 73 s)

**EN**

👥 Some of a user's rights never show on their profile.

In Dataverse, a security role held by a team is inherited by every member, and it doesn't appear in the user's own role list. That's usually where "why can this user do that?" ends.

▶️ 73 seconds in Colvio's Teams module:

→ Every team badged by type (Owner, Entra group, BU default), with one search across name, business unit and administrator
→ An owner team's security roles: the ones its members inherit
→ Entra group teams: the group's Object ID to copy, and the truth about membership: a new group member appears only after their next access
→ Members with access mode, license type and status, exportable
→ Access teams (one per shared record, sometimes thousands) loaded only when you ask

Demo data in the video. Free and open source.

Owner teams or Entra groups: which does your org rely on? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #EntraID

**FR**

👥 Certains droits d'un utilisateur n'apparaissent jamais sur sa fiche.

Dans Dataverse, un rôle de sécurité porté par une team est hérité par chacun de ses membres, et il n'apparaît pas dans la liste des rôles de l'utilisateur. C'est souvent là que s'arrête la question « pourquoi cet utilisateur peut-il faire ça ? ».

▶️ 73 secondes dans le module Teams de Colvio :

→ Chaque team avec son type (Owner, groupe Entra, team par défaut de BU), et une recherche sur le nom, la business unit et l'administrateur
→ Les rôles de sécurité d'une team owner : ceux dont ses membres héritent
→ Les teams de groupe Entra : l'Object ID du groupe à copier, et la vérité sur l'appartenance : un nouveau membre du groupe n'apparaît qu'après son prochain accès
→ Les membres avec mode d'accès, type de licence et statut, exportables
→ Les teams d'accès (une par enregistrement partagé, parfois des milliers) chargées seulement à la demande

Données de démo dans la vidéo. Gratuit et open source.

Teams owner ou groupes Entra : sur quoi repose votre org ? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #EntraID

---

### Post 33 — Show All Data (`showalldata`, 67 s)

**EN**

👁 The form shows 30 fields. The record has 120.

▶️ 67 seconds in Show All Data:

→ Paste a record URL (or table/GUID): every filled column with its logical name, label and type
→ Type to find a column, by logical name or label
→ Tick "Empty columns" to list every column of the table, filled or not
→ Choice columns show their label, not the stored number
→ "Custom only" keeps your own publishers' columns; Microsoft's msdyn_ and adx_ ones stay out
→ Copy a value, the record's GUID, or the whole record as JSON

On your own org (not shown with demo data): edit a value in place, lookups included, with field security still enforced by Dataverse.

Which field do you always end up hunting for? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #PowerApps

**FR**

👁 Le formulaire affiche 30 champs. L'enregistrement en a 120.

▶️ 67 secondes dans Show All Data :

→ Collez l'URL d'un enregistrement (ou table/GUID) : chaque colonne renseignée avec son nom logique, son libellé et son type
→ Tapez pour trouver une colonne, par nom logique ou par libellé
→ Cochez « Empty columns » pour lister toutes les colonnes de la table, remplies ou non
→ Les colonnes de choix affichent leur libellé, pas le nombre stocké
→ « Custom only » ne garde que les colonnes de vos propres éditeurs ; celles de Microsoft (msdyn_, adx_) restent à l'écart
→ Copiez une valeur, le GUID de l'enregistrement, ou tout l'enregistrement en JSON

Sur votre propre org (non montré avec les données de démo) : modifiez une valeur sur place, lookups compris, la sécurité des champs restant appliquée par Dataverse.

Quel champ finissez-vous toujours par chercher ? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #PowerApps

---

### Post 34 — Apps (`apps`, 68 s)

**EN**

🧩 "Why does this form show up in that app?"

Often because of one checkbox: "include all forms". Left on, it brings every current AND future form of the table into the app, and the maker portal doesn't show that state afterwards.

▶️ 68 seconds in Colvio's Apps module:

→ Each app's tables, forms and views, badged EXPLICIT (hand-picked) or IMPLICIT (brought in by include-all)
→ The modern command-bar buttons the app surfaces
→ A form's subgrids: the child table, the view each one renders, the relationship behind it
→ Open that view: its filters, columns and sort, the answer to "why isn't my row in this subgrid?"
→ Reverse lens: type a form, view or button name and see every app that exposes it
→ One click sends the view's FetchXML to the Data Explorer

Demo data in the video. Free and open source.

Ever had a form appear where nobody added it? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #PowerApps

**FR**

🧩 « Pourquoi ce formulaire apparaît-il dans cette app ? »

Souvent à cause d'une case : « inclure tous les formulaires ». Laissée cochée, elle fait entrer dans l'app chaque formulaire actuel ET futur de la table, et le portail maker n'affiche plus cet état ensuite.

▶️ 68 secondes dans le module Apps de Colvio :

→ Les tables, formulaires et vues de chaque app, marqués EXPLICIT (choisis à la main) ou IMPLICIT (amenés par « inclure tout »)
→ Les boutons modernes de la barre de commandes de l'app
→ Les sous-grilles d'un formulaire : la table enfant, la vue affichée, la relation qui les relie
→ Ouvrez cette vue : ses filtres, ses colonnes, son tri, la réponse à « pourquoi ma ligne n'est pas dans cette sous-grille ? »
→ La recherche inversée : tapez le nom d'un formulaire, d'une vue ou d'un bouton, et voyez toutes les apps qui l'exposent
→ Un clic envoie le FetchXML de la vue dans le Data Explorer

Données de démo dans la vidéo. Gratuit et open source.

Un formulaire est-il déjà apparu là où personne ne l'avait ajouté ? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #PowerApps

---

### Post 35 — API Tester (`apitester`, 1 min 54)

**EN**

🧪 Calling the Dataverse Web API shouldn't start with an app registration.

▶️ 1 min 54 in Colvio's API Tester, on the session you're already signed in with:

→ Seven ready-made requests: WhoAmI, create, upsert by alternate key, delete…
→ Any query after /api/data/v9.2/ ($select, $filter, $top) with status, time, size and pretty-printed JSON
→ Add headers (Prefer for formatted values) and read the ones that come back
→ A JSON editor that names the line of a syntax error
→ Create a record: 204 with the new record's URL, or the record itself with return=representation
→ DELETE asks twice, and requests only go to your own org
→ History with filter and body values blanked, tabs, copy as cURL

Demo data in the video. Free and open source.

What's the first request you'd send? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #WebAPI

**FR**

🧪 Appeler l'API Web de Dataverse ne devrait pas commencer par une app registration.

▶️ 1 min 54 dans l'API Tester de Colvio, sur la session avec laquelle vous êtes déjà connecté :

→ Sept requêtes prêtes à l'emploi : WhoAmI, création, upsert par clé alternative, suppression…
→ N'importe quelle requête après /api/data/v9.2/ ($select, $filter, $top) avec statut, durée, taille et JSON mis en forme
→ Ajoutez des en-têtes (Prefer pour les valeurs formatées) et lisez ceux qui reviennent
→ Un éditeur JSON qui indique la ligne d'une erreur de syntaxe
→ Créez un enregistrement : 204 avec l'URL du nouvel enregistrement, ou l'enregistrement lui-même avec return=representation
→ DELETE demande deux fois, et les requêtes ne partent que vers votre propre org
→ Un historique où les valeurs de filtre et de corps sont masquées, des onglets, la copie en cURL

Données de démo dans la vidéo. Gratuit et open source.

Quelle serait votre première requête ? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #WebAPI

---

### Post 36 — Recycle Bin (`recyclebin`, 79 s)

**EN**

🗑 "Someone deleted 140 accounts last night. Can we get them back?"

If the org keeps deleted records for that table, yes, and Colvio shows you what's in the bin.

▶️ 79 seconds in Colvio's Recycle Bin:

→ Only the tables enabled for restore, with the org's retention
→ Each deleted record with who deleted it and when, plus who created and last modified it
→ Page through a mass delete 100 to 1,000 rows at a time, and search by name across the whole bin
→ Export the list before you restore, as evidence
→ Restore with Dataverse's own Restore action: the record comes back and leaves the bin
→ When a restore is refused (here, a live record already uses the same alternate key), the reason and the fix, record by record
→ The platform's limits spelled out under the list

Demo data in the video. Free and open source.

Has a mass delete ever ruined your morning? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #DataRecovery

**FR**

🗑 « Quelqu'un a supprimé 140 comptes cette nuit. On peut les récupérer ? »

Si l'org conserve les enregistrements supprimés pour cette table, oui, et Colvio vous montre ce que contient la corbeille.

▶️ 79 secondes dans la corbeille de Colvio :

→ Seulement les tables activées pour la restauration, avec la durée de conservation de l'org
→ Chaque enregistrement supprimé avec qui l'a supprimé et quand, ainsi que qui l'a créé et modifié en dernier
→ Parcourez une suppression massive par pages de 100 à 1 000 lignes, et cherchez par nom dans toute la corbeille
→ Exportez la liste avant de restaurer, comme preuve
→ Restaurez avec l'action Restore de Dataverse : l'enregistrement revient et quitte la corbeille
→ Quand une restauration est refusée (ici, un enregistrement existant utilise déjà la même clé alternative), la raison et la solution, enregistrement par enregistrement
→ Les limites de la plateforme expliquées sous la liste

Données de démo dans la vidéo. Gratuit et open source.

Une suppression massive vous a-t-elle déjà gâché une matinée ? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #DataRecovery

---

### Post 37 — Business Units (`bu`, 81 s)

**EN**

🏢 A reorganisation reaches the admin as a spreadsheet of email addresses.

▶️ 81 seconds in Colvio's Business Units module:

→ The whole BU tree with each unit's direct user count, or a real org chart: unfold branches, zoom, export it as PNG
→ Open a BU: direct members, the total including sub-BUs, exports for the BU alone or its whole subtree
→ Members with access mode and license type; disabled accounts stand out
→ Paste the list of emails (Outlook format included): every match is ticked, anyone not in this BU is listed
→ Move them to another BU, with a warning about security roles BEFORE anything is written, then the result user by user

Demo data in the video. Free and open source.

How many business units does your org have? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #CRMAdmin

**FR**

🏢 Une réorganisation arrive chez l'admin sous forme de tableau d'adresses email.

▶️ 81 secondes dans le module Business Units de Colvio :

→ Toute l'arborescence des BU avec le nombre d'utilisateurs directs, ou un vrai organigramme : dépliez les branches, zoomez, exportez en PNG
→ Ouvrez une BU : membres directs, total avec les sous-BU, exports de la BU seule ou de toute sa sous-arborescence
→ Les membres avec mode d'accès et type de licence ; les comptes désactivés ressortent
→ Collez la liste d'emails (format Outlook compris) : chaque correspondance est cochée, les absents de cette BU sont listés
→ Déplacez-les vers une autre BU, avec un avertissement sur les rôles de sécurité AVANT toute écriture, puis le résultat utilisateur par utilisateur

Données de démo dans la vidéo. Gratuit et open source.

Combien de business units dans votre org ? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #CRMAdmin

---

### Post 38 — Solutions (`solutions`, 70 s)

**EN**

📦 "What's different between DEV and PROD?"

▶️ 70 seconds in Colvio's Solutions module:

→ Every solution with its version and component count, managed or unmanaged
→ What's inside, grouped by type: tables, columns, option sets, views, charts, plug-in assemblies
→ The full component list to CSV or Excel: your deployment checklist
→ Compare two solutions of the org: only here, in both, only there
→ Across orgs: export a compare file on DEV, load it on PROD, read the drift type by type, matched by GUID or by type and name

Demo data in the video. Free and open source.

How do you check a deployment today? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #ALM

**FR**

📦 « Qu'est-ce qui diffère entre DEV et PROD ? »

▶️ 70 secondes dans le module Solutions de Colvio :

→ Chaque solution avec sa version et son nombre de composants, managée ou non
→ Son contenu, groupé par type : tables, colonnes, option sets, vues, graphiques, assemblies de plug-ins
→ La liste complète des composants en CSV ou Excel : votre checklist de déploiement
→ Comparez deux solutions de l'org : seulement ici, dans les deux, seulement là-bas
→ Entre deux orgs : exportez un fichier de comparaison sur DEV, chargez-le sur PROD, lisez l'écart type par type, rapproché par GUID ou par type et nom

Données de démo dans la vidéo. Gratuit et open source.

Comment vérifiez-vous un déploiement aujourd'hui ? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #ALM

---

### Post 39 — Environment Variables (`envvars`, 75 s)

**EN**

⚙️ An environment variable with no value doesn't fail at import. It fails later, as an empty string in a flow or a plug-in.

▶️ 75 seconds in Colvio's Environment Variables module:

→ Counts and lists the variables with no current value AND no default: the classic post-deployment trap
→ Typed editing: yes/no for booleans, JSON must parse, numbers must be numbers; an invalid value is refused with the reason, before anything is sent
→ Clear an override to fall back to the definition's default
→ See what this environment overrides
→ Secret variables: Colvio shows and edits the Key Vault reference, never the secret
→ Export with default, current value and where the effective value comes from

Demo data in the video. Free and open source.

Ever been caught by an empty variable after a deployment? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #ALM

**FR**

⚙️ Une variable d'environnement sans valeur n'échoue pas à l'import. Elle échoue plus tard, en chaîne vide dans un flux ou un plug-in.

▶️ 75 secondes dans le module Variables d'environnement de Colvio :

→ Compte et liste les variables sans valeur courante NI valeur par défaut : le piège classique après un déploiement
→ Édition typée : oui/non pour les booléens, le JSON doit être valide, les nombres doivent être des nombres ; une valeur invalide est refusée avec la raison, avant tout envoi
→ Supprimez une surcharge pour revenir à la valeur par défaut de la définition
→ Voyez ce que cet environnement surcharge
→ Variables secrètes : Colvio affiche et modifie la référence Key Vault, jamais le secret
→ Export avec valeur par défaut, valeur courante et origine de la valeur effective

Données de démo dans la vidéo. Gratuit et open source.

Déjà piégé par une variable vide après un déploiement ? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #ALM

---

### Post 40 — Automation (`automation`, 72 s)

**EN**

⚡ "Why did this field change?"

Before opening the Plugin Registration Tool, look at everything registered to run, on one screen.

▶️ 72 seconds in Colvio's Automation module:

→ Every plug-in step: plug-in type, message, table, stage, sync or async, state, source
→ Filter by assembly, table or message in seconds
→ Only the disabled steps: the first check when "my plug-in doesn't fire"
→ Custom, managed or Microsoft (best effort, from publisher prefixes and the managed flag)
→ Classic workflows with their triggers, and a tab per process type: cloud flows, business rules, actions, BPFs, dialogs, desktop flows
→ Export what's on screen for the audit

Read-only, so it's safe to explore in production. Demo data in the video. Free and open source.

Plug-ins or flows: where does most of your logic live? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #PowerAutomate

**FR**

⚡ « Pourquoi ce champ a-t-il changé ? »

Avant d'ouvrir le Plugin Registration Tool, regardez tout ce qui est enregistré pour s'exécuter, sur un seul écran.

▶️ 72 secondes dans le module Automatisation de Colvio :

→ Chaque étape de plug-in : type de plug-in, message, table, étape, synchrone ou asynchrone, état, origine
→ Filtrez par assembly, table ou message en quelques secondes
→ Seulement les étapes désactivées : la première vérification quand « mon plug-in ne se déclenche pas »
→ Personnalisé, managé ou Microsoft (au mieux, d'après les préfixes d'éditeur et l'indicateur managé)
→ Les workflows classiques avec leurs déclencheurs, et un onglet par type de processus : flux cloud, règles métier, actions, BPF, dialogues, flux de bureau
→ Exportez ce qui est affiché pour l'audit

En lecture seule, donc sans risque à explorer en production. Données de démo dans la vidéo. Gratuit et open source.

Plug-ins ou flux : où vit l'essentiel de votre logique ? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #PowerAutomate

---

### Post 41 — Metadata (`metadata`, 83 s)

**EN**

📚 A data dictionary in one click.

▶️ 83 seconds in Colvio's Metadata module:

→ Tables filtered by category, with Virtual and Elastic tables singled out
→ Every column with its label and type, required and custom ones marked
→ Option set values, number by number, exportable
→ Click a logical name to copy it, ready for FetchXML, code or Power Automate
→ Export every column of a table (logical name, label, OData name, type, required, custom) or every option set value
→ Schema snapshot: export it as JSON on one org, load it on another, and see missing tables and columns, type and requirement gaps

Demo data in the video. Free and open source.

Do you keep your data dictionary up to date? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #DataModel

**FR**

📚 Un dictionnaire de données en un clic.

▶️ 83 secondes dans le module Métadonnées de Colvio :

→ Les tables filtrées par catégorie, les tables Virtual et Elastic mises en évidence
→ Chaque colonne avec son libellé et son type, les obligatoires et les personnalisées signalées
→ Les valeurs d'un option set, une par une, exportables
→ Un clic sur un nom logique le copie, prêt pour le FetchXML, le code ou Power Automate
→ Exportez toutes les colonnes d'une table (nom logique, libellé, nom OData, type, obligatoire, personnalisé) ou toutes les valeurs d'option sets
→ Snapshot de schéma : exportez-le en JSON sur une org, chargez-le sur une autre, et voyez les tables et colonnes manquantes, les écarts de type et d'obligation

Données de démo dans la vidéo. Gratuit et open source.

Tenez-vous votre dictionnaire de données à jour ? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #DataModel

---

### Post 42 — Schema (`schema`, 76 s)

**EN**

🗺 Your Dataverse data model, drawn from the org itself.

▶️ 76 seconds in Colvio's Schema module:

→ Click tables: each lands on the canvas with its columns and types, lookups first
→ Each lookup curves to its target table; hover one to light it up
→ N:N relationships as dashed lines between card headers
→ The + on a card adds the tables its lookups point to
→ Drag the cards, pan, zoom, Fit: every curve follows
→ Every column, or tables only for the big picture
→ Export as PNG, SVG or a Mermaid erDiagram for your docs

Demo data in the video. Free and open source.

How do you document your data model today? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #DataModel

**FR**

🗺 Votre modèle de données Dataverse, dessiné à partir de l'org elle-même.

▶️ 76 secondes dans le module Schema de Colvio :

→ Cliquez des tables : chacune arrive sur le canevas avec ses colonnes et leurs types, les lookups en premier
→ Chaque lookup trace une courbe vers sa table cible ; survolez-le pour l'éclairer
→ Les relations N:N en pointillés entre les en-têtes des cartes
→ Le + d'une carte ajoute les tables vers lesquelles pointent ses lookups
→ Déplacez les cartes, faites défiler, zoomez, Fit : chaque courbe suit
→ Toutes les colonnes, ou seulement les tables pour la vue d'ensemble
→ Export en PNG, SVG ou en erDiagram Mermaid pour votre documentation

Données de démo dans la vidéo. Gratuit et open source.

Comment documentez-vous votre modèle de données aujourd'hui ? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #DataModel

---

### Post 43 — Relationships (`relationships`, 59 s)

**EN**

🔗 Your data model, one click at a time.

▶️ 59 seconds in Colvio's Relationships module:

→ Pick a table: parents on top, N:N in the middle, children below, each box naming its lookup or relationship
→ System links (owner, currency, created by) exist on every table, so they start hidden; one click shows them, and your own lookups to those same tables stay in view
→ Click any related table and it becomes the center: walk the model from table to table
→ Depth 2 pulls in the relationships of the related tables, capped at 30 tables to stay readable
→ ↻ clears the metadata cache, so a relationship created minutes ago shows up

Demo data in the video. Free and open source.

Which table has the most relationships in your org? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #DataModel

**FR**

🔗 Votre modèle de données, clic après clic.

▶️ 59 secondes dans le module Relations de Colvio :

→ Choisissez une table : les parents en haut, les N:N au milieu, les enfants en bas, chaque bloc indiquant son lookup ou sa relation
→ Les liens système (propriétaire, devise, créé par) existent sur toutes les tables, donc ils démarrent masqués ; un clic les affiche, et vos propres lookups vers ces mêmes tables restent visibles
→ Cliquez une table liée : elle passe au centre, et vous parcourez le modèle de table en table
→ Depth 2 ajoute les relations des tables liées, plafonné à 30 tables pour rester lisible
→ ↻ vide le cache des métadonnées : une relation créée il y a quelques minutes apparaît

Données de démo dans la vidéo. Gratuit et open source.

Quelle table a le plus de relations dans votre org ? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #DataModel

---

### Post 44 — Users & Licenses (`licenses`, 64 s)

**EN**

🎫 Paid seats, disabled users, service accounts: the license picture in one list.

▶️ 64 seconds in Colvio's Users & Licenses module:

→ Every user with license (CAL) type and status, live counts of active and disabled accounts
→ One click for the disabled users, or the non-interactive accounts integrations use
→ Search by name, email or business unit; sort by license to group users on the same plan
→ Open a user: business unit, title, access mode, license, creation date, last login, security roles
→ Org-wide breakdowns per access mode and license type
→ Export the filtered list to CSV or Excel

Demo data in the video. Free and open source.

How many unused licenses would you bet your org is paying for? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #Licensing

**FR**

🎫 Licences payées, utilisateurs désactivés, comptes de service : l'état des licences en une liste.

▶️ 64 secondes dans le module Utilisateurs & licences de Colvio :

→ Chaque utilisateur avec son type de licence (CAL) et son statut, et le décompte en direct des comptes actifs et désactivés
→ Un clic pour les utilisateurs désactivés, ou les comptes non interactifs des intégrations
→ Recherche par nom, email ou business unit ; tri par licence pour regrouper ceux qui ont la même
→ Ouvrez un utilisateur : business unit, fonction, mode d'accès, licence, date de création, dernière connexion, rôles de sécurité
→ Répartition sur toute l'org par mode d'accès et par type de licence
→ Export de la liste filtrée en CSV ou Excel

Données de démo dans la vidéo. Gratuit et open source.

Combien de licences inutilisées parieriez-vous que votre org paie ? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #Licensing

---

### Post 45 — Translations (`translations`, 64 s)

**EN**

🌍 Fixing one label in four languages shouldn't take an afternoon.

▶️ 64 seconds in Colvio's Translations module:

→ Every column label of a table, in every language installed on the org, side by side
→ Hide the languages you don't need (the export follows)
→ Search by logical name or by any label, in any language
→ Type straight into the grid: changed cells are highlighted and counted, and Save writes them and publishes the table
→ Unsaved edits? Switching table asks first
→ Or round-trip: export to CSV, translate in Excel, import it back as pending edits

Demo data in the video. Free and open source.

How many languages does your org run? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #Localization

**FR**

🌍 Corriger un libellé dans quatre langues ne devrait pas prendre un après-midi.

▶️ 64 secondes dans le module Traductions de Colvio :

→ Chaque libellé de colonne d'une table, dans toutes les langues installées sur l'org, côte à côte
→ Masquez les langues inutiles (l'export suit)
→ Recherchez par nom logique ou par n'importe quel libellé, dans n'importe quelle langue
→ Tapez directement dans la grille : les cellules modifiées sont surlignées et comptées, Save les écrit et publie la table
→ Des modifications non enregistrées ? Changer de table demande d'abord confirmation
→ Ou l'aller-retour : export CSV, traduction dans Excel, réimport sous forme de modifications en attente

Données de démo dans la vidéo. Gratuit et open source.

Combien de langues dans votre org ? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #Localization

---

### Post 46 — Login History (`logins`, 52 s)

**EN**

🕐 Dataverse has no "logout" event.

It records user access at most once per user per interval (4 hours by default), through two channels: the app (audit action 64) and web services, meaning the API (action 65). Any "session duration" built from the audit is a guess.

▶️ 52 seconds in Colvio's Login History, showing what the audit really holds:

→ Find a user as you type
→ Access events, active days, latest and oldest, split between the app and web services
→ A day-by-day timeline with each event's exact time and channel
→ Load from the last 50 up to 500 events
→ Export to CSV or Excel

Demo data in the video. Free and open source.

Did you know Dataverse has no sign-out event? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #Audit

**FR**

🕐 Dataverse n'a pas d'événement de « déconnexion ».

Il enregistre les accès des utilisateurs au plus une fois par intervalle (4 heures par défaut), selon deux canaux : l'application (action d'audit 64) et les services web, c'est-à-dire l'API (action 65). Toute « durée de session » tirée de l'audit est une supposition.

▶️ 52 secondes dans l'historique de connexion de Colvio, qui montre ce que l'audit contient vraiment :

→ Trouvez un utilisateur au fil de la frappe
→ Événements d'accès, jours actifs, le plus récent et le plus ancien, répartis entre l'application et les services web
→ Une frise jour par jour avec l'heure exacte et le canal de chaque événement
→ De 50 à 500 derniers événements chargés
→ Export en CSV ou Excel

Données de démo dans la vidéo. Gratuit et open source.

Saviez-vous que Dataverse n'a pas d'événement de déconnexion ? 👇

#Dynamics365 #Dataverse #PowerPlatform #D365 #Audit

---
