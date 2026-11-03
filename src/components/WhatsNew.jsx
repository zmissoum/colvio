import { useState, useEffect } from "react";
import { C, bt } from "../shared.jsx";
import { t, getLocale } from "../i18n.js";

// Post-update "What's new" popup — shows once per version (localStorage-tracked).
// HIGHLIGHTS only needs the CURRENT arc's top items; the full detail lives in CHANGELOG.md.
// Arc: the Chrome Web Store shows 1.11.181 (Record activity and its failure details were in it)
// → the arc to now: Record access, Health check, Web Resources, step / choice / column writes,
// data-model tools, SQL writes and completion, N:N tables, Explorer streaming, big-org work and two
// review passes, privacy, Script Console, one Colvio per environment, deployments, who sends
// the emails. Keep it ≤ 12 items.
const HIGHLIGHTS = {
  en: [
    "⌨ NEW Script Console — run JavaScript on the Web API with your session, for what no screen does (fill a lookup from another table, fix data by rules, call actions): dry run lists every write without sending it, a real run keeps a journal and rolls back in one click. The script runs isolated, without network",
    "🪟 One Colvio per environment — click the icon on your DEV tab, then on PROD: each gets its own Colvio, side by side, and keeps its work. The icon on any tab of an environment brings that environment's Colvio back as you left it",
    "🔐 \"Why can't she see it?\" answered — Show All Data › Record access: pick a user, get Dataverse's own yes / no for each right on the record, why (which role or team, at which depth, or a share) and what would fix a no",
    "🩺 NEW Health check — one report on what silently hurts the environment: failing and suspended jobs, flows owned by disabled users, plug-ins firing on every update, unbound connection references, empty environment variables, users without a role, unmanaged solutions in production, growing log tables — each with what to do, copyable for a ticket",
    "🔗 Data Loader — the mapping follows the table: the columns are matched again when you pick the table (your manual choices kept), by logical, OData or display name — a Dynamics export's headers map as they are, Excel's hidden (Do Not Modify) columns told apart (the record id becomes the primary key); a lookup column of names resolves on the related table's primary name; under the table picker, how many columns the table accounts for and a one-click switch when the file names another table",
    "🚀 NEW Deployments — Solutions › 🚀 Deployments lists every solution import, export and uninstall the environment recorded: when, which version, how long, the result and its error, and who started it (Dataverse's 180-day solution history joined to the import jobs); a timeline with filters and each solution's version ladder, the import log parsed on demand, CSV / Excel",
    "✉ Who sends that email? — a cloud flow does not run as its owner: Automation › Cloud flows now shows Runs as (the account of each connection its actions use, or whoever runs it) and Sends email as (the From (Send as) or shared mailbox set in each email action, else the connection's account — Mail connector, Dataverse email activities and approvals told apart); Workflows, Actions and Dialogs get Sends email as from their XAML (a fixed user or queue, or the row's owner)",
    "👤 Who runs what — Automation › Who runs it lists every identity behind your automation and what it is: a person, a service account, an app registration, a built-in user, a team, or an account that isn't even a user here — with the flows, workflows and plug-in steps it owns or runs as, and the connections signed in with its account",
    "📜 NEW Web Resources — edit and publish scripts, styles and pages, and search a column name inside every script shown: what Dataverse's dependency tracking never sees",
    "🛠 Change things, not just look at them — switch plug-in steps on / off (one or a whole selection) and set an Update step's filtering attributes; add, rename, reorder and delete the values of a choice column; create a whole set of columns from a CSV / Excel sheet, checked row by row before anything is sent; load N:N tables (team members, user roles) by association. Every write confirmed, twice on production",
    "📊 Know your data model — per column: fill rate (exact, even on millions of rows), 🧨 what blocks deleting it or everything that uses it (with how to remove each dependency), 📑 its solution layers (an unmanaged layer hiding a managed solution is flagged); plus a data dictionary of every column to CSV or Excel, and 🔎 what the global search shows and searches for every table",
    "🔍 Reviewed end to end, again — after the Loader's mapping fix, every module was read for the same family of defects: a value computed once against a table or filter you change afterwards, a name matched in one form only, a read landing after you moved on, a screen asserting what a failed read never returned; 47 fixes — the Explorer no longer breaks on a table switch mid-paging, Adoption counts API access too and never shows one role's numbers under another's label, six modules say \"Couldn't load the tables\" instead of showing the demo list, Users & Licenses shows the roles inherited through teams, Who runs it and Health check say what they couldn't read",
  ],
  fr: [
    "⌨ NOUVEAU Script Console — exécutez du JavaScript sur la Web API avec votre session, pour ce qu'aucun écran ne fait (renseigner un lookup depuis une autre table, corriger des données par règles, appeler des actions) : le dry run liste chaque écriture sans l'envoyer, l'exécution réelle tient un journal et s'annule en un clic. Le script tourne isolé, sans réseau",
    "🪟 Un Colvio par environnement — cliquez l'icône sur l'onglet DEV, puis sur la PROD : chacun a son propre Colvio, côte à côte, qui garde son travail. L'icône sur n'importe quel onglet d'un environnement ramène son Colvio tel que vous l'avez laissé",
    "🔐 « Pourquoi elle ne le voit pas ? » a sa réponse — Show All Data › Record access : choisissez un utilisateur, obtenez le oui / non de Dataverse pour chaque droit sur l'enregistrement, le pourquoi (quel rôle ou quelle équipe, à quelle profondeur, ou un partage) et ce qui réglerait un non",
    "🩺 NOUVEAU Bilan de santé — un rapport sur ce qui abîme l'environnement en silence : tâches en échec ou suspendues, flux dont le propriétaire est désactivé, plug-ins déclenchés à chaque mise à jour, références de connexion sans connexion, variables d'environnement vides, utilisateurs sans rôle, solutions non gérées en production, tables de journaux qui grossissent — chacun avec quoi faire, copiable pour un ticket",
    "🔗 Data Loader — le mapping suit la table : les colonnes sont réappariées quand vous choisissez la table (vos choix manuels conservés), par nom logique, OData ou nom d'affichage — les en-têtes d'un export Dynamics se mappent tels quels, les colonnes masquées (Do Not Modify) d'Excel distinguées (l'identifiant devient la clé primaire) ; une colonne de lookup contenant des noms se résout sur le nom principal de la table liée ; sous le sélecteur de table, combien de colonnes la table reconnaît, et un basculement en un clic quand le fichier nomme une autre table",
    "🚀 NOUVEAU Déploiements — Solutions › 🚀 Deployments liste chaque import, export et désinstallation de solution enregistré par l'environnement : quand, quelle version, combien de temps, le résultat et son erreur, et qui l'a lancé (l'historique des solutions de Dataverse, 180 jours, joint aux tâches d'import) ; une chronologie avec filtres et l'échelle des versions de chaque solution, le journal d'import analysé à la demande, CSV / Excel",
    "✉ Qui envoie cet email ? — un flux cloud ne s'exécute pas sous son propriétaire : Automation › Cloud flows affiche désormais Runs as (le compte de chaque connexion que ses actions utilisent, ou la personne qui le lance) et Sends email as (le From (Send as) ou la boîte partagée réglés dans chaque action d'email, sinon le compte de la connexion — connecteur Mail, activités email Dataverse et approbations distingués) ; les Workflows, Actions et Dialogs ont Sends email as depuis leur XAML (un utilisateur ou une file fixe, ou le propriétaire de la ligne)",
    "👤 Qui exécute quoi — Automation › Who runs it liste chaque identité derrière vos automatisations et ce qu'elle est : une personne, un compte de service, une app registration, un utilisateur intégré, une équipe, ou un compte qui n'est même pas un utilisateur ici — avec les flux, workflows et étapes de plug-in qu'elle possède ou sous lesquels ils s'exécutent, et les connexions authentifiées avec son compte",
    "📜 NOUVEAU Web Resources — éditez et publiez scripts, styles et pages, et cherchez le nom d'une colonne dans tous les scripts affichés : ce que le suivi des dépendances de Dataverse ne voit jamais",
    "🛠 Modifier, pas seulement regarder — activez / désactivez des étapes de plug-in (une ou toute une sélection) et réglez les attributs de filtrage d'une étape Update ; ajoutez, renommez, réordonnez et supprimez les valeurs d'une colonne de choix ; créez toute une série de colonnes depuis une feuille CSV / Excel, vérifiée ligne par ligne avant tout envoi ; chargez les tables N:N (membres d'équipe, rôles des utilisateurs) par association. Chaque écriture est confirmée, deux fois en production",
    "📊 Maîtrisez le modèle de données — par colonne : taux de remplissage (exact, même sur des millions de lignes), 🧨 ce qui bloque sa suppression ou tout ce qui l'utilise (avec comment retirer chaque dépendance), 📑 ses couches de solution (une couche non gérée qui masque une solution gérée est signalée) ; et un dictionnaire de données de toutes les colonnes en CSV ou Excel, et 🔎 ce que la recherche globale affiche et cherche pour chaque table",
    "🔍 Revu de bout en bout, encore — après la correction du mapping du Loader, chaque module a été relu pour la même famille de défauts : une valeur calculée une fois contre une table ou un filtre changé ensuite, un nom apparié sous une seule forme, une lecture qui arrive après qu'on est passé à autre chose, un écran qui affirme ce qu'une lecture échouée n'a jamais rendu ; 47 correctifs — l'Explorer ne casse plus sur un changement de table en cours de pagination, Adoption compte aussi les accès API et n'affiche plus les chiffres d'un rôle sous l'étiquette d'un autre, six modules disent « Couldn't load the tables » au lieu d'afficher la liste de démo, Users & Licenses montre les rôles hérités via les équipes, Who runs it et Health check disent ce qu'ils n'ont pas pu lire",
  ],
};

