import { useState, useEffect } from "react";
import { C, bt } from "../shared.jsx";
import { t, getLocale } from "../i18n.js";

// Post-update "What's new" popup — shows once per version (localStorage-tracked).
// HIGHLIGHTS only needs the CURRENT arc's top items; the full detail lives in CHANGELOG.md.
const HIGHLIGHTS = {
  en: [
    "👥 NEW: Teams module — owner & Entra group teams, their members and the security roles they carry (a role inherited via a team never shows on the user — now you can see where it comes from), with the Entra group Object ID one click away",
    "⚡ SQL goes NATIVE — the Explorer's SQL mode can now send your SELECT straight to Dataverse (new Web API ?sql= option): real multi-table JOINs with aliases, self-joins, DISTINCT, server-side GROUP BY. Toggle back to the FetchXML transpiler for HAVING/TOP",
    "🛡 Production is detected RIGHT — the environment badge now reads Microsoft's real OrganizationType enum (a prod org reports 'Secondary'!), so the ⚠ PROD confirmations are armed where they must be: Loader runs, bulk update/delete, inline edits, BU moves",
    "🔎 Full product audit shipped — render caps keep huge orgs smooth, Escape closes every modal, exports everywhere (System Jobs, Audit History, Recycle Bin page, Excel variants), real cache-clearing ↻ on the inventories, and query history now redacts SQL & FetchXML values too (old entries scrubbed on upgrade)",
    "📥 Provisioning helpers — move users INTO a BU by pasting a list of emails (org-wide match, honest preview), edit LOOKUPS from Show All Data (link/relink/clear with GUID validation), and the storage quota self-heals (no more kQuotaBytes errors)",
    "⇄ Data model, finally honest — Relationships sorts business relations first (system plumbing behind a toggle) with a cache-clearing ↻, the Schema ERD draws N:N relationships at last, and Metadata gains Virtual/Elastic table filter chips",
  ],
  fr: [
    "👥 NOUVEAU : module Teams — teams propriétaires & groupes Entra, leurs membres et les rôles de sécurité qu'elles portent (un rôle hérité via une team n'apparaît jamais sur l'utilisateur — vous voyez enfin d'où il vient), avec l'Object ID du groupe Entra copiable en un clic",
    "⚡ Le SQL passe en NATIF — le mode SQL de l'Explorer envoie désormais votre SELECT directement à Dataverse (nouvelle option ?sql= de la Web API) : vrais JOIN multi-tables avec alias, self-joins, DISTINCT, GROUP BY côté serveur. Rebasculez sur le transpileur FetchXML pour HAVING/TOP",
    "🛡 La production est détectée CORRECTEMENT — le badge d'environnement lit le vrai enum OrganizationType de Microsoft (une org de prod répond « Secondary » !) : les confirmations ⚠ PROD sont armées là où il faut : runs du Loader, update/delete en masse, éditions inline, déplacements de BU",
    "🔎 Audit produit complet livré — caps de rendu pour les grosses orgs, Escape ferme toutes les modales, exports partout (System Jobs, historique d'audit, page Corbeille, variantes Excel), ↻ avec vrai vidage de cache sur les inventaires, et l'historique de requêtes expurge aussi les valeurs SQL & FetchXML (anciennes entrées nettoyées à la mise à jour)",
    "📥 Aides au provisioning — déplacez des utilisateurs VERS une BU en collant une liste d'emails (recherche org entière, aperçu honnête), éditez les LOOKUPS depuis Show All Data (lier/relier/effacer avec validation GUID), et le quota de stockage s'auto-répare (fini les erreurs kQuotaBytes)",
    "⇄ Un data model enfin honnête — Relationships trie les relations métier d'abord (plomberie système derrière un toggle) avec ↻ vide-cache, l'ERD Schema dessine enfin les relations N:N, et Metadata gagne des filtres Virtual/Elastic",
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
