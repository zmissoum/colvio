import { describe, it, expect, vi } from "vitest";

// TranslationManager.jsx is a React component module: its UI imports are stubbed so the pure CSV
// parser it exports can be tested on its own (the bridge touches chrome.* at load, shared.jsx the DOM).
vi.mock("../d365-bridge.js", () => ({ bridge: {} }));
vi.mock("../shared.jsx", () => ({ C: {}, I: {}, Spin: () => null, ENTS: [], mono: {}, displayType: (x) => x, inp: () => ({}), bt: () => ({}), crd: () => ({}), ths: () => ({}), tds: {}, exportTable: () => {}, confirmProd: () => true }));
import { parseTranslationCsv } from "../components/TranslationManager.jsx";

describe("parseTranslationCsv — the Export CSV file, back", () => {
  it("reads the comma file (quoted cells with commas, doubled quotes, CRLF)", () => {
    const r = parseTranslationCsv('logical_name,type,label_1033,label_1036\r\nname,String,"Account, name","Nom ""du"" compte"\r\n');
    expect(r.error).toBeUndefined();
    expect(r.sep).toBe(",");
    expect(r.logIdx).toBe(0);
    expect(r.langCols).toEqual([{ idx: 2, code: 1033 }, { idx: 3, code: 1036 }]);
    expect(r.rows).toEqual([["name", "String", "Account, name", 'Nom "du" compte']]);
  });

  it("accepts a semicolon re-save (French Excel) and a tab file (Unicode Text)", () => {
    const semi = parseTranslationCsv("logical_name;type;label_1036\nname;String;Nom\ntelephone1;String;Téléphone, fixe\n");
    expect(semi.sep).toBe(";");
    expect(semi.langCols).toEqual([{ idx: 2, code: 1036 }]);
    expect(semi.rows).toEqual([["name", "String", "Nom"], ["telephone1", "String", "Téléphone, fixe"]]);
    const tab = parseTranslationCsv("logical_name\ttype\tlabel_1033\nname\tString\tName; full\n");
    expect(tab.sep).toBe("\t");
    expect(tab.rows).toEqual([["name", "String", "Name; full"]]);
  });

  it("says what is wrong instead of doing nothing", () => {
    const noLog = parseTranslationCsv("Name,Label\nfoo,bar\n");
    expect(noLog.error).toMatch(/no "logical_name" column/);
    expect(noLog.error).toMatch(/Name, Label/);
    expect(parseTranslationCsv("logical_name,type\nname,String\n").error).toMatch(/no label_/);
    expect(parseTranslationCsv("logical_name,type,label_1033\n").error).toMatch(/no rows/);
    expect(parseTranslationCsv("").error).toMatch(/empty/);
    expect(parseTranslationCsv("\n\n").error).toMatch(/empty/);
  });

  it("a quoted header still finds the columns; blank lines between rows are skipped", () => {
    const r = parseTranslationCsv('"logical_name","type","label_1033"\n\n"name","String","Name"\n\n');
    expect(r.logIdx).toBe(0);
    expect(r.langCols).toEqual([{ idx: 2, code: 1033 }]);
    expect(r.rows).toEqual([["name", "String", "Name"]]);
  });
});
