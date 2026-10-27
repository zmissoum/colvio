import { describe, it, expect } from "vitest";
import { isTrulyCustom } from "../shared.jsx";

describe("isTrulyCustom", () => {
  it("accepts publisher prefixes with digits (the Power Apps default publisher is cr + hex)", () => {
    for (const n of ["new_sapid", "cr123_field", "cr4d2_invoice", "foe_x", "colvio_y"]) expect(isTrulyCustom(n)).toBe(true);
  });
  it("rejects Microsoft prefixes and plain system names", () => {
    for (const n of ["msdyn_workorder", "adx_webpage", "mspp_site", "account", "statecode", "address1_city", "address2_line1"]) expect(isTrulyCustom(n)).toBe(false);
  });
  it("needs a letter first and a prefix of 2+ characters", () => {
    for (const n of ["1abc_x", "a_x", "_x"]) expect(isTrulyCustom(n)).toBe(false);
  });
  it("ignores the managed flag — a customer's tables are managed on every production org", () => {
    expect(isTrulyCustom("new_invoice")).toBe(true); // a managed customer table is still custom
    expect(isTrulyCustom("msdyn_workorder", false)).toBe(false);
    expect(isTrulyCustom(undefined)).toBe(false);
  });
});
