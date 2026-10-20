import { useState, useEffect } from "react";
import { C, bt } from "../shared.jsx";
import { t, getLocale } from "../i18n.js";

// Post-update "What's new" popup — shows once per version (localStorage-tracked).
// HIGHLIGHTS only needs the CURRENT arc's top items; the full detail lives in CHANGELOG.md.
// Arc: the Chrome Web Store shows 1.11.176 (Bulk settings, last login, Teams, Storage, native SQL…
// were all in it) → the arc to now: Record activity, Record access, Health check, step / choice writes,
// data-model tools, SQL writes, Explorer streaming, big-org work, privacy. Keep it ≤ 10 items.
const HIGHLIGHTS = {
  en: [
    "⚡ NEW Record activity in Show All Data — save a record and see what the save set off: plug-ins in execution order (duration, cascades, the exception, the full trace), system jobs and cloud flows — click a failure for its error, the step behind it and its recent runs. \"Log every plug-in\" turns the trace log on for 15–60 minutes and back by itself",
    "🔐 \"Why can't she see it?\" answered — Show All Data › Record access: pick a user, get Dataverse's own yes / no for each right on the record, why (which role or team, at which depth, or a share) and what would fix a no. Security Audit also lists the roles holding any one privilege",
    "🩺 NEW Health check — one report on what silently hurts the environment: failing and suspended jobs, flows owned by disabled users, plug-ins firing on every update, unbound connection references, empty environment variables, users without a role, unmanaged solutions in production, growing log tables — each with what to do",
    "🛠 Change things, not just look at them — switch plug-in steps on / off (one or a whole selection) and set an Update step's filtering attributes; add, rename, reorder and delete the values of a choice column (published at once). Every write confirmed, twice on production",
    "📊 Know your data model — per column: fill rate (exact, even on millions of rows), 🧨 what blocks deleting it or everything that uses it, 📑 its solution layers (an unmanaged layer hiding a managed solution is flagged); plus a data dictionary of every column to CSV or Excel",
    "✍ SQL that writes — UPDATE and DELETE in the Explorer's SQL mode, always previewed: every row it would touch with its current values first, then Apply writes exactly those rows in batches. A WHERE is mandatory",
    "📂 Explorer — “To file” streams EVERY row of a query to CSV or Excel whatever the size; save any query as a personal view; the loaded saved query gets a one-click Update; paste any OData query or Web API URL",
    "🏋️ Built for big orgs — no more one request per user or per role, lighter reads, and a REAL API meter in the sidebar: Colvio slows down before Dataverse's limit instead of being refused",
    "🔒 Nothing leaves your browser — to list your saves, Colvio observes (read-only) the requests your Dynamics 365 tab sends to your own org: the record and the column names, never the values, kept in memory until the browser closes",
  ],
  fr: [
    "⚡ NOUVEAU Record activity dans Show All Data — sauvegardez un enregistrement et voyez ce que la sauvegarde a déclenché : les plug-ins dans l'ordre (durée, cascades, l'exception, la trace complète), les tâches système et les flux cloud — cliquez un échec pour son erreur, l'étape derrière et ses dernières exécutions. « Log every plug-in » active le journal des traces 15 à 60 minutes puis le remet seul",
    "🔐 « Pourquoi elle ne le voit pas ? » a sa réponse — Show All Data › Record access : choisissez un utilisateur, obtenez le oui / non de Dataverse pour chaque droit sur l'enregistrement, le pourquoi (quel rôle ou quelle équipe, à quelle profondeur, ou un partage) et ce qui réglerait un non. Security Audit liste aussi les rôles qui détiennent un privilège donné",
    "🩺 NOUVEAU Bilan de santé — un rapport sur ce qui abîme l'environnement en silence : tâches en échec ou suspendues, flux dont le propriétaire est désactivé, plug-ins déclenchés à chaque mise à jour, références de connexion sans connexion, variables d'environnement vides, utilisateurs sans rôle, solutions non gérées en production, tables de journaux qui grossissent — chacun avec quoi faire",
    "🛠 Modifier, pas seulement regarder — activez / désactivez des étapes de plug-in (une ou toute une sélection) et réglez les attributs de filtrage d'une étape Update ; ajoutez, renommez, réordonnez et supprimez les valeurs d'une colonne de choix (publié aussitôt). Chaque écriture est confirmée, deux fois en production",
    "📊 Maîtrisez le modèle de données — par colonne : taux de remplissage (exact, même sur des millions de lignes), 🧨 ce qui bloque sa suppression ou tout ce qui l'utilise, 📑 ses couches de solution (une couche non gérée qui masque une solution gérée est signalée) ; et un dictionnaire de données de toutes les colonnes en CSV ou Excel",
    "✍ Du SQL qui écrit — UPDATE et DELETE dans le mode SQL de l'Explorer, toujours avec aperçu : d'abord toutes les lignes touchées avec leurs valeurs actuelles, puis Apply écrit exactement ces lignes par lots. Le WHERE est obligatoire",
    "📂 Explorer — « To file » écrit TOUTES les lignes d'une requête en CSV ou Excel quelle que soit la taille ; enregistrez n'importe quelle requête comme vue personnelle ; la requête enregistrée chargée a un Update en un clic ; collez n'importe quelle requête OData ou URL Web API",
    "🏋️ Taillé pour les grosses orgs — plus une requête par utilisateur ou par rôle, des lectures allégées, et un VRAI compteur d'API dans la barre latérale : Colvio ralentit avant la limite de Dataverse au lieu d'être refusé",
    "🔒 Rien ne quitte votre navigateur — pour lister vos sauvegardes, Colvio observe (en lecture seule) les requêtes que votre onglet Dynamics 365 envoie à votre propre org : l'enregistrement et les noms de colonnes, jamais les valeurs, gardés en mémoire jusqu'à la fermeture du navigateur",
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
