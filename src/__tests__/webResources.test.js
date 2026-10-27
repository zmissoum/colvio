import { describe, it, expect } from "vitest";
import { decodeContent, encodeContent, byteSize, publishXmlFor, filterResources, searchContents, offsetOfLine, isTextType, typeLabel, changedSince, changedMessage } from "../webResources.js";
import { demoWebResources, demoWebResourceContents, demoUpdateWebResource } from "../webResourcesDemo.js";

describe("content round trip", () => {
  it("decodes and re-encodes UTF-8 text, keeping a BOM", () => {
    const src = "// été — 漢字\nvar x = 1;";
    const b64 = encodeContent(src);
    expect(decodeContent(b64)).toEqual({ text: src, bom: false, encoding: "utf-8" });
    const withBom = encodeContent(src, true);
    expect(decodeContent(withBom)).toEqual({ text: src, bom: true, encoding: "utf-8" });
    expect(atob(withBom).charCodeAt(0)).toBe(0xef);
    expect(decodeContent("")).toEqual({ text: "", bom: false, encoding: "utf-8" });
    const u16 = btoa(String.fromCharCode(0xff, 0xfe, 0x68, 0x00, 0x69, 0x00));
    expect(decodeContent(u16)).toMatchObject({ text: "hi", encoding: "utf-16le" });
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

describe("changed on the server since it was opened", () => {
  it("compares stamps as instants — the same moment in two spellings is not a change", () => {
    expect(changedSince("2024-05-01T10:00:00Z", "2024-05-01T10:00:00.000Z")).toBe(false);
    expect(changedSince("2024-05-01T10:00:00Z", "2024-05-01T10:00:01Z")).toBe(true);
    expect(changedSince("2024-05-01T10:00:01Z", "2024-05-01T10:00:00Z")).toBe(true); // older on the server still means "not what you opened"
  });
  it("a missing or unreadable stamp never blocks a save; two unreadable stamps compare as text", () => {
    expect(changedSince("", "2024-05-01T10:00:00Z")).toBe(false);
    expect(changedSince("2024-05-01T10:00:00Z", undefined)).toBe(false);
    expect(changedSince("v1", "v1")).toBe(false);
    expect(changedSince("v1", "v2")).toBe(true);
  });
  it("names who changed it and when, and degrades when the server says neither", () => {
    const m = changedMessage("new_/scripts/account.js", { modifiedOn: "2024-05-01T10:00:00Z", modifiedBy: "Alex Baker" });
    expect(m).toMatch(/^new_\/scripts\/account\.js changed on the server since you opened it \(by Alex Baker at \d{1,2}:\d{2}( [AP]M)?\) — reload to see the current version\.$/);
    expect(changedMessage("x.js", { modifiedOn: "", modifiedBy: "" })).toBe("x.js changed on the server since you opened it — reload to see the current version.");
    expect(changedMessage("x.js", { modifiedBy: "Alex" })).toContain("(by Alex)");
  });
});

describe("web resources - a save is conditional on the ETag opened (demo org, like Dataverse's 412)", () => {
  it("a stale ETag is refused, a fresh one saves and the ETag moves on, no ETag overwrites", () => {
    const id = demoWebResources()[0].id;
    const [c] = demoWebResourceContents([id]);
    expect(c.etag).toMatch(/^W\/"\d+"$/);
    const w = demoUpdateWebResource(id, "YQ==", c.etag);
    expect(w.ok).toBe(true); expect(w.etag).not.toBe(c.etag); expect(w.modifiedBy).toBe("You");
    expect(() => demoUpdateWebResource(id, "Yg==", c.etag)).toThrow(/CHANGED_ON_SERVER/);
    expect(demoWebResourceContents([id])[0].content).toBe("YQ==");
    expect(demoUpdateWebResource(id, "Yw==", null).ok).toBe(true); // overwrite
    expect(demoWebResourceContents([id])[0]).toMatchObject({ content: "Yw==", etag: `W/"3"` });
  });
});
