import { describe, it, expect } from "vitest";
import { userLookupFilter, pickUser, resolveUsers } from "../userResolve.js";

describe("userLookupFilter", () => {
  it("doubles the OData quote and leaves the rest raw (content.js encodes the whole filter once)", () => {
    expect(userLookupFilter(["a+b@x.com", "o'brien@x.com"])).toBe(
      "(internalemailaddress eq 'a+b@x.com' or domainname eq 'a+b@x.com') or (internalemailaddress eq 'o''brien@x.com' or domainname eq 'o''brien@x.com')"
    );
    expect(userLookupFilter(["r&d@x.com"])).not.toMatch(/%/);
  });
  it("empty input → empty filter", () => {
    expect(userLookupFilter([])).toBe("");
  });
});

const U = (id, extra = {}) => ({ id, email: `${id}@x.com`, upn: `corp\\${id}`, disabled: false, isApp: false, ...extra });

describe("pickUser", () => {
  it("one candidate wins; the enabled non-application user wins over stale copies", () => {
    expect(pickUser([U("a")]).id).toBe("a");
    expect(pickUser([U("old", { disabled: true }), U("new")]).id).toBe("new");
    expect(pickUser([U("app", { isApp: true }), U("person")]).id).toBe("person");
  });
  it("still several (or all disabled) → null, never a silent pick", () => {
    expect(pickUser([U("a"), U("b")])).toBeNull();
    expect(pickUser([U("a", { disabled: true }), U("b", { disabled: true })])).toBeNull();
    expect(pickUser([])).toBeNull();
  });
});

describe("resolveUsers", () => {
  it("matches email or UPN case-insensitively and reports ambiguous tokens with their count", () => {
    const users = [U("alice"), U("old", { email: "shared@x.com", disabled: true }), U("new", { email: "shared@x.com" }), U("p", { email: "twin@x.com" }), U("q", { email: "twin@x.com" })];
    const { byToken, ambiguous } = resolveUsers(users, ["Alice@X.com", "CORP\\alice", "shared@x.com", "twin@x.com", "nobody@x.com"]);
    expect(byToken.get("alice@x.com").id).toBe("alice");
    expect(byToken.get("corp\\alice").id).toBe("alice");
    expect(byToken.get("shared@x.com").id).toBe("new"); // disabled stale user loses, no "last match wins"
    expect(byToken.has("twin@x.com")).toBe(false);
    expect(ambiguous.get("twin@x.com")).toBe(2);
    expect(byToken.has("nobody@x.com")).toBe(false);
    expect(ambiguous.has("nobody@x.com")).toBe(false);
  });
  it("the same user returned by two chunks counts once", () => {
    const { byToken, ambiguous } = resolveUsers([U("a"), U("a")], ["a@x.com"]);
    expect(byToken.get("a@x.com").id).toBe("a");
    expect(ambiguous.size).toBe(0);
  });
});
