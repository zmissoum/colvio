import { describe, it, expect } from "vitest";
import { parseDelimited, detectSep, applyTransform, resolveEntitySet, deltaEqual, defaultMatchKey, migrationOverridePair, isTransientError, isNullToken, stripHtml, flushNeverSent, coerceForFieldType } from "../loaderUtils.js";

describe("coerceForFieldType — Edm string/number 400 killer", () => {
  it("coerces clean dot-decimal strings to JSON numbers for Decimal/Money/Double", () => {
    expect(coerceForFieldType("123.45", "Decimal")).toEqual({ ok: true, value: 123.45 });
    expect(coerceForFieldType(" -7 ", "Money")).toEqual({ ok: true, value: -7 });
    expect(coerceForFieldType("1e3", "Double")).toEqual({ ok: true, value: 1000 });
  });
  it("refuses comma decimals and junk with a readable reason (locale transform's job)", () => {
    expect(coerceForFieldType("1,5", "Decimal").ok).toBe(false);
    expect(coerceForFieldType("1,5", "Decimal").reason).toContain("Number transform");
    expect(coerceForFieldType("abc", "Money").ok).toBe(false);
  });
  it("Integer/BigInt accept whole numbers only, naming the decimal problem", () => {
    expect(coerceForFieldType("42", "Integer")).toEqual({ ok: true, value: 42 });
    expect(coerceForFieldType("1.5", "Integer").reason).toContain("decimals");
    expect(coerceForFieldType("1 000", "BigInt").ok).toBe(false);
  });
  it("Booleans accept true/false, 1/0, yes/no; already-typed values and other types pass through", () => {
    expect(coerceForFieldType("Yes", "Boolean")).toEqual({ ok: true, value: true });
    expect(coerceForFieldType("0", "Boolean")).toEqual({ ok: true, value: false });
    expect(coerceForFieldType("oui", "Boolean").ok).toBe(false);
    expect(coerceForFieldType(3.14, "Decimal")).toEqual({ ok: true, value: 3.14 });
    expect(coerceForFieldType("hello", "String")).toEqual({ ok: true, value: "hello" });
  });
});

describe("stripHtml + strip_html transform", () => {
  it("strips tags and keeps the visible text", () =>
    expect(applyTransform("<p>Hello <b>world</b></p>", "strip_html")).toBe("Hello world"));
  it("turns <br> and closing blocks into line breaks, <li> into bullets", () => {
    expect(stripHtml("Line1<br>Line2")).toBe("Line1\nLine2");
    expect(stripHtml("<ul><li>alpha</li><li>beta</li></ul>")).toBe("- alpha\n- beta");
  });
  it("decodes common + numeric entities (&amp; last — no double decode)", () => {
    expect(stripHtml("Fish &amp; Chips &lt;3 &#233;t&#xE9;")).toBe("Fish & Chips <3 été");
    expect(stripHtml("&amp;lt;not a tag&amp;gt;")).toBe("&lt;not a tag&gt;");
  });
  it("drops <script>/<style> WITH their content", () =>
    expect(stripHtml("<style>p{color:red}</style>Hi<script>alert(1)</script>")).toBe("Hi"));
  it("passes plain text through and returns null when only markup", () => {
    expect(applyTransform("no tags here", "strip_html")).toBe("no tags here");
    expect(applyTransform("<p> </p>", "strip_html")).toBeNull();
  });
});

describe("isNullToken (explicit clear-the-field marker)", () => {
  it("matches NULL in any case, with surrounding spaces", () => {
    expect(isNullToken("NULL")).toBe(true);
    expect(isNullToken("null")).toBe(true);
    expect(isNullToken("Null")).toBe(true);
    expect(isNullToken("  null  ")).toBe(true);
  });
  it("does NOT match empty (empty = leave untouched), words containing null, or non-strings", () => {
    expect(isNullToken("")).toBe(false);
    expect(isNullToken("nullable")).toBe(false);
    expect(isNullToken("not null")).toBe(false);
    expect(isNullToken(null)).toBe(false);
    expect(isNullToken(undefined)).toBe(false);
    expect(isNullToken(0)).toBe(false);
  });
});

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
  it("int handles thousands commas (was silently 1)", () => expect(applyTransform("1,000", "int")).toBe(1000));
  it("int truncates a trailing fraction", () => expect(applyTransform("1000.0", "int")).toBe(1000));
  it("int keeps sign", () => expect(applyTransform("-5", "int")).toBe(-5));
  it("int rejects partial garbage instead of parseInt's silent slice", () => expect(applyTransform("12abc", "int")).toBeNull());
  it("int rejects non-numeric", () => expect(applyTransform("N/A", "int")).toBeNull());
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
  it("date: ambiguous d/m/Y stays day-first by default (EU)", () =>
    expect(applyTransform("03/04/2024", "date_iso")).toBe("2024-04-03"));
  it("date: ambiguous d/m/Y read month-first with dateMD=true (US)", () =>
    expect(applyTransform("03/04/2024", "date_iso", null, true)).toBe("2024-03-04"));
  it("date: dateMD=true still auto-swaps when the month part is impossible (>12)", () =>
    expect(applyTransform("31/12/2024", "date_iso", null, true)).toBe("2024-12-31"));
  it("date: ISO date ignores dateMD entirely", () =>
    expect(applyTransform("2024-03-04", "date_iso", null, true)).toBe("2024-03-04"));
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

