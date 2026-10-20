import { describe, it, expect } from "vitest";
import { decodeContent, encodeContent, byteSize, publishXmlFor, filterResources, searchContents, offsetOfLine, isTextType, typeLabel } from "../webResources.js";

describe("content round trip", () => {
  it("decodes and re-encodes UTF-8 text, keeping a BOM", () => {
    const src = "// été — 漢字\nvar x = 1;";
    const b64 = encodeContent(src);
    expect(decodeContent(b64)).toEqual({ text: src, bom: false });
    const withBom = encodeContent(src, true);
    expect(decodeContent(withBom)).toEqual({ text: src, bom: true });
    expect(atob(withBom).charCodeAt(0)).toBe(0xef);
    expect(decodeContent("")).toEqual({ text: "", bom: false });
    expect(byteSize(encodeContent("abcd"))).toBe(4);
    expect(byteSize(encodeContent("abcde"))).toBe(5);
  });
  it("handles a big text", () => {
    const big = "x".repeat(200000) + "é";
    expect(decodeContent(encodeContent(big)).text).toBe(big);
  });
});

describe("types, publish, list", () => {
  it("knows the types", () => {
    expect(isTextType(3)).toBe(true);
    expect(isTextType(5)).toBe(false);
    expect(typeLabel(11)).toBe("SVG");
  });
  it("publishes only real ids", () => {
    expect(publishXmlFor(["00000000-0000-4000-8000-000000000001", "x"])).toBe("<importexportxml><webresources><webresource>{00000000-0000-4000-8000-000000000001}</webresource></webresources></importexportxml>");
    expect(() => publishXmlFor(["nope"])).toThrow();
  });
  it("filters by name, type, system", () => {
    const list = [{ name: "new_/scripts/account.js", type: 3 }, { name: "msdyn_/x.js", type: 3 }, { name: "new_/css/a.css", type: 2, displayName: "Theme" }, { name: "new_/hidden.js", type: 3, hidden: true }];
    expect(filterResources(list).map(r => r.name)).toEqual(["new_/scripts/account.js", "new_/css/a.css"]);
    expect(filterResources(list, { type: 3, showSystem: true }).length).toBe(3);
    expect(filterResources(list, { search: "theme" }).map(r => r.type)).toEqual([2]);
  });
});

describe("search in contents", () => {
  const items = [{ id: "a", name: "account.js", text: "function onLoad(ctx) {\n  var v = formContext.getAttribute(\"new_sapid\").getValue();\n  // fullname here\n}" }, { id: "b", name: "other.js", text: "NEW_SAPID" }];
  it("finds every line, case-insensitive by default", () => {
    const r = searchContents(items, "new_sapid");
    expect(r.map(x => [x.name, x.line])).toEqual([["account.js", 2], ["other.js", 1]]);
    expect(r[0].col).toBe(37);
    expect(r[0].preview).toContain('getAttribute("new_sapid")');
    expect(searchContents(items, "new_sapid", { caseSensitive: true }).length).toBe(1);
  });
  it("whole word skips longer names", () => {
    expect(searchContents(items, "name").length).toBe(1);
    expect(searchContents(items, "name", { wholeWord: true }).length).toBe(0);
    expect(searchContents(items, "", {})).toEqual([]);
  });
  it("finds a line's offset", () => {
    expect(offsetOfLine("a\nbb\nccc", 3)).toBe(5);
    expect(offsetOfLine("a", 9)).toBe(1);
  });
});
