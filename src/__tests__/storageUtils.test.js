import { describe, it, expect } from "vitest";
import {
  storageClass, planCountChunks, parseRecordCounts, countAll, buildFileSumFetch, parseAggRows,
  mergeAgg, isAggregateLimitError, scanAdaptive, scanFileSource, formatBytes, FILE_SOURCES,
} from "../storageUtils.js";

const limitErr = () => { const e = new Error("AggregateQueryRecordLimit exceeded. Cannot perform this operation."); return e; };

describe("storageClass (Microsoft's documented capacity split)", () => {
  it("audit, plugin traces and ELASTIC tables are Log; notes/attachments/file columns are File", () => {
    expect(storageClass("audit", "Standard")).toBe("log");
    expect(storageClass("plugintracelog", "Standard")).toBe("log");
    expect(storageClass("msdyn_custom", "Elastic")).toBe("log");
    expect(storageClass("annotation", "Standard")).toBe("file");
    expect(storageClass("fileattachment", "Standard")).toBe("file");
    expect(storageClass("account", "Standard")).toBe("db");
  });
  it("virtual tables hold no Dataverse storage — excluded (null)", () => {
    expect(storageClass("fou_creditmanagement", "Virtual")).toBeNull();
  });
});

describe("planCountChunks", () => {
  it("keeps each chunk's payload under the char budget, never drops a name", () => {
    const names = Array.from({ length: 300 }, (_, i) => `table_${i}`);
    const chunks = planCountChunks(names, 200);
    expect(chunks.flat()).toEqual(names);
    for (const c of chunks) expect(c.reduce((n, x) => n + x.length + 3, 0)).toBeLessThanOrEqual(200);
  });
  it("a single over-budget name still gets its own chunk", () => {
    expect(planCountChunks(["x".repeat(500)], 100)).toEqual([["x".repeat(500)]]);
  });
});

describe("parseRecordCounts", () => {
  it("maps the documented Keys/Values pair", () => {
    expect(parseRecordCounts({ EntityRecordCountCollection: { Count: 2, IsReadOnly: false, Keys: ["account", "contact"], Values: [12, 34] } }))
      .toEqual({ account: 12, contact: 34 });
  });
  it("tolerates an unexpected shape", () => {
    expect(parseRecordCounts(null)).toEqual({});
    expect(parseRecordCounts({ EntityRecordCountCollection: {} })).toEqual({});
  });
});

describe("countAll", () => {
  it("one bad table is ISOLATED by bisection — its neighbours still get counted", async () => {
    const names = ["a", "b", "bad", "c", "d", "e", "f", "g"];
    const run = async (chunk) => {
      if (chunk.includes("bad")) throw new Error("not supported");
      return Object.fromEntries(chunk.map(n => [n, n.charCodeAt(0)]));
    };
    const { counts, failed } = await countAll({ names, run, maxChars: 40, concurrency: 2 });
    expect(failed).toEqual(["bad"]);
    expect(Object.keys(counts).sort()).toEqual(["a", "b", "c", "d", "e", "f", "g"]);
  });
  it("a name missing from the response or negative is reported as failed, not as zero", async () => {
    const run = async () => ({ a: 5, b: -1 });
    const { counts, failed } = await countAll({ names: ["a", "b", "c"], run });
    expect(counts).toEqual({ a: 5 });
    expect(failed.sort()).toEqual(["b", "c"]);
  });
  it("maxCalls bounds the worst case: leftovers land in failed", async () => {
    const run = async () => { throw new Error("down"); };
    const { failed, calls } = await countAll({ names: Array.from({ length: 16 }, (_, i) => `t${i}`), run, maxChars: 30, maxCalls: 5 });
    expect(calls).toBe(5);
    expect(failed.length).toBe(16);
  });
});

describe("FetchXML + aggregate rows", () => {
  it("builds a grouped, date-bounded sum with the source filter", () => {
    const x = buildFileSumFetch(FILE_SOURCES[0], { from: Date.UTC(2024, 0, 1), to: Date.UTC(2025, 0, 1) }, true);
    expect(x).toContain('<attribute name="filesize" alias="bytes" aggregate="sum"/>');
    expect(x).toContain('groupby="true"');
    expect(x).toContain('attribute="isdocument"');
    expect(x).toContain('operator="ge" value="2024-01-01T00:00:00.000Z"');
    expect(x).toContain('operator="lt" value="2025-01-01T00:00:00.000Z"');
  });
  it("ungrouped, unbounded form has no groupby and no filter for a filterless source", () => {
    const x = buildFileSumFetch(FILE_SOURCES[1], null, false);
    expect(x).not.toContain("groupby");
    expect(x).not.toContain("<filter");
  });
  it("parseAggRows + mergeAgg sum per owning table, keeping the display label", () => {
    const acc = new Map();
    mergeAgg(acc, parseAggRows([{ grp: "account", "grp@OData.Community.Display.V1.FormattedValue": "Account", bytes: 100, files: 2 }], true));
    mergeAgg(acc, parseAggRows([{ grp: "account", bytes: 50, files: 1 }], true));
    expect(acc.get("account")).toEqual({ key: "account", label: "Account", bytes: 150, files: 3 });
  });
});

