import { useState, useEffect } from "react";
import { C, bt } from "../shared.jsx";
import { t, getLocale } from "../i18n.js";

// Post-update "What's new" popup — shows once per version (localStorage-tracked).
// HIGHLIGHTS only needs the CURRENT arc's top items; the full detail lives in CHANGELOG.md.
const HIGHLIGHTS = {
  en: [
    "🧩 NEW: Env Variables — defaults, per-environment overrides, and the ⚠ NO VALUE trap surfaced first; typed editing (yes/no, JSON validated), Key Vault references handled honestly",
    "⇄ Solutions — COMPARE two solutions (Only in A / In both / Only in B) with an unmanaged-overlap warning; export a compare file on DEV, load it on PROD to see environment drift",
    "📈 Adoption rebuilt — honest \"access events\" (Dataverse logs ≤1 per ~4 h), DAU/WAU/MAU + stickiness, per-BU adoption rates, license & inactivity view, service accounts in their own section",
    "🌊 System Ops — NEW Cloud Flow Runs tab (solution flows' run history, Failed filter, error messages) · plugin traces get quick time windows (traces purge after ~24 h — calendars lied)",
    "🔎 Apps — view inspector (filters decoded + columns), form subgrids with their views, \"Open in Explorer\" to replay any view's FetchXML",
    "⬇ API Tester — download the response as .json/.txt with a sensible filename",
  ],
  fr: [
    "🧩 NOUVEAU : Variables d'env. — défauts, overrides par environnement, et le piège ⚠ NO VALUE mis en avant ; édition typée (yes/no, JSON validé), références Key Vault traitées honnêtement",
    "⇄ Solutions — COMPAREZ deux solutions (Uniquement dans A / Dans les deux / Uniquement dans B) avec alerte de chevauchement unmanaged ; exportez un fichier sur DEV, chargez-le sur PROD pour voir la dérive",
    "📈 Adoption refondue — « événements d'accès » honnêtes (Dataverse journalise ≤1 par ~4 h), DAU/WAU/MAU + stickiness, taux par BU, vue licences & inactivité, comptes de service dans leur propre section",
    "🌊 System Ops — NOUVEL onglet Runs cloud flows (historique des flows de solution, filtre Failed, messages d'erreur) · traces plug-ins en fenêtres rapides (purge à ~24 h — le calendrier mentait)",
    "🔎 Applications — inspecteur de vues (filtres décodés + colonnes), subgrids des formulaires avec leurs vues, « Open in Explorer » pour rejouer le FetchXML d'une vue",
    "⬇ API Tester — téléchargez la réponse en .json/.txt avec un nom de fichier parlant",
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
