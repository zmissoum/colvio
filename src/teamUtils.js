// Teams module logic — PURE, unit-tested.
//
// Dataverse team model (the part users actually need explained): `teamtype` decides everything.
//   0 Owner        — can own records and carry SECURITY ROLES (members inherit them; an inherited
//                    role never shows on the user — it's managed on the team).
//   1 Access       — auto-created per RECORD by access-team templates; no roles, pure sharing.
//                    Orgs accumulate thousands, so they're loaded separately and capped.
//   2 Entra security group / 3 Entra office group — membership lives in ENTRA ID, and Dataverse
//                    materializes it LAZILY: a user added to the group appears in the team only
//                    after their next access to the environment.
const FMT = "@OData.Community.Display.V1.FormattedValue";

export const TEAM_TYPES = {
  0: { key: "owner",  label: "Owner",              color: "vi" },
  1: { key: "access", label: "Access",             color: "txd" },
  2: { key: "entra",  label: "Entra security grp", color: "cy" },
  3: { key: "entra",  label: "Entra office grp",   color: "cy" },
};

// Raw OData team row → flat shape the UI renders. Unknown teamtype keeps the platform's own
// formatted label when present (future team kinds surface instead of breaking).
export function normalizeTeam(r) {
  if (!r) return null;
  const type = TEAM_TYPES[r.teamtype] || { key: "other", label: r["teamtype" + FMT] || `Type ${r.teamtype}`, color: "txd" };
  return {
    id: r.teamid,
    name: r.name || "(no name)",
    description: r.description || "",
    teamtype: r.teamtype,
    typeKey: type.key,
    typeLabel: type.label,
    typeColor: type.color,
    isDefault: !!r.isdefault, // every BU owns one default team named after it
    aadId: r.azureactivedirectoryobjectid || null,
    buName: r["_businessunitid_value" + FMT] || "",
    adminName: r["_administratorid_value" + FMT] || "",
    createdon: r.createdon || null,
  };
}

// Raw N:N systemuser row → member row (same columns as the BU member panel).
export function normalizeMember(r) {
  if (!r) return null;
  return {
    id: r.systemuserid,
    fullname: r.fullname || "(no name)",
    email: r.internalemailaddress || r.domainname || "",
    title: r.title || "",
    disabled: !!r.isdisabled,
    accessModeLabel: r["accessmode" + FMT] || "",
    calTypeLabel: r["caltype" + FMT] || "",
  };
}

// Chip semantics: "all" = every loaded NON-access team (access teams are per-record noise —
// they only show under their own chip, which triggers their capped lazy load); "owner"/"entra"
// filter by kind. Search covers name, description, BU and administrator, case-insensitively.
export function filterTeams(teams, { search = "", chip = "all" } = {}) {
  const s = search.trim().toLowerCase();
  return (teams || []).filter(t => {
    if (chip === "all" ? t.typeKey === "access" : t.typeKey !== chip) return false;
    if (!s) return true;
    return [t.name, t.description, t.buName, t.adminName].some(v => (v || "").toLowerCase().includes(s));
  });
}

// Sort: real teams alphabetically, each BU's auto-created default team pushed to the end —
// they mirror the BU tree and would otherwise drown the hand-made teams on big orgs.
export function sortTeams(teams) {
  return [...(teams || [])].sort((a, b) =>
    (a.isDefault === b.isDefault) ? a.name.localeCompare(b.name) : (a.isDefault ? 1 : -1));
}