describe("isAggregateLimitError", () => {
  it("recognizes the documented message and code, nothing else", () => {
    expect(isAggregateLimitError("AggregateQueryRecordLimit exceeded. Cannot perform this operation.")).toBe(true);
    expect(isAggregateLimitError("Code: 8004E023")).toBe(true);
    expect(isAggregateLimitError("Principal user is missing prvReadNote privilege")).toBe(false);
  });
});

describe("scanAdaptive", () => {
  // Fake table: 1 file of 10 bytes per hour over 10 days; the "server" refuses ranges > 1 day.
  const DAY = 86400000, HOUR = 3600000, start = Date.UTC(2025, 0, 1);
  const run = async ({ from, to }) => {
    if (to - from > DAY) throw limitErr();
    const n = Math.max(0, Math.ceil((Math.min(to, start + 10 * DAY) - Math.max(from, start)) / HOUR));
    return [{ key: "account", label: "Account", bytes: n * 10, files: n }];
  };
  it("splits only where needed and the totals are exact", async () => {
    const r = await scanAdaptive({ from: start, to: start + 10 * DAY, run });
    expect(r.complete).toBe(true);
    expect(r.rows[0].files).toBe(240);
    expect(r.rows[0].bytes).toBe(2400);
  });
  it("a range still over the limit at minSpan is skipped and flagged incomplete", async () => {
    const r = await scanAdaptive({ from: 0, to: 4000, run: async () => { throw limitErr(); }, minSpanMs: 1000 });
    expect(r.complete).toBe(false);
    expect(r.skippedMs).toBe(4000);
  });
  it("non-limit errors propagate (they're the diagnosis, not something to bisect)", async () => {
    await expect(scanAdaptive({ from: 0, to: 10, run: async () => { throw new Error("403 privilege"); } })).rejects.toThrow("403");
  });
  it("abort stops early and reports incomplete", async () => {
    const r = await scanAdaptive({ from: start, to: start + 10 * DAY, run, shouldAbort: () => true });
    expect(r.complete).toBe(false);
  });
});

describe("scanFileSource", () => {
  it("fast path: one whole-table aggregate when under the limit", async () => {
    let calls = 0;
    const r = await scanFileSource({ run: async () => { calls++; return [{ key: "account", label: "", bytes: 5, files: 1 }]; }, getOldest: async () => 0 });
    expect(calls).toBe(1);
    expect(r).toMatchObject({ complete: true, grouped: true });
  });
  it("grouped form refused → falls back to an ungrouped total so the size still shows", async () => {
    const r = await scanFileSource({
      run: async (range, grouped) => { if (grouped) throw new Error("groupby not supported on this attribute"); return [{ key: "_total", label: "", bytes: 99, files: 3 }]; },
      getOldest: async () => 0,
    });
    expect(r.grouped).toBe(false);
    expect(r.rows[0].bytes).toBe(99);
  });
  it("over the limit → oldest createdon → adaptive scan", async () => {
    const DAY = 86400000, start = Date.UTC(2025, 0, 1);
    const run = async (range) => {
      if (!range || range.to - range.from > 2 * DAY) throw limitErr();
      return [{ key: "account", label: "", bytes: 1, files: 1 }];
    };
    const r = await scanFileSource({ run, getOldest: async () => start, now: start + 6 * DAY });
    expect(r.complete).toBe(true);
    expect(r.queries).toBeGreaterThan(1);
  });
  it("an empty table (no oldest record) returns cleanly", async () => {
    const r = await scanFileSource({ run: async () => { throw limitErr(); }, getOldest: async () => null });
    expect(r.rows).toEqual([]);
    expect(r.complete).toBe(true);
  });
});

describe("formatBytes", () => {
  it("binary units with sensible precision", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.50 KB");
    expect(formatBytes(5 * 1024 ** 3)).toBe("5.00 GB");
    expect(formatBytes(250 * 1024 ** 2)).toBe("250 MB");
  });
});
