import { describe, it, expect } from "vitest";
import { parseDelimited, detectSep, applyTransform, resolveEntitySet } from "../loaderUtils.js";

describe("parseDelimited (RFC-4180)", () => {
  it("splits simple comma rows", () => {
    expect(parseDelimited("a,b,c\n1,2,3", ",")).toEqual([["a", "b", "c"], ["1", "2", "3"]]);
  });
  it("keeps a delimiter inside quotes", () => {
    expect(parseDelimited('name,city\n"Acme, Inc.",Paris', ",")).toEqual([
      ["name", "city"], ["Acme, Inc.", "Paris"],
    ]);
  });
  it("handles embedded newlines inside quotes", () => {
    expect(parseDelimited('a,b\n"line1\nline2",x', ",")).toEqual([
      ["a", "b"], ["line1\nline2", "x"],
    ]);
  });
  it("unescapes doubled quotes", () => {
    expect(parseDelimited('q\n"he said ""hi"""', ",")).toEqual([["q"], ['he said "hi"']]);
  });
  it("preserves leading zeros (no number coercion)", () => {
    expect(parseDelimited("code\n0001103775", ",")).toEqual([["code"], ["0001103775"]]);
  });
  it("supports tab delimiter", () => {
    expect(parseDelimited("a\tb\n1\t2", "\t")).toEqual([["a", "b"], ["1", "2"]]);
  });
  it("handles CRLF line endings", () => {
    expect(parseDelimited("a,b\r\n1,2\r\n", ",")).toEqual([["a", "b"], ["1", "2"]]);
  });
});

describe("detectSep", () => {
  it("detects comma", () => expect(detectSep("a,b,c\n1,2,3")).toBe(","));
  it("detects tab", () => expect(detectSep("a\tb\tc")).toBe("\t"));
  it("detects semicolon", () => expect(detectSep("a;b;c")).toBe(";"));
  it("ignores delimiters inside quotes when detecting", () => {
    expect(detectSep('"a,b,c,d";x')).toBe(";");
  });
});

describe("applyTransform", () => {
  it("blank → null", () => expect(applyTransform("", "")).toBeNull());
  it("int strips spaces", () => expect(applyTransform("1 000", "int")).toBe(1000));
  it("float: EU comma decimal", () => expect(applyTransform("1,5", "float")).toBe(1.5));
  it("float: EU thousands+decimal", () => expect(applyTransform("1.234,56", "float")).toBe(1234.56));
  it("float: US thousands", () => expect(applyTransform("1,234.56", "float")).toBe(1234.56));
  it("date: ISO date-only kept verbatim (no TZ shift)", () =>
    expect(applyTransform("2026-06-13", "date_iso")).toBe("2026-06-13"));
  it("date: dd/mm/yyyy → ISO", () =>
    expect(applyTransform("13/06/2026", "date_iso")).toBe("2026-06-13"));
  it("date: dd-mm-yyyy → ISO", () =>
    expect(applyTransform("01-02-2026", "date_iso")).toBe("2026-02-01"));
  it("statecode label", () => expect(applyTransform("Inactive", "statecode")).toBe(1));
  it("statecode FR label", () => expect(applyTransform("Actif", "statecode")).toBe(0));
  it("boolean_yesno FR", () => expect(applyTransform("oui", "boolean_yesno")).toBe(true));
  it("picklist numeric passthrough", () => expect(applyTransform("3", "picklist")).toBe(3));
  it("picklist label via optionMap", () =>
    expect(applyTransform("Chaud", "picklist", { chaud: 1 })).toBe(1));
  it("picklist unknown label → null (not silently wrong)", () =>
    expect(applyTransform("Unknown", "picklist", { chaud: 1 })).toBeNull());
  it("no transform → passthrough", () => expect(applyTransform("Acme", "")).toBe("Acme"));
});

describe("resolveEntitySet", () => {
  const entities = [
    { l: "account", p: "accounts" },
    { l: "opportunity", p: "opportunities" },
    { l: "systemuser", p: "systemusers" },
  ];
  it("uses metadata EntitySetName", () => expect(resolveEntitySet("account", entities)).toBe("accounts"));
  it("irregular plural from metadata", () =>
    expect(resolveEntitySet("opportunity", entities)).toBe("opportunities"));
  it("abstract owner → systemusers", () => expect(resolveEntitySet("owner", entities)).toBe("systemusers"));
  it("fallback +s when unknown", () => expect(resolveEntitySet("widget", entities)).toBe("widgets"));
  it("empty → empty", () => expect(resolveEntitySet("", entities)).toBe(""));
});
