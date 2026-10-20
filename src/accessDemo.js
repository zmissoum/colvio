// Demo org for Show All Data › Access: three users facing one account owned in France.
// Same shape as the live getAccessContext answer.
const g = (n) => `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`;
const BU = { root: g(100), europe: g(101), france: g(102), spain: g(103) };
const P = { Create: g(200), Read: g(201), Write: g(202), Append: g(203), AppendTo: g(204), Delete: g(205), Assign: g(206), Share: g(207) };
const U = { alex: g(1), jeanne: g(2), sam: g(3), marie: g(4) };
const T = { keyAccounts: g(301), dealTeam: g(302) };
const R = { salesSpain: g(401), salesFrance: g(402), keyReader: g(403), sysadmin: g(404) };

export const DEMO_ACCESS_USERS = [
  { id: U.alex, name: "Alex Martin", email: "alex.martin@contoso.example" },
  { id: U.jeanne, name: "Jeanne Dubois", email: "jeanne.dubois@contoso.example" },
  { id: U.sam, name: "Sam Admin", email: "sam.admin@contoso.example" },
];

const BUS = [
  { id: BU.root, name: "Contoso", parentId: "" },
  { id: BU.europe, name: "Europe", parentId: BU.root },
  { id: BU.france, name: "France", parentId: BU.europe },
  { id: BU.spain, name: "Spain", parentId: BU.europe },
];
// Salesperson: Read at BU, AppendTo at BU, the rest at User — the same in each BU copy
const sales = (roleId) => [["Create", 2], ["Read", 2], ["Write", 1], ["Append", 1], ["AppendTo", 2], ["Delete", 1], ["Assign", 1], ["Share", 1]].map(([r, mask]) => ({ roleId, privilegeId: P[r], mask }));
const GRANTS = [
  ...sales(R.salesSpain), ...sales(R.salesFrance),
  { roleId: R.keyReader, privilegeId: P.Read, mask: 4 }, { roleId: R.keyReader, privilegeId: P.AppendTo, mask: 4 },
  ...Object.values(P).map(privilegeId => ({ roleId: R.sysadmin, privilegeId, mask: 8 })),
];
const ENTITY = { logicalName: "account", displayName: "Account", ownership: "UserOwned", privileges: Object.entries(P).map(([r, id]) => ({ PrivilegeId: id, Name: `prv${r}Account`, PrivilegeType: r })) };
const SHARES = [
  { principalId: T.dealTeam, principalType: "team", mask: "ReadAccess, WriteAccess", name: "Contoso deal team" },
  { principalId: U.marie, principalType: "systemuser", mask: "ReadAccess", name: "Marie Leroy" },
];

export function demoAccessContext(userId, record) {
  const rec = { id: record?.id || g(900), name: record?.name || "Contoso France", ownerId: U.jeanne, ownerType: "systemuser", ownerName: "Jeanne Dubois", buId: BU.france };
  const base = { entity: { ...ENTITY, logicalName: record?.entity || "account" }, record: rec, grants: GRANTS, bus: BUS, shares: SHARES };
  if (userId === U.jeanne) return { ...base,
    user: { id: U.jeanne, name: "Jeanne Dubois", buId: BU.france, accessMode: 0, disabled: false, roles: [{ id: R.salesFrance, name: "Salesperson", buId: BU.france }] },
    teams: [], effective: "ReadAccess, WriteAccess, AppendAccess, AppendToAccess, CreateAccess, DeleteAccess, ShareAccess, AssignAccess",
    origin: "The user owns the record." };
  if (userId === U.sam) return { ...base,
    user: { id: U.sam, name: "Sam Admin", buId: BU.root, accessMode: 0, disabled: false, roles: [{ id: R.sysadmin, name: "System Administrator", buId: BU.root, templateId: "627090ff-40a3-4053-8790-584edc5be201" }] },
    teams: [], effective: "ReadAccess, WriteAccess, AppendAccess, AppendToAccess, CreateAccess, DeleteAccess, ShareAccess, AssignAccess",
    origin: "The user has the System Administrator role." };
  return { ...base,
    user: { id: U.alex, name: "Alex Martin", buId: BU.spain, accessMode: 0, disabled: false, roles: [{ id: R.salesSpain, name: "Salesperson", buId: BU.spain }] },
    teams: [
      { id: T.keyAccounts, name: "Key Accounts EU", type: 0, buId: BU.europe, roles: [{ id: R.keyReader, name: "Key account reader", buId: BU.europe, inherited: 0 }] },
    ],
    effective: "ReadAccess, AppendToAccess",
    origin: "The user is a member of team Key Accounts EU, which has access to the record." };
}