describe("deltaEqual (delta mode)", () => {
  it("number vs numeric string", () => expect(deltaEqual(3, "3")).toBe(true));
  it("different numbers", () => expect(deltaEqual(3, "4")).toBe(false));
  it("null vs empty", () => expect(deltaEqual(null, "")).toBe(true));
  it("boolean vs string", () => expect(deltaEqual(true, "true")).toBe(true));
  it("same datetime, different representation", () =>
    expect(deltaEqual("2026-06-13T00:00:00Z", "2026-06-13T00:00:00.000Z")).toBe(true));
  it("different datetimes", () =>
    expect(deltaEqual("2026-06-13T00:00:00Z", "2026-06-14T00:00:00Z")).toBe(false));
  it("plain strings", () => expect(deltaEqual("Acme", "Acme")).toBe(true));
  it("changed string", () => expect(deltaEqual("Acme", "Acme Corp")).toBe(false));
});

describe("defaultMatchKey", () => {
  it("prefers the first alternate key over the PK", () => {
    const r = defaultMatchKey(["fou_sapnumber", "other_key"], "productid", ["x"]);
    expect(r.d).toBe("fou_sapnumber");
  });
  it("falls back to the PK when there are no alt-keys", () => {
    expect(defaultMatchKey([], "productid", ["productid"]).d).toBe("productid");
  });
  it("auto-pairs the CSV column when a header matches the key name (case-insensitive)", () => {
    expect(defaultMatchKey(["productnumber"], "productid", ["ProductNumber", "name"]).c).toBe("ProductNumber");
  });
  // REGRESSION (v1.10.13→1.11.32): when no header matches the key, the CSV column must be EMPTY —
  // it must NEVER fall back to the first column (that silently matched on the wrong column → 404s,
  // or duplicate creation in UPSERT). Empty c makes the UI warn instead.
  it("leaves the CSV column empty when no header matches the key (never grabs the first column)", () => {
    const r = defaultMatchKey(["fou_sapcustomernumber"], "productid", ["CORE_SAP_Number__c", "Org"]);
    expect(r.d).toBe("fou_sapcustomernumber");
    expect(r.c).toBe("");
  });
  it("handles empty/missing inputs without throwing", () => {
    expect(defaultMatchKey(undefined, "accountid", undefined)).toEqual({ d: "accountid", c: "" });
  });
});

describe("migrationOverridePair (migration mode audit override)", () => {
  it("maps createdon to overriddencreatedon (createdon is not directly writable)", () => {
    expect(migrationOverridePair("createdon", "2019-03-12T00:00:00Z")).toEqual({ key: "overriddencreatedon", value: "2019-03-12T00:00:00Z" });
  });
  it("passes overriddencreatedon through unchanged", () => {
    expect(migrationOverridePair("overriddencreatedon", "2019-03-12T00:00:00Z")).toEqual({ key: "overriddencreatedon", value: "2019-03-12T00:00:00Z" });
  });
  it("writes modifiedon directly", () => {
    expect(migrationOverridePair("modifiedon", "2020-01-01T08:00:00Z")).toEqual({ key: "modifiedon", value: "2020-01-01T08:00:00Z" });
  });
  it("binds createdby to a systemuser via @odata.bind", () => {
    expect(migrationOverridePair("createdby", "00000000-0000-0000-0000-000000000001")).toEqual({ key: "createdby@odata.bind", value: "/systemusers(00000000-0000-0000-0000-000000000001)" });
  });
  it("binds modifiedby to a systemuser and trims whitespace", () => {
    expect(migrationOverridePair("modifiedby", " 00000000-0000-0000-0000-000000000002 ")).toEqual({ key: "modifiedby@odata.bind", value: "/systemusers(00000000-0000-0000-0000-000000000002)" });
  });
  it("is case-insensitive on the field name", () => {
    expect(migrationOverridePair("CreatedBy", "00000000-0000-0000-0000-000000000003").key).toBe("createdby@odata.bind");
  });
});

