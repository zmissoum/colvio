// Environment-type detection — PURE, unit-tested.
//
// Source of truth: the OrganizationType returned by RetrieveCurrentOrganization. The map below
// is built on Microsoft's DOCUMENTED enum (learn.microsoft.com — Web API OrganizationType
// EnumType), not on guessed names: the enum has NO "Production" or "Sandbox" member. In
// Microsoft's own words, `Customer` (0) = "Primary organization" and `Secondary` (4) =
// "Production instances" — a customer's PROD org reports one of THOSE. The previous inline map
// keyed on "Production"/"Sandbox" matched neither, so every real prod fell into the unknown
// branch as isProduction:false and silently disarmed all production confirmations (user-hit:
// a PROD env badged "SECONDARY" in green).
//
// Safety rule pinned by tests: anything not explicitly documented as sandbox/trial/dev/preview/
// support is treated as PRODUCTION (fail-closed) — an unknown or future enum value must cost an
// extra confirmation click, never silence one.
const ORG_TYPE_MAP = {
  Customer:          { label: "PROD",        isProduction: true  }, // "Primary organization"
  Secondary:         { label: "PROD",        isProduction: true  }, // "Production instances"
  Monitoring:        { label: "MONITORING",  isProduction: true  }, // internal — unknowable, stay closed
  Support:           { label: "SUPPORT",     isProduction: false }, // support instance, not the live org
  MsftInvestigation: { label: "SUPPORT",     isProduction: false }, // "Support Instance"
  BackEnd:           { label: "BACKEND",     isProduction: true  }, // backend-provisioned — stay closed
  CustomerTest:      { label: "SANDBOX",     isProduction: false }, // "Sandbox instances" (admin-center Sandbox type)
  CustomerFreeTest:  { label: "SANDBOX",     isProduction: false }, // sandbox outside the sandbox quota
  CustomerPreview:   { label: "PREVIEW",     isProduction: false }, // release-preview program
  Placeholder:       { label: "PLACEHOLDER", isProduction: true  }, // not assigned to a customer — stay closed
  TestDrive:         { label: "TRIAL",       isProduction: false },
  EmailTrial:        { label: "TRIAL",       isProduction: false },
  Trial:             { label: "TRIAL",       isProduction: false },
  Developer:         { label: "DEV",         isProduction: false },
  Default:           { label: "DEFAULT",     isProduction: true  }, // the tenant's shared default env holds REAL data
  Teams:             { label: "TEAMS",       isProduction: true  }, // Dataverse for Teams runs live apps
  Platform:          { label: "PLATFORM",    isProduction: true  }, // "internal use only" — stay closed
};

// Fallback: detect the environment type from the D365 URL hostname.
// Used only when RetrieveCurrentOrganization isn't available (older versions, restricted perms).
// Matches common non-prod indicators surrounded by - or . word-boundaries.
export function detectEnvFromUrl(url) {
  if (!url) return { isProduction: true, label: "PROD" };
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    const patterns = [
      { re: /(?:^|[-.])(sandbox)(?:[-.]|$)/, label: "SANDBOX" },
      { re: /(?:^|[-.])(dev|develop|development)(?:[-.]|$)/, label: "DEV" },
      { re: /(?:^|[-.])(test|tst)(?:[-.]|$)/, label: "TEST" },
      { re: /(?:^|[-.])(uat)(?:[-.]|$)/, label: "UAT" },
      { re: /(?:^|[-.])(qa|qual|quality)(?:[-.]|$)/, label: "QA" },
      { re: /(?:^|[-.])(staging|stg|stage)(?:[-.]|$)/, label: "STAGING" },
      { re: /(?:^|[-.])(preprod|pre-prod|preproduction)(?:[-.]|$)/, label: "PREPROD" },
      { re: /(?:^|[-.])(recette|rec)(?:[-.]|$)/, label: "RECETTE" },
      { re: /(?:^|[-.])(demo)(?:[-.]|$)/, label: "DEMO" },
      { re: /(?:^|[-.])(training|train|formation)(?:[-.]|$)/, label: "TRAINING" },
      { re: /(?:^|[-.])(sit)(?:[-.]|$)/, label: "SIT" },
      { re: /(?:^|[-.])(trial)(?:[-.]|$)/, label: "TRIAL" },
      { re: /(?:^|[-.])(preview)(?:[-.]|$)/, label: "PREVIEW" },
      { re: /(?:^|[-.])(hotfix|patch)(?:[-.]|$)/, label: "HOTFIX" },
    ];
    for (const p of patterns) {
      if (p.re.test(hostname)) return { isProduction: false, label: p.label };
    }
    return { isProduction: true, label: "PROD" };
  } catch {
    return { isProduction: true, label: "PROD" };
  }
}

// Resolve env using the most reliable signal available:
// 1. Microsoft's OrganizationType (authoritative, from RetrieveCurrentOrganization)
// 2. URL heuristic (fallback for older D365 / restricted perms)
// An unknown API value surfaces its raw name in the badge but is presumed PRODUCTION.
export function detectEnv(orgUrl, organizationType) {
  if (organizationType && ORG_TYPE_MAP[organizationType]) {
    const m = ORG_TYPE_MAP[organizationType];
    return { ...m, source: "api", rawType: organizationType };
  }
  if (organizationType) {
    // Unknown enum value — show it (so new MS env types get noticed) but FAIL CLOSED:
    // the old `isProduction: type === "Production"` compared against a name that doesn't
    // exist in the enum, silencing prod confirmations on the very orgs that needed them.
    return { label: String(organizationType).toUpperCase(), isProduction: true, source: "api", rawType: organizationType };
  }
  return { ...detectEnvFromUrl(orgUrl), source: "url-heuristic" };
}
