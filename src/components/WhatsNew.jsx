import { useState, useEffect } from "react";
import { C, bt } from "../shared.jsx";
import { t, getLocale } from "../i18n.js";

// Post-update "What's new" popup — shows once per version (localStorage-tracked).
// HIGHLIGHTS only needs the CURRENT arc's top items; the full detail lives in CHANGELOG.md.
// Arc: the Chrome Web Store shows 1.11.181 (Record activity and its failure details were in it)
// → the arc to now: Record access, Health check, Web Resources, step / choice / column writes,
// data-model tools, SQL writes, Explorer streaming, big-org work, privacy, Script Console. Keep it ≤ 10 items.
const HIGHLIGHTS = {
  en: [
    "⌨ NEW Script Console — run JavaScript on the Web API with your session, for what no screen does (fill a lookup from another table, fix data by rules, call actions): dry run lists every write without sending it, a real run keeps a journal and rolls back in one click. The script runs isolated, without network",
    "🔐 \"Why can't she see it?\" answered — Show All Data › Record access: pick a user, get Dataverse's own yes / no for each right on the record, why (which role or team, at which depth, or a share) and what would fix a no",
    "🩺 NEW Health check — one report on what silently hurts the environment: failing and suspended jobs, flows owned by disabled users, plug-ins firing on every update, unbound connection references, empty environment variables, users without a role, unmanaged solutions in production, growing log tables — each with what to do, copyable for a ticket",
    "👤 Who runs what — Automation › Who runs it lists every identity behind your automation and what it is: a person, a service account, an app registration, a built-in user, a team, or an account that isn't even a user here — with the flows, workflows and plug-in steps it owns or runs as, and the connections signed in with its account",
    "📜 NEW Web Resources — edit and publish scripts, styles and pages, and search a column name inside every script shown: what Dataverse's dependency tracking never sees",
    "🛠 Change things, not just look at them — switch plug-in steps on / off (one or a whole selection) and set an Update step's filtering attributes; add, rename, reorder and delete the values of a choice column; create a whole set of columns from a CSV / Excel sheet, checked row by row before anything is sent. Every write confirmed, twice on production",
    "📊 Know your data model — per column: fill rate (exact, even on millions of rows), 🧨 what blocks deleting it or everything that uses it (with how to remove each dependency), 📑 its solution layers (an unmanaged layer hiding a managed solution is flagged); plus a data dictionary of every column to CSV or Excel",
    "✍ SQL that writes — UPDATE and DELETE in the Explorer's SQL mode, always previewed: every row the statement would touch with its current values first, then Apply writes exactly those rows in batches. A WHERE is mandatory",
    "📂 Explorer — “To file” streams EVERY row of a query to CSV or Excel whatever the size; save any query as a personal view of its table; the loaded saved query gets a one-click Update; paste any OData query or full Web API URL",
    "🏋️ Built for big orgs — no more one request per user or per role, lighter reads, a REAL API meter in the sidebar (Colvio slows down before Dataverse's limit instead of being refused), and a full review pass: a paced request never reads as a timeout, a failure never shrinks into a partial answer",
  ],
  fr: [
    "⌨ NOUVEAU Script Console — exécutez du JavaScript sur la Web API avec votre session, pour ce qu'aucun écran ne fait (renseigner un lookup depuis une autre table, corriger des données par règles, appeler des actions) : le dry run liste chaque écriture sans l'envoyer, l'exécution réelle tient un journal et s'annule en un clic. Le script tourne isolé, sans réseau",
    "🔐 « Pourquoi elle ne le voit pas ? » a sa réponse — Show All Data › Record access : choisissez un utilisateur, obtenez le oui / non de Dataverse pour chaque droit sur l'enregistrement, le pourquoi (quel rôle ou quelle équipe, à quelle profondeur, ou un partage) et ce qui réglerait un non",
    "🩺 NOUVEAU Bilan de santé — un rapport sur ce qui abîme l'environnement en silence : tâches en échec ou suspendues, flux dont le propriétaire est désactivé, plug-ins déclenchés à chaque mise à jour, références de connexion sans connexion, variables d'environnement vides, utilisateurs sans rôle, solutions non gérées en production, tables de journaux qui grossissent — chacun avec quoi faire, copiable pour un ticket",
    "👤 Qui exécute quoi — Automation › Who runs it liste chaque identité derrière vos automatisations et ce qu'elle est : une personne, un compte de service, une app registration, un utilisateur intégré, une équipe, ou un compte qui n'est même pas un utilisateur ici — avec les flux, workflows et étapes de plug-in qu'elle possède ou sous lesquels ils s'exécutent, et les connexions authentifiées avec son compte",
    "📜 NOUVEAU Web Resources — éditez et publiez scripts, styles et pages, et cherchez le nom d'une colonne dans tous les scripts affichés : ce que le suivi des dépendances de Dataverse ne voit jamais",
    "🛠 Modifier, pas seulement regarder — activez / désactivez des étapes de plug-in (une ou toute une sélection) et réglez les attributs de filtrage d'une étape Update ; ajoutez, renommez, réordonnez et supprimez les valeurs d'une colonne de choix ; créez toute une série de colonnes depuis une feuille CSV / Excel, vérifiée ligne par ligne avant tout envoi. Chaque écriture est confirmée, deux fois en production",
    "📊 Maîtrisez le modèle de données — par colonne : taux de remplissage (exact, même sur des millions de lignes), 🧨 ce qui bloque sa suppression ou tout ce qui l'utilise (avec comment retirer chaque dépendance), 📑 ses couches de solution (une couche non gérée qui masque une solution gérée est signalée) ; et un dictionnaire de données de toutes les colonnes en CSV ou Excel",
    "✍ Du SQL qui écrit — UPDATE et DELETE dans le mode SQL de l'Explorer, toujours avec aperçu : d'abord toutes les lignes touchées avec leurs valeurs actuelles, puis Apply écrit exactement ces lignes par lots. Le WHERE est obligatoire",
    "📂 Explorer — « To file » écrit TOUTES les lignes d'une requête en CSV ou Excel quelle que soit la taille ; enregistrez n'importe quelle requête comme vue personnelle de sa table ; la requête enregistrée chargée a un Update en un clic ; collez n'importe quelle requête OData ou URL Web API",
    "🏋️ Taillé pour les grosses orgs — plus une requête par utilisateur ou par rôle, des lectures allégées, un VRAI compteur d'API dans la barre latérale (Colvio ralentit avant la limite de Dataverse au lieu d'être refusé), et une revue complète : une requête ralentie n'est jamais prise pour un délai dépassé, un échec ne se transforme jamais en réponse partielle",
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
