import { useState, useEffect } from "react";
import { C, bt } from "../shared.jsx";
import { t, getLocale } from "../i18n.js";

// Post-update "What's new" popup — shows once per version (localStorage-tracked).
// HIGHLIGHTS only needs the CURRENT arc's top items; the full detail lives in CHANGELOG.md.
const HIGHLIGHTS = {
  en: [
    "🧩 NEW: Env Variables — defaults, overrides, and the ⚠ NO VALUE trap surfaced first · 📈 Adoption rebuilt (DAU/WAU/MAU, per-BU rates, inactivity, one-click PowerPoint report) · ⇄ Solutions compare, same-org and DEV→PROD",
    "⚡ Loader & Explorer edits are now TYPED by field metadata — numbers, dates, GUIDs, option values validated BEFORE sending; lookups edited via @odata.bind with a target picker; readable refusals, no more cryptic 400s",
    "⧉ Explorer — duplicate finder (pick the columns that define a duplicate, keep-first selection, review CSV) · $batch bulk delete with one ✕ Cancel · sticky horizontal scrollbar · Builder queries restore from history INTO the Builder",
    "🏢 Business Units — full-screen org chart (folded, PNG export) · bulk MOVE users to a BU with the roles truth stated first · paste a list of emails to select the matches — built for provisioning waves",
    "🛡 Reliability — the D365 tab is kept awake during long runs (browser memory-saver was killing them) and Colvio never sends a request to a tab showing a different environment",
    "🌊 System Ops Cloud Flow Runs · 🔎 Apps view inspector & subgrids · 260 unit tests after a full write-path audit",
  ],
  fr: [
    "🧩 NOUVEAU : Variables d'env. — défauts, overrides et le piège ⚠ NO VALUE mis en avant · 📈 Adoption refondue (DAU/WAU/MAU, taux par BU, inactivité, rapport PowerPoint en un clic) · ⇄ Comparaison de solutions, même org et DEV→PROD",
    "⚡ Les éditions du Loader ET de l'Explorer sont TYPÉES par les métadonnées — nombres, dates, GUID, valeurs d'option validés AVANT l'envoi ; lookups édités via @odata.bind avec choix de la cible ; refus lisibles, fini les 400 cryptiques",
    "⧉ Explorer — détecteur de doublons (choisissez les colonnes de la règle, sélection garde-le-premier, CSV de revue) · suppression $batch avec un ✕ Cancel · barre de défilement collante · l'historique restaure les requêtes Builder DANS le Builder",
    "🏢 Business Units — organigramme plein écran (replié, export PNG) · DÉPLACEMENT en masse d'utilisateurs avec la vérité sur les rôles annoncée d'abord · collez une liste d'emails pour sélectionner les correspondances — pensé pour les vagues de provisioning",
    "🛡 Fiabilité — l'onglet D365 reste éveillé pendant les longs runs (la mise en veille du navigateur les tuait) et Colvio n'envoie jamais une requête vers un onglet affichant un autre environnement",
    "🌊 System Ops : runs des cloud flows · 🔎 Apps : inspecteur de vues & subgrids · 260 tests unitaires après un audit complet des chemins d'écriture",
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
  if (!show) return null;
  const items = HIGHLIGHTS[getLocale()] || HIGHLIGHTS.en;

  return (
    <div onClick={dismiss} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 280, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 440, maxWidth: "92vw", background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 12, padding: 22, boxShadow: "0 16px 48px rgba(0,0,0,.55)" }}>
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
