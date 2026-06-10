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
  it("tab is decisive even when commas out-count it (Excel paste)", () => {
    expect(detectSep("Revenue, gross, net\tNotes")).toBe("\t");
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
  it("picklist: digit-prefixed label resolves via map, NOT truncated by parseInt", () =>
    expect(applyTransform("3 - Hot", "picklist", { "3 - hot": 100000003 })).toBe(100000003));
  it("picklist: digit-prefixed label with no map match → null (not 3)", () =>
    expect(applyTransform("3 - Hot", "picklist", { chaud: 1 })).toBeNull());
  it("date: US m/d/yyyy auto-swap when month>12", () =>
    expect(applyTransform("12/31/2026", "date_iso")).toBe("2026-12-31"));
  it("date: dd/mm/yyyy with 24h time → valid ISO at the right local time", () => {
    const r = applyTransform("13/06/2026 14:30", "date_iso");
    const d = new Date(r);
    expect(isNaN(d.getTime())).toBe(false);
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 5, 13, 14, 30]);
  });
  it("date: m/d/yyyy with AM/PM time → valid ISO", () => {
    const r = applyTransform("1/2/2026 3:45 PM", "date_iso");
    const d = new Date(r);
    expect(isNaN(d.getTime())).toBe(false);
    expect([d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([1, 1, 15, 45]); // Feb 1 (day-first), 15:45
  });
  it("date: unparseable time part → null, never invalid ISO", () =>
    expect(applyTransform("13/06/2026 not-a-time", "date_iso")).toBeNull());
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
