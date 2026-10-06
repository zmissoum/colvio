import { describe, it, expect } from "vitest";
import { recordId } from "../shared.jsx";

const G1 = "11111111-1111-1111-1111-111111111111";
const G2 = "22222222-2222-2222-2222-222222222222";

describe("recordId", () => {
  it("uses the table's primary key when it is known (usersettings → systemuserid)", () => {
    expect(recordId({ businessunitid: G2, systemuserid: G1 }, "usersettings", "systemuserid")).toBe(G1);
  });
  it("never guesses another GUID column when the known key is missing from the row", () => {
    expect(recordId({ businessunitid: G2, processid: G1 }, "usersettings", "systemuserid")).toBeNull();
  });
  it("keeps the <table>id rule and the GUID heuristic when the key is unknown", () => {
    expect(recordId({ accountid: G1, processid: G2 }, "account")).toBe(G1);
    expect(recordId({ name: "x", activityid: G1 }, "email")).toBe(G1);
    expect(recordId(null, "account")).toBeNull();
  });
});