export default function WhatsNew() {
  const [show, setShow] = useState(false);
  const [version, setVersion] = useState("");

  useEffect(() => {
    try {
      const v = (typeof chrome !== "undefined" && chrome.runtime?.getManifest) ? chrome.runtime.getManifest().version : "";
      if (!v) return;
      setVersion(v);
      const seen = localStorage.getItem("colvio_seen_version");
      // First install: don't greet with a changelog — just mark current as seen.
      if (!seen) { localStorage.setItem("colvio_seen_version", v); return; }
      if (seen !== v) setShow(true);
    } catch {}
  }, []);

  const dismiss = () => { try { localStorage.setItem("colvio_seen_version", version); } catch {} setShow(false); };
  // Escape dismisses — the popup sits over the whole app, keyboard users must be able to leave it.
  useEffect(() => {
    if (!show) return;
    const onKey = (e) => { if (e.key === "Escape") dismiss(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [show, version]);
  if (!show) return null;
  const items = HIGHLIGHTS[getLocale()] || HIGHLIGHTS.en;

  return (
    <div onClick={dismiss} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 280, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 440, maxWidth: "92vw", maxHeight: "88vh", overflowY: "auto", background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 12, padding: 22, boxShadow: "0 16px 48px rgba(0,0,0,.55)" }}>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 2 }}>🎉 {t("whatsnew.title")} {version}</div>
        <div style={{ fontSize: 12, color: C.txd, marginBottom: 12 }}>{t("whatsnew.subtitle")}</div>
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 7 }}>
          {items.map((h, i) => <li key={i} style={{ fontSize: 13, color: C.txm }}>{h}</li>)}
        </ul>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <button onClick={dismiss} style={bt(`linear-gradient(135deg,${C.vi},${C.vil})`, { fontSize: 13 })}>{t("whatsnew.ok")}</button>
        </div>
      </div>
    </div>
  );
}
