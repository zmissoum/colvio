import { useState, useEffect } from "react";
import { C, bt } from "../shared.jsx";
import { t, getLocale } from "../i18n.js";

// Post-update "What's new" popup — shows once per version (localStorage-tracked).
// HIGHLIGHTS only needs the CURRENT arc's top items; the full detail lives in CHANGELOG.md.
const HIGHLIGHTS = {
  en: [
    "📱 NEW: Apps — every model-driven app's real inventory: the invisible \"include all forms/views\" made visible, EXPLICIT/IMPLICIT badges, reverse \"which apps expose this?\" search",
    "⚡ NEW: Automation — plug-in steps + every workflow/flow/rule/action, with honest Microsoft/Managed/Custom source classification",
    "📈 NEW: Adoption — who actually uses the CRM: logins, distinct users, never-signed-in list; exact totals on any audit volume",
    "🔍 Explorer — relational filters in the Builder: \"accounts with NO open opportunity\" without writing any() yourself",
    "🌐 Security Audit — org-wide \"who can do what\" across every role, privilege matrix per table, bulk role assign/remove",
    "🔁 Data Loader — auto-resume after a timeout, honest accounting (no silently dropped rows), retry pass, opt-in \"empty cells clear fields\"",
    "🧹 Data Loader — NULL clears a field (lookups too) · strip-HTML transform · EU/US date toggle · migration mode for audit fields",
    "🗂 Sidebar reorganized — Data / Develop / Admin sections · virtual/elastic table badges everywhere",
  ],
  fr: [
    "📱 NOUVEAU : Applications — le vrai inventaire de chaque app model-driven : le « tous les formulaires/vues » invisible rendu visible, badges EXPLICIT/IMPLICIT, recherche inversée « quelles apps exposent ceci ? »",
    "⚡ NOUVEAU : Automatisations — étapes de plug-ins + tous les workflows/flows/règles/actions, avec classification honnête Microsoft/Managed/Custom",
    "📈 NOUVEAU : Adoption — qui utilise vraiment le CRM : connexions, utilisateurs distincts, jamais-connectés ; totaux exacts quel que soit le volume",
    "🔍 Explorateur — filtres relationnels dans le Builder : « les comptes SANS opportunité ouverte » sans écrire de any() vous-même",
    "🌐 Audit de sécurité — vue org-wide « qui peut faire quoi » sur tous les rôles, matrice par table, affectation de rôles en masse",
    "🔁 Data Loader — reprise auto après timeout, comptes honnêtes (aucune ligne perdue en silence), passe de retry, option « cellules vides = vider »",
    "🧹 Data Loader — NULL vide un champ (lookups compris) · transform strip-HTML · bascule de date EU/US · mode migration pour les champs d'audit",
    "🗂 Sidebar réorganisée — sections Données / Développement / Administration · badges tables virtuelles/élastiques partout",
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
