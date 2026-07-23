import { describe, it, expect } from "vitest";
import { effectiveValue, validateEnvValue, envTypeLabel } from "../envVarUtils.js";

describe("effectiveValue", () => {
  it("override wins, then default, then none", () => {
    expect(effectiveValue({ value: "prod-url", defaultValue: "dev-url" })).toEqual({ value: "prod-url", source: "override" });
    expect(effectiveValue({ value: null, defaultValue: "dev-url" })).toEqual({ value: "dev-url", source: "default" });
    expect(effectiveValue({ value: "", defaultValue: "" })).toEqual({ value: null, source: "none" });
  });
});

describe("validateEnvValue", () => {
  it("booleans are the strings yes/no (documented convention)", () => {
    expect(validateEnvValue(100000002, "yes").ok).toBe(true);
    expect(validateEnvValue(100000002, "No").ok).toBe(true);
    expect(validateEnvValue(100000002, "true").ok).toBe(false);
  });
  it("numbers must be finite, JSON must parse (data sources too)", () => {
    expect(validateEnvValue(100000001, "3.14").ok).toBe(true);
    expect(validateEnvValue(100000001, "abc").ok).toBe(false);
    expect(validateEnvValue(100000003, '{"a":1}').ok).toBe(true);
    expect(validateEnvValue(100000003, "{oops").ok).toBe(false);
    expect(validateEnvValue(100000004, '{"c":"x"}').ok).toBe(true);
  });
  it("empty is rejected with a pointer to Clear override; strings pass", () => {
    expect(validateEnvValue(100000000, "  ").ok).toBe(false);
    expect(validateEnvValue(100000000, "hello").ok).toBe(true);
  });
  it("type labels resolve with API label priority", () => {
    expect(envTypeLabel(100000002)).toBe("Boolean");
    expect(envTypeLabel(100000005, "Secret (localized)")).toBe("Secret (localized)");
    expect(envTypeLabel(999)).toBe("Type 999");
  });
});
