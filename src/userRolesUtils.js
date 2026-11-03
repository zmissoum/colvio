// Security-role presentation helpers — PURE, no I/O, unit-tested (adminReview.test.js).
//
// 1. The roles of ONE user, as the Users & Licenses card shows them. Dataverse grants roles two
//    ways: directly (systemuserroles_association) and through the teams the user belongs to
//    (teamroles_association of each team). The standard provisioning is an Entra-group team
//    carrying the roles, so a direct-only card said "No security roles assigned" for correctly
//    provisioned users (review finding). The content script answers { direct, inherited,
//    teamsError }; the demo (and any older answer) is still a plain array of direct roles.
// 2. Security › "Has privilege": the holders sentence.

export const EMPTY_USER_ROLES = Object.freeze({ direct: [], inherited: [], teamsError: "", teamsRead: false });

/**
 * One shape whatever the answer's age:
 *  - array → direct roles only, teams NOT read (teamsRead false: the card must not claim "0 via teams")
 *  - { direct, inherited, teamsError } → as is; teamsRead true means the team read was ATTEMPTED
 *    (also when it failed — teamsError then says why)
 *  - anything else → empty, teams not read
 * inherited rows are { id, name, team: { id, name } } — one per role × team.
 */
export function normalizeUserRoles(res) {
  if (Array.isArray(res)) return { direct: res.filter(Boolean), inherited: [], teamsError: "", teamsRead: false };
  if (!res || typeof res !== "object") return { ...EMPTY_USER_ROLES };
  return {
    direct: Array.isArray(res.direct) ? res.direct.filter(Boolean) : [],
    inherited: Array.isArray(res.inherited) ? res.inherited.filter(Boolean) : [],
    teamsError: res.teamsError ? String(res.teamsError) : "",
    teamsRead: true,
  };
}

/** The card's label: "direct (N) · via teams (M)" — "?" when the team read failed, no team part when teams weren't read. */
export function userRolesLabel(ur) {
  const d = `direct (${ur.direct.length})`;
  if (!ur.teamsRead) return d;
  return `${d} · via teams (${ur.teamsError ? "?" : ur.inherited.length})`;
}

/**
 * "No security roles assigned" is only claimable when BOTH reads answered empty: over a failed
 * team read the card shows the error line instead ("" here), and when teams weren't read at all
 * the sentence says so.
 */
export function noRolesSentence(ur) {
  if (ur.direct.length || ur.inherited.length || ur.teamsError) return "";
  return ur.teamsRead ? "No security roles assigned — neither directly nor through a team" : "No security roles assigned directly (roles through teams not read)";
}

/**
 * Security › "Has privilege": the sentence counts EVERY role holding the privilege and says how
 * many the Custom/Managed chips and the search leave on screen — the shown count used to be
 * presented as the holder count (review finding).
 * @param holders    roles holding the privilege (at the chosen depth)
 * @param total      roles of the org
 * @param shown      roles listed after the chips and the search
 * @param depthText  e.g. " (Organization)" — appended to the count, before the shown note
 */
export function holdersCountLabel(holders, total, shown, depthText = "") {
  const base = `${holders} of ${total} roles hold it${depthText}`;
  return shown === holders ? base : `${base} (${shown} shown with the current filters)`;
}
