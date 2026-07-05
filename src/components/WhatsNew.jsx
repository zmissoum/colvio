import { useState, useEffect } from "react";
import { C, bt } from "../shared.jsx";
import { t, getLocale } from "../i18n.js";

// Post-update "What's new" popup — shows once per version (localStorage-tracked).
// HIGHLIGHTS only needs the CURRENT arc's top items; the full detail lives in CHANGELOG.md.
const HIGHLIGHTS = {
  en: [
    "⚙️ BPF manager — reopen or re-stage a locked Business Process Flow (admins)",
    "✎ Show All Data — edit fields the form marks read-only, straight through the API",
    "🧩 Security Audit — full privilege matrix per table, exportable to Excel/CSV",
    "👥 Security roles — Teams tab, plus bulk assign/remove for users (paste emails)",
    "🧹 Data Loader — NULL clears a field (lookups too) · \"strip HTML\" transform · EU/US date toggle",
    "🛡 Data Loader — a timeout can no longer silently drop rows: honest totals + retry exactly the unsent rows",
    "🔎 Data Loader — the pre-flight example now shows exactly what will be sent (transforms applied), and file lines vs parsed records are explained",
  ],
  fr: [
    "⚙️ Gestion BPF — rouvrez ou changez l'étape d'un Business Process Flow verrouillé (admins)",
    "✎ Show All Data — éditez les champs verrouillés par le formulaire, directement via l'API",
    "🧩 Audit de sécurité — matrice complète des privilèges par table, exportable Excel/CSV",
    "👥 Rôles de sécurité — onglet Teams, + affectation/retrait en masse (collez des e-mails)",
    "🧹 Data Loader — NULL vide un champ (lookups compris) · transform « strip HTML » · bascule de date EU/US",
    "🛡 Data Loader — un timeout ne peut plus perdre de lignes en silence : totaux honnêtes + retry des lignes non envoyées",
    "🔎 Data Loader — l'aperçu pré-vol montre exactement ce qui sera envoyé (transforms appliqués), et lignes de fichier vs enregistrements expliqués",
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
