import { describe, it, expect } from "vitest";
import { detectEnv, detectEnvFromUrl } from "../envDetect.js";

const URL_PROD = "https://salsadynamics.crm4.dynamics.com";

describe("detectEnv — Microsoft OrganizationType (authoritative path)", () => {
  it("USER-HIT: 'Secondary' means \"Production instances\" (MS docs) → PROD badge, confirmations ON", () => {
    const e = detectEnv(URL_PROD, "Secondary");
    expect(e).toMatchObject({ label: "PROD", isProduction: true, source: "api", rawType: "Secondary" });
  });
  it("'Customer' means \"Primary organization\" → PROD", () => {
    const e = detectEnv(URL_PROD, "Customer");
    expect(e).toMatchObject({ label: "PROD", isProduction: true });
  });
  it("'CustomerTest' means \"Sandbox instances\" → SANDBOX (was mislabeled UAT)", () => {
    const e = detectEnv(URL_PROD, "CustomerTest");
    expect(e).toMatchObject({ label: "SANDBOX", isProduction: false });
  });
  it("trial family (TestDrive / EmailTrial / Trial) → TRIAL, non-prod", () => {
    for (const t2 of ["TestDrive", "EmailTrial", "Trial"]) {
      expect(detectEnv(URL_PROD, t2)).toMatchObject({ label: "TRIAL", isProduction: false });
    }
  });
  it("'Developer' → DEV non-prod; 'Support'/'MsftInvestigation' → SUPPORT non-prod", () => {
    expect(detectEnv(URL_PROD, "Developer")).toMatchObject({ label: "DEV", isProduction: false });
    expect(detectEnv(URL_PROD, "Support")).toMatchObject({ label: "SUPPORT", isProduction: false });
    expect(detectEnv(URL_PROD, "MsftInvestigation")).toMatchObject({ label: "SUPPORT", isProduction: false });
  });
  it("'Default' (the tenant's shared default env) holds real data → treated as production", () => {
    expect(detectEnv(URL_PROD, "Default")).toMatchObject({ label: "DEFAULT", isProduction: true });
  });
  it("SAFETY: an UNKNOWN enum value fails CLOSED — badge shows the raw name, isProduction true", () => {
    const e = detectEnv(URL_PROD, "SomeFutureType");
    expect(e).toMatchObject({ label: "SOMEFUTURETYPE", isProduction: true, source: "api", rawType: "SomeFutureType" });
  });
  it("SAFETY: the old bug class — no member of the map may rely on a name absent from MS's enum", () => {
    // "Production" and "Sandbox" are NOT documented members; if the API ever sent them anyway,
    // the unknown branch must still keep confirmations armed.
    expect(detectEnv(URL_PROD, "Production").isProduction).toBe(true);
    expect(detectEnv(URL_PROD, "Sandbox").isProduction).toBe(true);
  });
});

describe("detectEnv — URL heuristic fallback (no organizationType)", () => {
  it("falls back to hostname patterns, flagged as url-heuristic", () => {
    const e = detectEnv("https://contoso-sandbox.crm4.dynamics.com", null);
    expect(e).toMatchObject({ label: "SANDBOX", isProduction: false, source: "url-heuristic" });
  });
  it("a plain hostname is presumed PROD (fail-closed)", () => {
    const e = detectEnv(URL_PROD, null);
    expect(e).toMatchObject({ label: "PROD", isProduction: true, source: "url-heuristic" });
  });
  it("detectEnvFromUrl: no URL / unparsable URL → PROD", () => {
    expect(detectEnvFromUrl(null)).toMatchObject({ label: "PROD", isProduction: true });
    expect(detectEnvFromUrl("::not a url::")).toMatchObject({ label: "PROD", isProduction: true });
  });
  it("detectEnvFromUrl: indicators need -/. boundaries — 'latest' must not match 'test'", () => {
    expect(detectEnvFromUrl("https://latest-news.crm4.dynamics.com").isProduction).toBe(true);
    expect(detectEnvFromUrl("https://contoso-test.crm4.dynamics.com")).toMatchObject({ label: "TEST", isProduction: false });
  });
});