describe("isTransientError (retry classification)", () => {
  it("flags timeouts and aborts as transient", () => {
    expect(isTransientError("Timeout after 300s — action: batchCreate")).toBe(true);
    expect(isTransientError("The operation was aborted")).toBe(true);
    expect(isTransientError("signal is aborted without reason")).toBe(true);
  });
  it("flags throttling / service protection as transient", () => {
    expect(isTransientError("HTTP 429: Too Many Requests")).toBe(true);
    expect(isTransientError("Number of requests exceeded the limit of 6000 over time window")).toBe(true);
    expect(isTransientError("0x80072321 service protection limit")).toBe(true);
  });
  it("flags 5xx and SQL deadlocks as transient", () => {
    expect(isTransientError("HTTP 503: Service Unavailable")).toBe(true);
    expect(isTransientError("HTTP 504: gateway timeout")).toBe(true);
    expect(isTransientError("Transaction was deadlocked on lock resources")).toBe(true);
    expect(isTransientError("Generic SQL error")).toBe(true);
  });
  it("flags network blips as transient", () => {
    expect(isTransientError("Failed to fetch")).toBe(true);
    expect(isTransientError("ECONNRESET")).toBe(true);
  });
  it("does NOT flag deterministic data/permission errors", () => {
    expect(isTransientError("HTTP 400: A value exceeds the maximum length of 504 characters")).toBe(false);
    expect(isTransientError("HTTP 400: incompatible types principal and Edm.String")).toBe(false);
    expect(isTransientError("HTTP 404: entity not found")).toBe(false);
    expect(isTransientError("Duplicate record detected")).toBe(false);
    expect(isTransientError("A required field is missing")).toBe(false);
  });
  it("handles empty/nullish input", () => {
    expect(isTransientError("")).toBe(false);
    expect(isTransientError(null)).toBe(false);
    expect(isTransientError(undefined)).toBe(false);
  });
});

describe("flushNeverSent — scale-safe honest accounting", () => {
  const mkChunks = (total, size) => {
    const chunks = [];
    for (let i = 0; i < total; i += size) chunks.push({ start: i, slice: new Array(Math.min(size, total - i)).fill(0) });
    return chunks;
  };

  it("survives a 300k-row never-sent remainder without throwing (the 308k crash)", () => {
    const total = 308000, chunkSize = 200;
    const chunks = mkChunks(total, chunkSize);
    const nextIdx = 100; // 20k rows dispatched, 288k never sent
    const agg = { aborted: true, errors: [], log: [] };
    const calls = [];
    expect(() => flushNeverSent(agg, chunks, nextIdx, total, nextIdx * chunkSize, p => calls.push(p))).not.toThrow();
    const neverSent = total - nextIdx * chunkSize;
    expect(agg.errors.length).toBe(neverSent);
    expect(agg.log.length).toBe(neverSent);
    // Delivered in bounded slices, and the slices re-assemble the exact remainder
    expect(calls.length).toBeGreaterThan(1);
    expect(Math.max(...calls.map(c => c.newLog.length))).toBeLessThanOrEqual(5000);
    expect(calls.reduce((n, c) => n + c.newLog.length, 0)).toBe(neverSent);
    expect(calls[calls.length - 1].done).toBe(total);
    // Rows are classified retryable by the transient classifier
    expect(isTransientError(agg.errors[0].msg)).toBe(true);
  });

  it("a throwing onProgress callback cannot kill the accounting", () => {
    const chunks = mkChunks(1000, 100);
    const agg = { aborted: true, errors: [], log: [] };
    expect(() => flushNeverSent(agg, chunks, 2, 1000, 200, () => { throw new Error("UI died"); })).not.toThrow();
    expect(agg.errors.length).toBe(800);
  });

  it("does nothing when the run was not aborted or everything was dispatched", () => {
    const chunks = mkChunks(400, 100);
    const a1 = { aborted: false, errors: [], log: [] };
    flushNeverSent(a1, chunks, 1, 400, 100, null);
    expect(a1.errors.length).toBe(0);
    const a2 = { aborted: true, errors: [], log: [] };
    flushNeverSent(a2, chunks, 4, 400, 400, null);
    expect(a2.errors.length).toBe(0);
  });
});
