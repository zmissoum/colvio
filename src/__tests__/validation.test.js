import { describe, it, expect } from "vitest";

// Re-implement the validation functions from content.js for testing
// (content.js is an IIFE that can't be imported directly)
const SAFE_NAME = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const SAFE_GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateName(v, label = "name") {
  if (!v || !SAFE_NAME.test(v)) throw new Error(`Invalid ${label}: "${v}". Only alphanumeric and underscores allowed.`);
  return v;
}

function validateEntitySet(v) {
  if (!v) throw new Error("Missing entitySet");
  if (v.startsWith("http")) return v;
  const baseName = v.split(/[(?/$]/)[0];
  if (!baseName || !SAFE_NAME.test(baseName)) throw new Error(`Invalid entitySet: "${v}"`);
  return v;
}

function validateGuid(v) {
  if (v && !SAFE_GUID.test(v)) throw new Error(`Invalid GUID format: "${v}"`);
  return v;
}

function sanitizeSearchTerm(v) {
  if (typeof v !== "string") return "";
  return v.replace(/[\x00-\x1f]/g, "").substring(0, 100).replace(/'/g, "''");
}

// ── validateName ──────────────────────────────────────────────
describe("validateName", () => {
  it("accepts valid entity names", () => {
    expect(validateName("account")).toBe("account");
    expect(validateName("contact")).toBe("contact");
    expect(validateName("new_customentity")).toBe("new_customentity");
    expect(validateName("msdyn_salesorder")).toBe("msdyn_salesorder");
    expect(validateName("Account")).toBe("Account");
    expect(validateName("_private")).toBe("_private");
  });

  it("accepts valid field names", () => {
    expect(validateName("name")).toBe("name");
    expect(validateName("emailaddress1")).toBe("emailaddress1");
    expect(validateName("address1_city")).toBe("address1_city");
    expect(validateName("new_sapid")).toBe("new_sapid");
    expect(validateName("statecode")).toBe("statecode");
  });

  it("rejects empty/null", () => {
    expect(() => validateName("")).toThrow();
    expect(() => validateName(null)).toThrow();
    expect(() => validateName(undefined)).toThrow();
  });

  it("rejects OData injection attempts", () => {
    expect(() => validateName("account;DROP")).toThrow();
    expect(() => validateName("account' OR 1=1")).toThrow();
    expect(() => validateName("../../../etc/passwd")).toThrow();
    expect(() => validateName("account?$select=name")).toThrow();
    expect(() => validateName("account(123)")).toThrow();
  });

  it("rejects names with spaces", () => {
    expect(() => validateName("account name")).toThrow();
    expect(() => validateName(" account")).toThrow();
  });

  it("rejects names starting with numbers", () => {
    expect(() => validateName("123account")).toThrow();
    expect(() => validateName("1name")).toThrow();
  });

  it("rejects special characters", () => {
    expect(() => validateName("account$")).toThrow();
    expect(() => validateName("account@")).toThrow();
    expect(() => validateName("account-name")).toThrow();
    expect(() => validateName("account.name")).toThrow();
  });
});

// ── validateEntitySet ─────────────────────────────────────────
describe("validateEntitySet", () => {
  it("accepts valid entity set names", () => {
    expect(validateEntitySet("accounts")).toBe("accounts");
    expect(validateEntitySet("contacts")).toBe("contacts");
    expect(validateEntitySet("systemusers")).toBe("systemusers");
  });

  it("accepts entity set with query params", () => {
    expect(validateEntitySet("accounts?$select=name")).toBe("accounts?$select=name");
    expect(validateEntitySet("contacts?$top=10&$filter=name eq 'test'")).toBe("contacts?$top=10&$filter=name eq 'test'");
  });

  it("accepts entity set with parentheses (single record)", () => {
    expect(validateEntitySet("accounts(12345678-1234-1234-1234-123456789012)")).toContain("accounts");
  });

  it("accepts full URLs (nextLink)", () => {
    const url = "https://org.crm.dynamics.com/api/data/v9.2/accounts?$skiptoken=123";
    expect(validateEntitySet(url)).toBe(url);
  });

  it("rejects empty/null", () => {
    expect(() => validateEntitySet("")).toThrow();
    expect(() => validateEntitySet(null)).toThrow();
  });

  it("rejects injection attempts", () => {
    expect(() => validateEntitySet("../accounts")).toThrow();
    expect(() => validateEntitySet("acco;DROP")).toThrow();
  });
});

// ── validateGuid ──────────────────────────────────────────────
describe("validateGuid", () => {
  it("accepts valid GUIDs", () => {
    expect(validateGuid("12345678-1234-1234-1234-123456789012")).toBe("12345678-1234-1234-1234-123456789012");
    expect(validateGuid("abcdef01-2345-6789-abcd-ef0123456789")).toBe("abcdef01-2345-6789-abcd-ef0123456789");
    expect(validateGuid("ABCDEF01-2345-6789-ABCD-EF0123456789")).toBe("ABCDEF01-2345-6789-ABCD-EF0123456789");
  });

  it("accepts null/undefined (optional parameter)", () => {
    expect(validateGuid(null)).toBeNull();
    expect(validateGuid(undefined)).toBeUndefined();
  });

  it("rejects invalid GUIDs", () => {
    expect(() => validateGuid("not-a-guid")).toThrow();
    expect(() => validateGuid("12345678-1234-1234-1234")).toThrow();
    expect(() => validateGuid("12345678-1234-1234-1234-12345678901")).toThrow(); // too short
    expect(() => validateGuid("12345678-1234-1234-1234-1234567890123")).toThrow(); // too long
    expect(() => validateGuid("1234567g-1234-1234-1234-123456789012")).toThrow(); // invalid char
  });

  it("rejects injection attempts", () => {
    expect(() => validateGuid("12345678-1234-1234-1234-123456789012' OR 1=1")).toThrow();
    expect(() => validateGuid("12345678-1234-1234-1234-123456789012;DROP")).toThrow();
  });
});

// ── sanitizeSearchTerm ────────────────────────────────────────
describe("sanitizeSearchTerm", () => {
  it("returns normal strings unchanged", () => {
    expect(sanitizeSearchTerm("hello")).toBe("hello");
    expect(sanitizeSearchTerm("Dynamics 365")).toBe("Dynamics 365");
    expect(sanitizeSearchTerm("test@email.com")).toBe("test@email.com");
  });

  it("escapes single quotes", () => {
    expect(sanitizeSearchTerm("O'Brien")).toBe("O''Brien");
    expect(sanitizeSearchTerm("it's")).toBe("it''s");
  });

  it("strips control characters", () => {
    expect(sanitizeSearchTerm("hello\x00world")).toBe("helloworld");
    expect(sanitizeSearchTerm("test\x0Avalue")).toBe("testvalue");
    expect(sanitizeSearchTerm("\x01\x02\x03")).toBe("");
  });

  it("truncates to 100 characters", () => {
    const long = "a".repeat(200);
    expect(sanitizeSearchTerm(long).length).toBe(100);
  });

  it("handles non-string inputs", () => {
    expect(sanitizeSearchTerm(null)).toBe("");
    expect(sanitizeSearchTerm(undefined)).toBe("");
    expect(sanitizeSearchTerm(123)).toBe("");
    expect(sanitizeSearchTerm({})).toBe("");
  });

  it("handles empty string", () => {
    expect(sanitizeSearchTerm("")).toBe("");
  });
});

// ── CSV formula injection protection ──────────────────────────
describe("CSV formula injection", () => {
  // Re-implement the protection logic
  function sanitizeCsvValue(v) {
    if (typeof v !== "string") return v;
    if (/^[=+\-@]/.test(v)) return "'" + v;
    return v;
  }

  it("prefixes formula-triggering characters", () => {
    expect(sanitizeCsvValue("=SUM(A1:A10)")).toBe("'=SUM(A1:A10)");
    expect(sanitizeCsvValue("+cmd|'/C calc'")).toBe("'+cmd|'/C calc'");
    expect(sanitizeCsvValue("-1+1")).toBe("'-1+1");
    expect(sanitizeCsvValue("@SUM(A1)")).toBe("'@SUM(A1)");
  });

  it("leaves normal values unchanged", () => {
    expect(sanitizeCsvValue("hello")).toBe("hello");
    expect(sanitizeCsvValue("123")).toBe("123");
    expect(sanitizeCsvValue("test@email.com")).toBe("test@email.com"); // @ not at start
  });

  it("handles non-string values", () => {
    expect(sanitizeCsvValue(123)).toBe(123);
    expect(sanitizeCsvValue(null)).toBeNull();
    expect(sanitizeCsvValue(true)).toBe(true);
  });
});
