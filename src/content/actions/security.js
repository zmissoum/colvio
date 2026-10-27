// Content script › security. Users and security — users, business units, logins, roles, privileges, access checks.
// One async function per action; `params` is what the panel sent. Every request goes through
// core.js (dvRequest: host lock, pacing, timeouts, 429 back-off).
import { NO_ANN, SAFE_GUID, countByFilter, d365Context, dvRequest, ensurePrivCatalog, extractContext, odataStr, validateEntitySet, validateGuid, validateName } from "../core.js";

const ACTIONS = {
  async searchUsers(params) {
    let result;
    // Search systemusers by name or email
    const term = odataStr(typeof params.search === "string" ? params.search.substring(0, 100) : "");
    const filter = `contains(fullname,${term}) or contains(internalemailaddress,${term})`;
    const data = await dvRequest("GET",
      `systemusers?$select=systemuserid,fullname,internalemailaddress,isdisabled,title&$filter=${filter}&$top=20&$orderby=fullname asc`
    );
    result = (data.value || []).map(u => ({
      id: u.systemuserid,
      fullname: u.fullname,
      email: u.internalemailaddress,
      disabled: u.isdisabled,
      title: u.title,
    }));
    return result;
  },
  async getLoginHistory(params) {
    let result;
    const userId = params.userId;
    validateGuid(userId);
    const top = Math.min(parseInt(params.top, 10) || 100, 5000);

    // Strategy 1: user-access audit — 64 = User Access via Web (model-driven app),
    // 65 = User Access via Web Services (API / other clients). Neither is a sign-in or a
    // sign-out (Dataverse has no sign-out event): the panel labels them by channel.
    let path = `audits?$select=createdon,action,_userid_value,_objectid_value,useradditionalinfo,operation,changedata&$filter=_objectid_value eq ${userId} and (action eq 64 or action eq 65)&$top=${top}&$orderby=createdon desc`;
    let data = await dvRequest("GET", path);
    let records = (data.value || []).map(a => ({
      date: a.createdon,
      actionCode: a.action,
      accessType: a["action@OData.Community.Display.V1.FormattedValue"] || "",
      userId: a["_objectid_value"],
      userName: a["_objectid_value@OData.Community.Display.V1.FormattedValue"] || "",
      info: a.useradditionalinfo || "",
      changedata: a.changedata || "",
      operation: a["operation@OData.Community.Display.V1.FormattedValue"] || "",
    }));

    // Strategy 2: If no login events, try ALL audit records for this user
    if (records.length === 0) {
      try {
        const broader = await dvRequest("GET",
          `audits?$select=createdon,action,_objectid_value&$filter=_objectid_value eq ${userId}&$top=5&$orderby=createdon desc`
        );
        if (broader.value && broader.value.length > 0) {
          records = [{ date: null, action: "__AUDIT_EXISTS_BUT_NO_LOGINS", userId, info: `${broader.value.length} other audit records found` }];
        }
      } catch {}
    }

    result = records;
    return result;
  },
  async getLoginStatsSlice(params) {
    let result;
    // ONE time slice (typically a day) of login audit, aggregated SERVER-SIDE per user via
    // FetchXML aggregate (count + max createdon, grouped by objectid — the audit table
    // supports aggregates per learn.microsoft.com/power-apps/developer/data-platform/auditing/retrieve-audit-data).
    // Dataverse caps ANY aggregate query at 50k scanned rows (AggregateQueryRecordLimit);
    // the caller slices the window by day precisely so each query stays under it —
    // Microsoft's documented workaround ("add date-range filters, run multiple times,
    // combine"). A slice that still blows the cap (>50k logins in one day) falls back to a
    // raw paged scan of JUST that slice, aggregated here. Either way only per-user totals
    // cross the bridge — never raw events — so org size stops mattering.
    const ISO_S = /^\d{4}-\d{2}-\d{2}(T[0-9:.]+Z?)?$/; // guards both OData and FetchXML interpolation
    if (!params.from || !ISO_S.test(params.from) || !params.to || !ISO_S.test(params.to)) throw new Error("getLoginStatsSlice: invalid from/to");
    const fromS = params.from, toS = params.to;
    // Exact-but-slower path: paged raw scan of the slice, aggregated here. Used when the
    // aggregate result is truncated, errors, or blows the 50k AggregateQueryRecordLimit.
    const scanSlice = async () => {
      const byU = new Map();
      let url = `audits?$select=createdon,_objectid_value&$filter=action eq 64 and createdon ge ${fromS} and createdon lt ${toS}`;
      while (url) {
        const dL = await dvRequest("GET", url, null, { Prefer: "odata.maxpagesize=5000" });
        for (const a of (dL.value || [])) {
          const id = a._objectid_value || "";
          let u = byU.get(id);
          if (!u) { u = { userId: id, userName: a["_objectid_value@OData.Community.Display.V1.FormattedValue"] || "", count: 0, last: "" }; byU.set(id, u); }
          u.count++; if (a.createdon > u.last) u.last = a.createdon;
        }
        const nl = dL["@odata.nextLink"];
        url = nl ? nl.replace(/^.*\/api\/data\/v[\d.]+\//, "") : null;
      }
      return { rows: [...byU.values()], method: "scan" };
    };
    try {
      // count=5000: audit is an ELASTIC table, whose default page size is 500 (not 5000) —
      // without it the aggregate result was silently paged at 500 groups and the chart
      // flat-lined at exactly 500 distinct users/day. <order alias> on the groupby column
      // per the aggregate-data doc.
      const fx = `<fetch aggregate="true" count="5000"><entity name="audit"><attribute name="objectid" alias="uid" groupby="true"/><attribute name="auditid" alias="n" aggregate="count"/><attribute name="createdon" alias="last" aggregate="max"/><filter type="and"><condition attribute="action" operator="eq" value="64"/><condition attribute="createdon" operator="ge" value="${fromS}"/><condition attribute="createdon" operator="lt" value="${toS}"/></filter><order alias="uid"/></entity></fetch>`;
      const d = await dvRequest("GET", `audits?fetchXml=${encodeURIComponent(fx)}`);
      const vals = d.value || [];
      // ANY continuation signal — or a full page — means the aggregate was truncated by
      // server paging: never trust it, take the exact scan instead. Threshold is 500, NOT
      // 5000: elastic tables clamp the page size to a 500 MAXIMUM (page-results doc), so
      // count="5000" is best-effort and a 5000 threshold could never fire.
      const truncated = !!d["@Microsoft.Dynamics.CRM.fetchxmlpagingcookie"] || !!d["@odata.nextLink"] || d["@Microsoft.Dynamics.CRM.morerecords"] === true || vals.length >= 500;
      if (truncated) {
        result = await scanSlice();
      } else {
        const rows = vals.map(r => ({
          userId: r.uid || "",
          userName: r["uid@OData.Community.Display.V1.FormattedValue"] || "",
          count: r.n || 0,
          last: r.last || "",
        }));
        result = { rows, method: "aggregate" };
      }
    } catch (e) {
      const msg = e?.message || "";
      // Auth/session problems must surface as a failed slice; any other aggregate hiccup
      // (50k limit 8004E023, elastic quirks with count/order…) falls back to the exact scan.
      if (/401|403|privilege|permission|expired/i.test(msg)) throw e;
      result = await scanSlice();
    }
    return result;
  },
  async getAllUsers(params) {
    let result;
    const ACCESS_MODES = { 0: "Read-Write", 1: "Admin", 2: "Read", 3: "Support", 4: "Non-Interactive", 5: "Delegated Admin" };
    const CAL_TYPES = { 0: "Full", 1: "Admin", 2: "Basic", 3: "Device Full", 4: "Device Basic", 5: "Essential", 6: "Device Essential", 7: "Enterprise", 8: "Device Enterprise", 9: "Sales", 10: "Service", 11: "Field Service", 12: "Project Service" };
    const fields = "systemuserid,fullname,internalemailaddress,isdisabled,accessmode,caltype,title,createdon,_businessunitid_value,address1_telephone1,mobilephone,_parentsystemuserid_value,applicationid";
    const mapUser = (u) => ({
      id: u.systemuserid,
      fullname: u.fullname || "",
      email: u.internalemailaddress || "",
      disabled: u.isdisabled,
      accessMode: u.accessmode ?? 0,
      accessModeLabel: ACCESS_MODES[u.accessmode] || `Mode ${u.accessmode}`,
      calType: u.caltype ?? 0,
      calTypeLabel: CAL_TYPES[u.caltype] || `Type ${u.caltype}`,
      buName: u["_businessunitid_value@OData.Community.Display.V1.FormattedValue"] || "",
      buId: u._businessunitid_value || "",
      title: u.title || "",
      manager: u["_parentsystemuserid_value@OData.Community.Display.V1.FormattedValue"] || "",
      phone: u.address1_telephone1 || "",
      mobile: u.mobilephone || "",
      createdOn: u.createdon,
      isApp: !!u.applicationid, // S2S application user — never logs in interactively by design
    });
    // Cursor-based pagination: fetch in batches ordered by systemuserid,
    // each page filters systemuserid > lastId. This avoids paging cookie
    // and nextLink issues on the systemuser entity.
    let allUsers = [];
    let lastId = "00000000-0000-0000-0000-000000000000";
    let pageNum = 0;
    while (pageNum < 50) { // safety cap: 50 pages * 5000 = 250k users
      pageNum++;
      const filterPart = `systemuserid gt ${lastId}`;
      const data = await dvRequest("GET",
        `systemusers?$select=${fields}&$filter=${filterPart}&$orderby=systemuserid asc&$top=5000`
      );
      const records = data.value || [];
      if (records.length === 0) break;
      allUsers = allUsers.concat(records.map(mapUser));
      lastId = records[records.length - 1].systemuserid;
      if (records.length < 5000) break; // last page
    }
    allUsers.sort((a, b) => a.fullname.localeCompare(b.fullname));
    result = allUsers;
    return result;
  },
  async getUserCountsByBu(params) {
    let result;
    // One grouped-aggregate query → user count per business unit. The aggregate hits
    // Dataverse's AggregateQueryRecordLimit (~50k scanned rows) on large orgs and used to
    // fail into blank badges ("0 users" everywhere until a BU was clicked) — now it falls
    // back to a paged scan of JUST the BU column: exact counts whatever the user volume.
    const counts = {};
    try {
      const dC = await dvRequest("GET", "systemusers?$apply=groupby((_businessunitid_value),aggregate($count as count))");
      (dC.value || []).forEach(r => { counts[r._businessunitid_value || ""] = r.count || 0; });
    } catch {
      let urlC = "systemusers?$select=_businessunitid_value";
      while (urlC) {
        const p = await dvRequest("GET", urlC, null, { Prefer: "odata.maxpagesize=5000" });
        (p.value || []).forEach(r => { const k = r._businessunitid_value || ""; counts[k] = (counts[k] || 0) + 1; });
        const nl = p["@odata.nextLink"]; urlC = nl ? nl.replace(/^.*\/api\/data\/v[\d.]+\//, "") : null;
      }
    }
    result = counts;
    return result;
  },
  async getUsersByBu(params) {
    let result;
    // Direct members of ONE business unit, fetched lazily when that BU is opened (keeps the
    // module snappy on large orgs instead of loading every user on mount). Same row shape as
    // getAllUsers so the panel renders identically.
    const buIdB = String(params.buId || "");
    if (buIdB) validateGuid(buIdB); // never interpolate an unvalidated id into the OData URL
    const ACCESS_MODES_B = { 0: "Read-Write", 1: "Admin", 2: "Read", 3: "Support", 4: "Non-Interactive", 5: "Delegated Admin" };
    const CAL_TYPES_B = { 0: "Full", 1: "Admin", 2: "Basic", 3: "Device Full", 4: "Device Basic", 5: "Essential", 6: "Device Essential", 7: "Enterprise", 8: "Device Enterprise", 9: "Sales", 10: "Service", 11: "Field Service", 12: "Project Service" };
    const fieldsB = "systemuserid,fullname,internalemailaddress,domainname,isdisabled,accessmode,caltype,title,createdon,_businessunitid_value,address1_telephone1,mobilephone,_parentsystemuserid_value";
    const mapUserB = (u) => ({
      id: u.systemuserid, fullname: u.fullname || "", email: u.internalemailaddress || "", upn: u.domainname || "",
      disabled: u.isdisabled, accessMode: u.accessmode ?? 0, accessModeLabel: ACCESS_MODES_B[u.accessmode] || `Mode ${u.accessmode}`,
      calType: u.caltype ?? 0, calTypeLabel: CAL_TYPES_B[u.caltype] || `Type ${u.caltype}`,
      buName: u["_businessunitid_value@OData.Community.Display.V1.FormattedValue"] || "", buId: u._businessunitid_value || "",
      title: u.title || "", manager: u["_parentsystemuserid_value@OData.Community.Display.V1.FormattedValue"] || "",
      phone: u.address1_telephone1 || "", mobile: u.mobilephone || "", createdOn: u.createdon,
    });
    const filtB = buIdB ? `_businessunitid_value eq ${buIdB}` : "_businessunitid_value eq null";
    let usersB = [];
    // paged with maxpagesize, NOT $top: $top is a hard result cap and suppresses
    // @odata.nextLink, so a BU with more than 5,000 members was cut silently (audit finding)
    let urlB = `systemusers?$select=${fieldsB}&$filter=${filtB}&$orderby=fullname asc`;
    let guardB = 0;
    while (urlB && guardB++ < 50) {
      const dataB = await dvRequest("GET", urlB, null, { Prefer: "odata.maxpagesize=5000" });
      usersB = usersB.concat((dataB.value || []).map(mapUserB));
      const nlB = dataB["@odata.nextLink"];
      urlB = nlB ? nlB.replace(/^.*\/api\/data\/v[\d.]+\//, "") : null;
    }
    result = usersB;
    return result;
  },
  async getAccessContext(params) {
    let result;
    // Everything needed to explain ONE user's access to ONE record, in a fixed number of
    // reads — none per role, per team or per privilege: the user and their roles, their
    // teams and those teams' roles, the table's privileges and ownership, the record's owner
    // and business unit, the grants of those roles on those privileges, the BU tree, and
    // Dataverse's own answers (RetrievePrincipalAccess, the record's shares, access origin).
    validateName(params.entity, "entity");
    validateName(params.entitySet, "entitySet");
    if (!params.recordId || !params.userId) throw new Error("Missing record or user.");
    validateGuid(params.recordId);
    validateGuid(params.userId);
    const uidA = params.userId, ridA = params.recordId;
    const nl = (d) => d["@odata.nextLink"] || null; // absolute — dvRequest checks it targets this org
    const pageAll = async (url) => { const out = []; while (url) { const d = await dvRequest("GET", url, null, { Prefer: "odata.maxpagesize=5000" }); out.push(...(d.value || [])); url = nl(d); } return out; };
    const fvA = (e, f) => e[`${f}@OData.Community.Display.V1.FormattedValue`] || "";
    const roleOf = (r) => ({ id: r.roleid, name: r.name || "", buId: r._businessunitid_value || "", templateId: r._roletemplateid_value || "", inherited: r.isinherited ?? null });

    // 1. the user and their roles
    const uA = await dvRequest("GET", `systemusers(${uidA})?$select=fullname,isdisabled,accessmode,_businessunitid_value&$expand=systemuserroles_association($select=roleid,name,_businessunitid_value,_roletemplateid_value)`);
    // 2. their teams (owner, access, Entra group teams) with each team's roles
    let teamsRaw;
    const teamSel = (withInh) => `teams?$select=teamid,name,teamtype,_businessunitid_value&$filter=teammembership_association/any(m:m/systemuserid eq ${uidA})&$expand=teamroles_association($select=roleid,name,_businessunitid_value${withInh ? ",isinherited" : ""})`;
    try { teamsRaw = await pageAll(teamSel(true)); } catch { teamsRaw = await pageAll(teamSel(false)); }
    // 3. the table: ownership + its privileges
    const metaA = await dvRequest("GET", `EntityDefinitions(LogicalName='${params.entity}')?$select=LogicalName,DisplayName,OwnershipType,PrimaryIdAttribute,PrimaryNameAttribute,Privileges`);
    const ownership = String(metaA.OwnershipType || "");
    // 4. the record: owner + business unit (user/team-owned tables only)
    const pnA = metaA.PrimaryNameAttribute;
    const recSel = [metaA.PrimaryIdAttribute, pnA, ...(ownership === "UserOwned" || ownership === "TeamOwned" ? ["_ownerid_value", "_owningbusinessunit_value"] : [])].filter(Boolean).join(",");
    const recA = await dvRequest("GET", `${params.entitySet}(${ridA})?$select=${recSel}`);
    // 5. the grants of every role involved on this table's privileges — one filtered read per 40 roles
    const roleIds = [...new Set([...(uA.systemuserroles_association || []), ...teamsRaw.flatMap(t => t.teamroles_association || [])].map(r => String(r.roleid).toLowerCase()))];
    const privIds = (metaA.Privileges || []).map(p => String(p.PrivilegeId).toLowerCase());
    const grantsA = [];
    if (roleIds.length && privIds.length) {
      for (let i = 0; i < roleIds.length; i += 40) {
        const pk = roleIds.slice(i, i + 40);
        let url = `roleprivilegescollection?$select=roleid,privilegeid,privilegedepthmask&$filter=(${pk.map(id => `roleid eq ${id}`).join(" or ")}) and (${privIds.map(id => `privilegeid eq ${id}`).join(" or ")})`;
        while (url) {
          const d = await dvRequest("GET", url, null, { Prefer: "odata.maxpagesize=5000", ...NO_ANN });
          for (const r of d.value || []) grantsA.push({ roleId: r.roleid, privilegeId: r.privilegeid, mask: r.privilegedepthmask });
          url = nl(d);
        }
      }
    }
    // 6. the business-unit tree
    const busA = (await pageAll("businessunits?$select=businessunitid,name,_parentbusinessunitid_value")).map(b => ({ id: b.businessunitid, name: b.name || "", parentId: b._parentbusinessunitid_value || "" }));
    // 7. Dataverse's own answers
    const targetA = encodeURIComponent(JSON.stringify({ "@odata.id": `${params.entitySet}(${ridA})` }));
    let effective = null, effectiveError = "", shares = null, sharesError = "", origin = "", originError = "";
    try { effective = (await dvRequest("GET", `systemusers(${uidA})/Microsoft.Dynamics.CRM.RetrievePrincipalAccess(Target=@t)?@t=${targetA}`)).AccessRights ?? ""; }
    catch (e) { effectiveError = e.message || String(e); }
    try {
      const dS = await dvRequest("GET", `RetrieveSharedPrincipalsAndAccess(Target=@t)?@t=${targetA}`);
      shares = (dS.PrincipalAccesses || []).map(pa => {
        const p = pa.Principal || {};
        const type = /team/i.test(p["@odata.type"] || "") ? "team" : /organization/i.test(p["@odata.type"] || "") ? "organization" : "systemuser";
        return { principalId: p.ownerid || p.systemuserid || p.teamid || p.principalid || "", principalType: type, mask: pa.AccessMask || "" };
      });
      // name the principals: users and teams in "or" packets of 25
      for (const [type, es, idF, nameF] of [["systemuser", "systemusers", "systemuserid", "fullname"], ["team", "teams", "teamid", "name"]]) {
        const ids = [...new Set(shares.filter(s => s.principalType === type && SAFE_GUID.test(s.principalId)).map(s => s.principalId))];
        for (let i = 0; i < ids.length; i += 25) {
          try {
            const d = await dvRequest("GET", `${es}?$select=${idF},${nameF}&$filter=${ids.slice(i, i + 25).map(id => `${idF} eq ${id}`).join(" or ")}`);
            for (const e of d.value || []) for (const s of shares) if (String(s.principalId).toLowerCase() === String(e[idF]).toLowerCase()) s.name = e[nameF] || "";
          } catch { /* unnamed */ }
        }
      }
    } catch (e) { sharesError = e.message || String(e); }
    try { origin = (await dvRequest("GET", `RetrieveAccessOrigin(ObjectId=@o,LogicalName=@l,PrincipalId=@p)?@o=${ridA}&@l='${params.entity}'&@p=${uidA}`)).Response || ""; }
    catch (e) { originError = e.message || String(e); }

    result = {
      user: {
        id: uidA, name: uA.fullname || "", disabled: !!uA.isdisabled, accessMode: uA.accessmode ?? 0,
        buId: uA._businessunitid_value || "", buName: fvA(uA, "_businessunitid_value"),
        roles: (uA.systemuserroles_association || []).map(roleOf),
      },
      teams: teamsRaw.map(t => ({ id: t.teamid, name: t.name || "", type: t.teamtype ?? 0, buId: t._businessunitid_value || "", roles: (t.teamroles_association || []).map(roleOf) })),
      entity: { logicalName: metaA.LogicalName, displayName: metaA.DisplayName?.UserLocalizedLabel?.Label || metaA.LogicalName, ownership, privileges: (metaA.Privileges || []).map(p => ({ PrivilegeId: p.PrivilegeId, Name: p.Name, PrivilegeType: p.PrivilegeType })) },
      record: {
        id: ridA, name: (pnA && recA[pnA]) || "",
        ownerId: recA._ownerid_value || "", ownerName: fvA(recA, "_ownerid_value"),
        ownerType: recA["_ownerid_value@Microsoft.Dynamics.CRM.lookuplogicalname"] || "",
        buId: recA._owningbusinessunit_value || "",
      },
      grants: grantsA, bus: busA,
      effective, effectiveError, shares, sharesError, origin, originError,
    };
    return result;
  },
  async getUserRoles(params) {
    let result;
    validateGuid(params.userId);
    const data = await dvRequest("GET",
      `systemusers(${params.userId})/systemuserroles_association?$select=roleid,name`
    );
    result = (data.value || []).map(r => ({
      id: r.roleid,
      name: r.name,
    }));
    return result;
  },
  async getAccessAuditFloor(params) {
    let result;
    // The oldest user-access audit row: the point past which "never signed in" is certain.
    try {
      const d = await dvRequest("GET", "audits?$select=createdon&$filter=action eq 64&$orderby=createdon asc&$top=1", null, NO_ANN);
      result = { floor: (d.value || [])[0]?.createdon || null };
    } catch (e) { result = { floor: null, error: e.message }; }
    return result;
  },
  async getLastLoginsWindow(params) {
    let result;
    // The latest login of EVERY user inside [from, to): ONE FetchXML aggregate (max createdon
    // grouped by user) — never a request per user. The audit is an elastic table: an
    // aggregate answer is clamped at 500 groups and a query scanning > 50k rows is refused
    // (AggregateQueryRecordLimit) — either way the window is split in two and retried, down
    // to one hour; an hour still too busy is read raw (500 rows a page) and folded here.
    const ISO_W = /^\d{4}-\d{2}-\d{2}T[0-9:.]+Z$/;
    if (!ISO_W.test(String(params.from || "")) || !ISO_W.test(String(params.to || ""))) throw new Error("getLastLoginsWindow: invalid from/to");
    const out = {};
    let requests = 0, scans = 0;
    const keep = (id, iso) => { if (!id || !iso) return; const k = String(id).toLowerCase(); if (!out[k] || iso > out[k]) out[k] = iso; };
    const isoOf = (ms) => new Date(ms).toISOString();
    const walk = async (fMs, tMs) => {
      const f = isoOf(fMs), t = isoOf(tMs);
      const fx = `<fetch aggregate="true" count="5000"><entity name="audit"><attribute name="objectid" alias="uid" groupby="true"/><attribute name="createdon" alias="last" aggregate="max"/><filter type="and"><condition attribute="action" operator="in"><value>64</value><value>65</value></condition><condition attribute="createdon" operator="ge" value="${f}"/><condition attribute="createdon" operator="lt" value="${t}"/></filter><order alias="uid"/></entity></fetch>`;
      let d = null, truncated = false;
      requests++;
      try {
        d = await dvRequest("GET", `audits?fetchXml=${encodeURIComponent(fx)}`, null, NO_ANN);
        const vals = d.value || [];
        truncated = !!d["@Microsoft.Dynamics.CRM.fetchxmlpagingcookie"] || !!d["@odata.nextLink"] || d["@Microsoft.Dynamics.CRM.morerecords"] === true || vals.length >= 500;
        if (!truncated) { for (const v of vals) keep(v.uid, v.last); return; }
      } catch (e) {
        if (!/AggregateQueryRecordLimit|maximum record limit|50,?000/i.test(e.message || "")) throw e; // only the 50k limit bisects — any other error surfaces
        truncated = true;
      }
      if (tMs - fMs > 3600000) { const mid = fMs + Math.floor((tMs - fMs) / 2); await walk(mid, tMs); await walk(fMs, mid); return; }
      scans++;
      let url = `audits?$select=createdon,_objectid_value&$filter=(action eq 64 or action eq 65) and createdon ge ${f} and createdon lt ${t}`;
      while (url) {
        requests++;
        const dL = await dvRequest("GET", url, null, { Prefer: "odata.maxpagesize=5000", ...NO_ANN });
        for (const a of (dL.value || [])) keep(a._objectid_value, a.createdon);
        const nl = dL["@odata.nextLink"];
        url = nl ? nl.replace(/^.*\/api\/data\/v[\d.]+\//, "") : null;
      }
    };
    await walk(Date.parse(params.from), Date.parse(params.to));
    result = { byUser: out, requests, scans };
    return result;
  },
  async getUserLastLogin(params) {
    let result;
    validateGuid(params.userId);
    const data = await dvRequest("GET",
      // 64 = User Access via Web, 65 = via Web Services (Excel / Outlook add-ins, Power BI,
      // flow connections): a web-services-only user showed "Never" and was offered for
      // license cleanup (audit finding)
      `audits?$select=createdon&$filter=_objectid_value eq ${params.userId} and (action eq 64 or action eq 65)&$top=1&$orderby=createdon desc`, null, NO_ANN
    );
    const rec = (data.value || [])[0];
    result = rec ? { date: rec.createdon } : null;
    return result;
  },
  async getAllRoles(params) {
    let result;
    // Get the root business unit first (roles with this BU are the "root" copies)
    let rootBuId = null;
    try {
      const buData = await dvRequest("GET", "businessunits?$select=businessunitid&$filter=parentbusinessunitid eq null&$top=1");
      rootBuId = (buData.value || [])[0]?.businessunitid;
    } catch {}

    // Fetch roles — if we have root BU, filter to only root copies (no duplicates)
    let allRaw = [];
    let rolesUrl = rootBuId
      ? `roles?$select=roleid,name,ismanaged,iscustomizable,_businessunitid_value,_parentrootroleid_value&$filter=_businessunitid_value eq ${rootBuId}&$orderby=name asc`
      : "roles?$select=roleid,name,ismanaged,iscustomizable,_businessunitid_value,_parentrootroleid_value&$orderby=name asc";
    while (rolesUrl) {
      const data = await dvRequest("GET", rolesUrl);
      allRaw = allRaw.concat(data.value || []);
      const rnl = data["@odata.nextLink"];
      if (rnl) {
        try { rolesUrl = rnl.replace(/^.*\/api\/data\/v[\d.]+\//, ""); } catch { rolesUrl = null; }
      } else { rolesUrl = null; }
    }

    // Deduplicate by root role ID (in case filter didn't work perfectly)
    const seen = new Set();
    const roles = [];
    for (const r of allRaw) {
      const rootId = r._parentrootroleid_value || r.roleid;
      if (seen.has(rootId)) continue;
      seen.add(rootId);
      roles.push({
        id: r.roleid,
        rootId,
        name: r.name,
        isManaged: r.ismanaged,
        isCustom: !r.ismanaged,
        buName: r["_businessunitid_value@OData.Community.Display.V1.FormattedValue"] || "",
      });
    }
    result = roles;
    return result;
  },
  async getPrivilegeCatalog(params) {
    let result;
    // Every privilege of the org, for the Security "Has privilege" picker.
    const cat = await ensurePrivCatalog();
    result = Object.entries(cat).map(([id, p]) => ({ id, name: p.name, accessRight: p.accessRight }));
    return result;
  },
  async getRolesWithPrivilege(params) {
    let result;
    // Which roles hold ONE privilege, and at what depth: a single query on the role ↔
    // privilege intersect table instead of opening every role. Rows cover every
    // business-unit copy of a role; the panel keeps the root copies it lists.
    if (!params.privilegeId) throw new Error("Missing privilegeId");
    validateGuid(params.privilegeId);
    let url = `roleprivilegescollection?$select=roleid,privilegedepthmask&$filter=privilegeid eq ${params.privilegeId}`;
    const rows = [];
    while (url) {
      const d = await dvRequest("GET", url, null, NO_ANN);
      for (const r of d.value || []) rows.push({ roleId: r.roleid, mask: r.privilegedepthmask });
      url = d["@odata.nextLink"] || null; // absolute — dvRequest checks it targets this org
    }
    result = rows;
    return result;
  },
  async getRoleGrants(params) {
    let result;
    // Every privilege grant of the given roles in ONE paged read of the role ↔ privilege
    // table (chunks of 50 role ids per URL) — the org-wide view used to open every role.
    const ids = [...new Set((params.roleIds || []).map(x => String(x || "").toLowerCase()))];
    ids.forEach(validateGuid);
    const rows = [];
    for (let i = 0; i < ids.length; i += 50) {
      const chunk = ids.slice(i, i + 50);
      let url = `roleprivilegescollection?$select=roleid,privilegeid,privilegedepthmask&$filter=${chunk.map(id => `roleid eq ${id}`).join(" or ")}`;
      while (url) {
        const d = await dvRequest("GET", url, null, { Prefer: "odata.maxpagesize=5000", ...NO_ANN });
        for (const r of d.value || []) rows.push({ roleId: r.roleid, privilegeId: r.privilegeid, mask: r.privilegedepthmask });
        url = d["@odata.nextLink"] || null; // absolute — dvRequest checks it targets this org
      }
    }
    result = rows;
    return result;
  },
  async getRolePrivileges(params) {
    let result;
    validateGuid(params.roleId);
    // Use RetrieveRolePrivilegesRole function to get privileges with depth
    const data = await dvRequest("GET",
      `RetrieveRolePrivilegesRole(RoleId=${params.roleId})`
    );
    const privs = data.RolePrivileges || [];
    if (privs.length === 0) { result = []; return result; }

    // The org's privilege catalog, loaded once per page (shared across role clicks)
    const privMap = await ensurePrivCatalog();

    const DEPTH_LABELS = { 1: "User", 2: "Business Unit", 4: "Parent: Child BU", 8: "Organization" };
    const DEPTH_MAP = { "Basic": 1, "Local": 2, "Deep": 4, "Global": 8 };
    result = privs.map(p => {
      const info = privMap[p.PrivilegeId] || {};
      const depth = typeof p.Depth === "string" ? (DEPTH_MAP[p.Depth] || 0) : (p.Depth || 0);
      return {
        id: p.PrivilegeId,
        name: info.name || p.PrivilegeId,
        accessRight: info.accessRight,
        depth,
        depthLabel: DEPTH_LABELS[depth] || `Depth ${depth}`,
        isOrg: depth === 8,
      };
    }).sort((a, b) => {
      if (a.isOrg !== b.isOrg) return a.isOrg ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return result;
  },
  async getRolePrivilegeMatrix(params) {
    let result;
    // Full CRUD-style privilege matrix for a role, like the make.powerapps role editor grid:
    // one row per table × the 8 access rights (Create/Read/Write/Delete/Append/AppendTo/
    // Assign/Share), each cell = the granted DEPTH (0 None · 1 User · 2 BU · 4 Parent:Child ·
    // 8 Org). Built from the FULL privilege catalog (so NOT-granted cells show as None) crossed
    // with the role's granted depths. Non-table (task-based) privileges go into `misc`.
    validateGuid(params.roleId);
    const rd = await dvRequest("GET", `RetrieveRolePrivilegesRole(RoleId=${params.roleId})`);
    const DEPTH_MAP_M = { "Basic": 1, "Local": 2, "Deep": 4, "Global": 8 };
    const grantedDepth = {};
    (rd.RolePrivileges || []).forEach(p => {
      const depth = typeof p.Depth === "string" ? (DEPTH_MAP_M[p.Depth] || 0) : (p.Depth || 0);
      grantedDepth[p.PrivilegeId] = depth;
    });
    const cat = await ensurePrivCatalog(); // name + accessright per privilege
    // AccessRights enum → operation. A privilege carries exactly one of these.
    const AR = { 1: "Read", 2: "Write", 4: "Append", 16: "AppendTo", 32: "Create", 65536: "Delete", 262144: "Share", 524288: "Assign" };
    const entities = {}; // { schemaName: { op: depth } }
    const misc = [];
    for (const pid in cat) {
      const nm = cat[pid].name || "";
      const op = AR[cat[pid].accessRight];
      const depth = grantedDepth[pid] || 0;
      // Entity privilege = accessright is a core op AND the name is prv<Op><EntitySchemaName>.
      const entity = (op && nm.startsWith("prv" + op)) ? nm.substring(3 + op.length) : null;
      if (op && entity) {
        (entities[entity] = entities[entity] || {})[op] = Math.max(entities[entity][op] || 0, depth);
      } else {
        misc.push({ id: pid, name: nm, depth });
      }
    }
    result = {
      entities: Object.keys(entities).sort((a, b) => a.localeCompare(b)).map(e => ({ entity: e, ops: entities[e] })),
      misc: misc.sort((a, b) => a.name.localeCompare(b.name)),
    };
    return result;
  },
  async getRoleUserCount(params) {
    let result;
    const nameC = String(params.roleName || "");
    if (!nameC) { result = { count: 0 }; return result; }
    result = { count: await countByFilter("systemusers", "systemuserid", `systemuserroles_association/any(o:o/name eq ${odataStr(nameC)})`) };
    return result;
  },
  async getRoleUsers(params) {
    let result;
    const nameU = String(params.roleName || "");
    if (!nameU) { result = []; return result; }
    const escU = odataStr(nameU);
    // Cap the fetch: a baseline role can be held by tens of thousands of users — paging all of
    // them is slow and risks a timeout. We stop once CAP distinct users are collected; the panel
    // already knows the true count and shows "first N of M". Caller may override (1..50000).
    const CAP = Math.min(Math.max(parseInt(params.cap, 10) || 10000, 1), 50000);
    const map = {};
    let url = `systemusers?$select=systemuserid,fullname,internalemailaddress,domainname,isdisabled,accessmode,_businessunitid_value,title,address1_telephone1,mobilephone,_parentsystemuserid_value&$filter=systemuserroles_association/any(o:o/name eq ${escU})&$orderby=fullname asc`;
    while (url) {
      const d = await dvRequest("GET", url);
      (d.value || []).forEach(u => {
        const k = String(u.systemuserid || "").toLowerCase();
        if (k && !map[k]) map[k] = {
          id: u.systemuserid,
          name: u.fullname || u.domainname || u.systemuserid,
          email: u.internalemailaddress || "",
          domain: u.domainname || "",
          disabled: !!u.isdisabled,
          accessMode: u["accessmode@OData.Community.Display.V1.FormattedValue"] || "",
          accessModeCode: u.accessmode,
          bu: u["_businessunitid_value@OData.Community.Display.V1.FormattedValue"] || "",
          title: u.title || "",
          manager: u["_parentsystemuserid_value@OData.Community.Display.V1.FormattedValue"] || "",
          phone: u.address1_telephone1 || "",
          mobile: u.mobilephone || "",
        };
      });
      const nl = d["@odata.nextLink"];
      url = (nl && Object.keys(map).length < CAP) ? nl.replace(/^.*\/api\/data\/v[\d.]+\//, "") : null;
    }
    result = Object.values(map).sort((a, b) => (a.name || "").localeCompare(b.name || "")).slice(0, CAP);
    return result;
  },
  async getRoleMemberIds(params) {
    let result;
    // Every direct holder of the role (ids only) across its business-unit copies, paged to
    // the end — no cap: Adoption's role scope is complete, or it isn't applied at all.
    const nameM = String(params.roleName || "");
    if (!nameM) { result = []; return result; }
    const idsM = new Set();
    let urlM = `systemusers?$select=systemuserid&$filter=systemuserroles_association/any(o:o/name eq ${odataStr(nameM)})`;
    while (urlM) {
      const dM = await dvRequest("GET", urlM, null, { Prefer: "odata.maxpagesize=5000", ...NO_ANN });
      (dM.value || []).forEach(u => { if (u.systemuserid) idsM.add(String(u.systemuserid).toLowerCase()); });
      const nlM = dM["@odata.nextLink"];
      urlM = nlM ? nlM.replace(/^.*\/api\/data\/v[\d.]+\//, "") : null;
    }
    result = [...idsM];
    return result;
  },
  async getRoleTeamCount(params) {
    let result;
    // How many TEAMS hold this role (users inherit the role through team membership — the
    // Users tab only lists direct assignments). Same by-NAME pattern as getRoleUserCount so
    // every business-unit copy of the role is covered in one query.
    const nameT = String(params.roleName || "");
    if (!nameT) { result = { count: 0 }; return result; }
    result = { count: await countByFilter("teams", "teamid", `teamroles_association/any(o:o/name eq ${odataStr(nameT)})`) };
    return result;
  },
  async getRoleTeams(params) {
    let result;
    // The teams holding this role (across every BU copy, deduplicated), with each team's
    // member count. Counts use the same JSON-safe $count=true trick as getRoleUserCount
    // (a raw /$count endpoint returns text/plain, which dvRequest doesn't parse) and are
    // capped to the first 50 teams — beyond that the count shows as unknown.
    const nameTs = String(params.roleName || "");
    if (!nameTs) { result = []; return result; }
    const escTs = odataStr(nameTs);
    const mapT = {};
    let urlT = `teams?$select=teamid,name,teamtype,description,_businessunitid_value,_administratorid_value&$filter=teamroles_association/any(o:o/name eq ${escTs})&$orderby=name asc`;
    while (urlT) {
      const dTs = await dvRequest("GET", urlT);
      (dTs.value || []).forEach(tm => {
        const k = String(tm.teamid || "").toLowerCase();
        if (k && !mapT[k]) mapT[k] = {
          id: tm.teamid,
          name: tm.name || tm.teamid,
          type: tm["teamtype@OData.Community.Display.V1.FormattedValue"] || String(tm.teamtype ?? ""),
          typeCode: tm.teamtype,
          bu: tm["_businessunitid_value@OData.Community.Display.V1.FormattedValue"] || "",
          admin: tm["_administratorid_value@OData.Community.Display.V1.FormattedValue"] || "",
          description: tm.description || "",
          memberCount: null,
        };
      });
      const nlT = dTs["@odata.nextLink"];
      urlT = nlT ? nlT.replace(/^.*\/api\/data\/v[\d.]+\//, "") : null;
    }
    const teamsList = Object.values(mapT).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    // Member counts: ONE aggregate per 50 teams on the membership table (it used to be one
    // $count request per team, sequential, capped to 50 teams and to 5,000 per count).
    for (let i = 0; i < teamsList.length; i += 50) {
      const sliceT = teamsList.slice(i, i + 50);
      const vals = sliceT.map(tm => `<value>${tm.id}</value>`).join("");
      const fxT = `<fetch aggregate="true"><entity name="teammembership"><attribute name="systemuserid" alias="n" aggregate="count"/><attribute name="teamid" alias="t" groupby="true"/><filter><condition attribute="teamid" operator="in">${vals}</condition></filter></entity></fetch>`;
      try {
        const dA = await dvRequest("GET", `teammemberships?fetchXml=${encodeURIComponent(fxT)}`, null, NO_ANN);
        const byTeam = {};
        (dA.value || []).forEach(r => { byTeam[String(r.t || "").toLowerCase()] = r.n ?? 0; });
        sliceT.forEach(tm => { tm.memberCount = byTeam[String(tm.id).toLowerCase()] ?? 0; });
      } catch {
        // the aggregate refused (50k scanned rows) — fall back to one exact count per team
        for (const tm of sliceT) {
          try { tm.memberCount = await countByFilter("systemusers", "systemuserid", `teammembership_association/any(o:o/teamid eq ${tm.id})`); } catch { tm.memberCount = null; }
        }
      }
    }
    result = teamsList;
    return result;
  },
  async moveUsersToBu(params) {
    let result;
    // Bulk re-parent users to another business unit — PATCH systemuser.businessunitid.
    // THE gotcha (surfaced in the UI before confirming): on orgs without the "retain
    // roles on BU change" setting, Dataverse REMOVES the user's security roles on the
    // move. Owned records get their owning BU recalculated server-side — heavy owners
    // take longer, hence the low concurrency. Per-user results — one failure never
    // aborts the batch; the server enforces write privileges on systemuser.
    validateGuid(params.buId);
    const idsM = Array.isArray(params.userIds) ? params.userIds : [];
    idsM.forEach(validateGuid);
    if (!idsM.length) { result = []; return result; }
    const outM = [];
    let idxM = 0;
    const workM = async () => {
      while (idxM < idsM.length) {
        const uid = idsM[idxM++];
        try {
          // the long budget: the server re-parents every owned record synchronously (minutes
          // for a heavy owner) and a 25 s timeout reported users as failed who HAD moved
          await dvRequest("PATCH", `systemusers(${uid})`, { "businessunitid@odata.bind": `/businessunits(${params.buId})` }, { "X-Colvio-Long": "1" });
          outM.push({ id: uid, ok: true });
        } catch (e) {
          const msgM = e?.message || String(e);
          if (/^Timeout:/.test(msgM)) {
            // reconcile: did the move land anyway?
            try {
              const chk = await dvRequest("GET", `systemusers(${uid})?$select=_businessunitid_value`, null, NO_ANN);
              if (String(chk._businessunitid_value || "").toLowerCase() === String(params.buId).toLowerCase()) { outM.push({ id: uid, ok: true, note: "moved (slow)" }); continue; }
            } catch { /* keep the timeout */ }
          }
          outM.push({ id: uid, ok: false, error: msgM.slice(0, 300) });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, idsM.length) }, () => workM()));
    result = outM;
    return result;
  },
  async assignRoleUsers(params) {
    let result;
    // Bulk assign/remove a security role to/from users — the N:N systemuserroles_association.
    // THE gotcha: a role exists as one copy PER BUSINESS UNIT, and you must associate the copy
    // living in the USER's BU (associating another BU's copy fails). So: resolve every copy of
    // the role (name → {buId: roleId}), fetch each target user's BU, then POST/DELETE the $ref
    // per user with the right copy. Per-user results — one failure never aborts the batch.
    // Server enforces prvAssignRole; Colvio adds nothing the caller isn't entitled to.
    const nameR = String(params.roleName || "").replace(/[\x00-\x1f\x7f]/g, "");
    const idsR = Array.isArray(params.userIds) ? params.userIds : [];
    const removing = params.mode === "remove";
    if (!nameR || !idsR.length) { result = []; return result; }
    idsR.forEach(validateGuid);
    const escRn = odataStr(nameR);
    const ctxA = d365Context || extractContext();
    const copies = await dvRequest("GET", `roles?$select=roleid,_businessunitid_value&$filter=name eq ${escRn}`);
    const copyIds = new Set((copies.value || []).map(r => String(r.roleid || "").toLowerCase()));
    const roleByBu = {};
    (copies.value || []).forEach(r => { roleByBu[String(r._businessunitid_value || "").toLowerCase()] = r.roleid; });
    const buByUser = {};
    for (let i = 0; i < idsR.length; i += 20) {
      const chunk = idsR.slice(i, i + 20);
      const f = chunk.map(u => `systemuserid eq ${u}`).join(" or ");
      const d = await dvRequest("GET", `systemusers?$select=systemuserid,_businessunitid_value&$filter=${f}`);
      (d.value || []).forEach(u => { buByUser[String(u.systemuserid).toLowerCase()] = String(u._businessunitid_value || "").toLowerCase(); });
    }
    const out = [];
    let idxR = 0;
    const workR = async () => {
      while (idxR < idsR.length) {
        const uid = idsR[idxR++];
        const bu = buByUser[uid.toLowerCase()];
        if (removing) {
          // Detach the copies the user ACTUALLY holds (a user moved between BUs, or an org
          // with cross-BU role assignment, holds another BU's copy): deleting the inferred
          // "copy in the user's BU" 404'd and was reported as "was not assigned" while the
          // user kept the role (audit finding).
          try {
            const held = await dvRequest("GET", `systemusers(${uid})/systemuserroles_association?$select=roleid`, null, NO_ANN);
            const mine = (held.value || []).map(r => String(r.roleid || "").toLowerCase()).filter(r => copyIds.has(r));
            if (!mine.length) { out.push({ id: uid, ok: true, note: "was not assigned" }); continue; }
            for (const rid of mine) await dvRequest("DELETE", `systemusers(${uid})/systemuserroles_association(${rid})/$ref`);
            out.push({ id: uid, ok: true });
          } catch (e) {
            out.push({ id: uid, ok: false, error: String(e.message || e).slice(0, 300) });
          }
          continue;
        }
        const rid = bu ? roleByBu[bu] : null;
        if (!rid) { out.push({ id: uid, ok: false, error: bu ? "No copy of this role in the user's business unit" : "User not found" }); continue; }
        try {
          await dvRequest("POST", `systemusers(${uid})/systemuserroles_association/$ref`, { "@odata.id": `${ctxA.clientUrl}/api/data/${ctxA.apiVersion}/roles(${rid})` });
          out.push({ id: uid, ok: true });
        } catch (e) {
          const msg = String(e.message || e);
          // Idempotence: assigning a role the user already has / removing one they don't
          // have are both no-ops in spirit — report them as OK with a note, not failures.
          if (!removing && /duplicate|already exist/i.test(msg)) out.push({ id: uid, ok: true, note: "already assigned" });
          else if (removing && /does not exist|not found|404/i.test(msg)) out.push({ id: uid, ok: true, note: "was not assigned" });
          else out.push({ id: uid, ok: false, error: msg });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, idsR.length) }, workR));
    result = out;
    return result;
  },
  async hasPrivilege(params) {
    let result;
    // Does the current user hold a named privilege (through any of their roles)?
    // Used to refine UI gating (e.g. prvPublishCustomization → Translations read-only).
    // Returns true/false, or null when it couldn't be determined (callers fail-open:
    // the server re-enforces anyway, and blocking UI on a probe error would frustrate).
    try {
      validateName(params.privilegeName, "privilegeName");
      const who = await dvRequest("GET", "WhoAmI");
      if (!who?.UserId) { result = null; return result; }
      const priv = await dvRequest("GET", `privileges?$select=privilegeid&$filter=name eq '${params.privilegeName}'`);
      const privId = priv?.value?.[0]?.privilegeid;
      if (!privId) { result = null; return result; }
      const up = await dvRequest("GET", `systemusers(${who.UserId})/Microsoft.Dynamics.CRM.RetrieveUserPrivileges()`);
      result = (up?.RolePrivileges || []).some(p => String(p.PrivilegeId || "").toLowerCase() === String(privId).toLowerCase());
    } catch { result = null; }
    return result;
  },
  async principalAccess(params) {
    let result;
    // The current user's access rights on ONE record (e.g. "ReadAccess,WriteAccess,...").
    // Lets the UI pre-check inline edit BEFORE the user types a value, instead of failing
    // on commit. Returns the rights string, or null when undetermined (callers fail-open).
    try {
      validateEntitySet(params.entitySet);
      validateGuid(params.id);
      const who = await dvRequest("GET", "WhoAmI");
      if (!who?.UserId) { result = null; return result; }
      const target = encodeURIComponent(JSON.stringify({ "@odata.id": `${params.entitySet}(${params.id})` }));
      const r = await dvRequest("GET", `systemusers(${who.UserId})/Microsoft.Dynamics.CRM.RetrievePrincipalAccess(Target=@tid)?@tid=${target}`);
      result = r?.AccessRights || null;
    } catch { result = null; }
    return result;
  },
  async isSystemAdmin(params) {
    let result;
    // Check if the current user has the System Administrator role.
    // The System Administrator role grants prvBypassCustomPlugins (among many others),
    // which is required to use MSCRM.BypassCustomPluginExecution + related bypass headers.
    // Match on the role-TEMPLATE id (627090ff-…, the fixed System Administrator template) so
    // this works regardless of UI language — a French org names the role "Administrateur
    // système", so the old name-only filter ('System Administrator') wrongly returned false.
    // (Name kept as an OR fallback for any org missing the template link.)
    // Returns false on any error (defensive — never block UI on permission check failure).
    try {
      const who = await dvRequest("GET", "WhoAmI");
      if (!who?.UserId) { result = false; return result; }
      const roles = await dvRequest(
        "GET",
        `systemusers(${who.UserId})/systemuserroles_association?$select=name&$filter=_roletemplateid_value eq 627090ff-40a3-4053-8790-584edc5be201 or name eq 'System Administrator'`
      );
      result = (roles?.value || []).length > 0;
    } catch {
      result = false;
    }
    return result;
  },
};
export default ACTIONS;
