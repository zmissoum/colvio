import { useState, useEffect } from "react";
import { C, bt } from "../shared.jsx";
import { t, getLocale } from "../i18n.js";

// Post-update "What's new" popup — shows once per version (localStorage-tracked).
// HIGHLIGHTS only needs the CURRENT arc's top items; the full detail lives in CHANGELOG.md.
// Arc: the Chrome Web Store shows 1.11.176 (Bulk settings, last login, Teams, Storage, native SQL…
// were all in it) → this release adds Record activity, the Security privilege filter and the Explorer's saved-query Update / OData paste.
const HIGHLIGHTS = {
  en: [
    "⚡ NEW Record activity in Show All Data — save a record in Dynamics 365 and see what that save set off: plug-ins in execution order (stage, duration, cascades on other tables, the exception message, the full trace on click), the record's system jobs, and the cloud flows that run, may run or won't — and why",
    "🔎 When something fails, the next step is on screen — click a system job for its full error, the plug-in step behind it (trigger columns, run-as user, whether it has a configuration) and its recent runs (\"failing every time since…\"), with a hint on what a 401 or a timeout usually means. Flow runs open in Power Automate",
    "🧪 Debug without forgetting to clean up — \"Log every plug-in\" switches the org's trace log to All for 15, 30 or 60 minutes, then back to its previous setting by itself",
    "📊 Know your data model — per column: its fill rate (exact, even on millions of rows), 🧨 what blocks deleting it or everything that uses it (with how to remove each dependency), 📑 its solution layers (an unmanaged layer hiding a managed solution is flagged); plus a data dictionary of every column to CSV or Excel",
    "✍ SQL that writes — UPDATE and DELETE in the Explorer's SQL mode, always previewed: Execute shows every row the statement would touch with its current values, Apply writes exactly those rows in batches (confirmation, progress, Cancel, a reason per failure). A WHERE is mandatory",
    "⬇ No row left behind — the Explorer's new “To file” runs a query and streams EVERY row straight to a CSV or Excel file, whatever the size (nothing kept in the browser). A result too big for memory is never shown half-loaded: Colvio offers the stream instead. FetchXML pages with the server's paging cookie, so deep pages stay fast",
    "📂 Explorer — save any query as a personal view of its table (it appears in the app's view selector), the saved query you loaded shows next to ⭐ with a one-click Update, and the OData box takes any query or full Web API URL you paste (browser, Postman, XrmToolBox): Colvio opens its table",
    "🔐 \"Why can't she see it?\" answered — Show All Data › Record access: pick a user and get Dataverse's own yes / no for each right on the record (read, write, append, delete, assign, share), why (which role or team, at which depth, or a share), and what would fix a no. Plus Security Audit lists the roles holding any one privilege",
    "🏋️ Built for big orgs — last logins and the org-wide security view no longer send one request per user or per role (time windows and one grants read instead), reads carry only the annotations the screen uses, and the sidebar shows a REAL API meter: requests in the last 5 minutes against Dataverse's quota, with Colvio slowing down before the limit instead of being refused",
    "🔒 Nothing leaves your browser — to list your saves, Colvio now observes (read-only) the requests your Dynamics 365 tab sends to your own org: the record and the column names, never the values, kept in memory until the browser closes",
  ],
  fr: [
    "⚡ NOUVEAU Record activity dans Show All Data — sauvegardez un enregistrement dans Dynamics 365 et voyez ce que la sauvegarde a déclenché : les plug-ins dans l'ordre d'exécution (étape, durée, cascades sur d'autres tables, le message d'erreur, la trace complète au clic), les tâches système de l'enregistrement, et les flux cloud qui se déclenchent, peut-être, ou pas — et pourquoi",
    "🔎 Quand quelque chose échoue, la suite est à l'écran — cliquez une tâche système pour son erreur complète, l'étape de plug-in derrière (colonnes déclencheuses, compte d'exécution, présence d'une configuration) et ses dernières exécutions (« échoue à chaque fois depuis… »), avec une piste sur ce que veut dire un 401 ou un délai dépassé. Les exécutions de flux s'ouvrent dans Power Automate",
    "🧪 Déboguer sans oublier de remettre en ordre — « Log every plug-in » passe le journal des traces de l'org sur All pendant 15, 30 ou 60 minutes, puis revient seul au réglage précédent",
    "📊 Maîtrisez le modèle de données — par colonne : son taux de remplissage (exact, même sur des millions de lignes), 🧨 ce qui bloque sa suppression ou tout ce qui l'utilise (avec comment retirer chaque dépendance), 📑 ses couches de solution (une couche non gérée qui masque une solution gérée est signalée) ; et un dictionnaire de données de toutes les colonnes en CSV ou Excel",
    "✍ Du SQL qui écrit — UPDATE et DELETE dans le mode SQL de l'Explorer, toujours avec aperçu : Execute montre toutes les lignes que la commande toucherait avec leurs valeurs actuelles, Apply écrit exactement ces lignes par lots (confirmation, progression, annulation, une raison par échec). Le WHERE est obligatoire",
    "⬇ Aucune ligne oubliée — le nouveau « To file » de l'Explorer exécute une requête et écrit TOUTES les lignes directement dans un fichier CSV ou Excel, quelle que soit la taille (rien n'est gardé dans le navigateur). Un résultat trop gros pour la mémoire n'est jamais affiché à moitié : Colvio propose le flux à la place. Le FetchXML pagine avec le cookie du serveur, les pages profondes restent rapides",
    "📂 Explorer — enregistrez n'importe quelle requête comme vue personnelle de sa table (elle apparaît dans le sélecteur de vues de l'app), la requête enregistrée chargée s'affiche à côté de ⭐ avec un bouton Update en un clic, et la zone OData accepte toute requête ou URL Web API complète collée (navigateur, Postman, XrmToolBox) : Colvio ouvre sa table",
    "🔐 « Pourquoi elle ne le voit pas ? » a sa réponse — Show All Data › Record access : choisissez un utilisateur et obtenez le oui / non de Dataverse pour chaque droit sur l'enregistrement (lecture, écriture, ajout, suppression, attribution, partage), le pourquoi (quel rôle ou quelle équipe, à quelle profondeur, ou un partage), et ce qui réglerait un non. Et Security Audit liste les rôles qui détiennent un privilège donné",
    "🏋️ Taillé pour les grosses orgs — les dernières connexions et la vue Org-wide de la sécurité n'envoient plus une requête par utilisateur ou par rôle (des fenêtres de temps et une seule lecture des droits), les lectures ne portent que les annotations affichées, et la barre latérale montre un VRAI compteur d'API : les requêtes des 5 dernières minutes face au quota Dataverse, Colvio ralentissant avant la limite au lieu d'être refusé",
    "🔒 Rien ne quitte votre navigateur — pour lister vos sauvegardes, Colvio observe désormais (en lecture seule) les requêtes que votre onglet Dynamics 365 envoie à votre propre org : l'enregistrement et les noms de colonnes, jamais les valeurs, gardés en mémoire jusqu'à la fermeture du navigateur",
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
