import { describe, it, expect } from "vitest";
import { sqlToFetchXml, parseSqlToAst, astToFetchXml } from "../sqlToFetchXml.js";

// Helper: parse + verify no error
function sql(query) {
  const r = sqlToFetchXml(query);
  if (r.error) throw new Error(`SQL parse error: ${r.error}`);
  return r.fetchXml;
}

// ── Basic SELECT ──────────────────────────────────────────────
describe("Basic SELECT", () => {
  it("simple SELECT with columns", () => {
    const fx = sql("SELECT name, revenue FROM account");
    expect(fx).toContain('<entity name="account">');
    expect(fx).toContain('<attribute name="name"/>');
    expect(fx).toContain('<attribute name="revenue"/>');
  });

  it("SELECT * returns no attribute nodes (fetch all)", () => {
    const fx = sql("SELECT * FROM contact");
    expect(fx).toContain('<entity name="contact">');
    expect(fx).not.toContain("<attribute");
  });

  it("handles trailing semicolon", () => {
    const fx = sql("SELECT name FROM account;");
    expect(fx).toContain('<entity name="account">');
  });

  it("case insensitive keywords", () => {
    const fx = sql("select Name from Account");
    expect(fx).toContain('<entity name="Account">');
    expect(fx).toContain('<attribute name="Name"/>');
  });
});

// ── TOP / DISTINCT ────────────────────────────────────────────
describe("TOP and DISTINCT", () => {
  it("TOP N sets count attribute", () => {
    const fx = sql("SELECT TOP 10 name FROM account");
    expect(fx).toContain('count="10"');
  });

  it("DISTINCT sets distinct attribute", () => {
    const fx = sql("SELECT DISTINCT name FROM account");
    expect(fx).toContain('distinct="true"');
  });

  it("TOP + DISTINCT combined", () => {
    const fx = sql("SELECT DISTINCT TOP 5 name FROM account");
    expect(fx).toContain('count="5"');
    expect(fx).toContain('distinct="true"');
  });
});

// ── WHERE clauses ─────────────────────────────────────────────
describe("WHERE clauses", () => {
  it("equals string", () => {
    const fx = sql("SELECT name FROM account WHERE name = 'Test'");
    expect(fx).toContain('operator="eq"');
    expect(fx).toContain('value="Test"');
  });

  it("not equals", () => {
    const fx = sql("SELECT name FROM account WHERE statecode != 1");
    expect(fx).toContain('operator="ne"');
    expect(fx).toContain('value="1"');
  });

  it("<> operator", () => {
    const fx = sql("SELECT name FROM account WHERE statecode <> 0");
    expect(fx).toContain('operator="ne"');
  });

  it("greater than / less than", () => {
    const fx = sql("SELECT name FROM account WHERE revenue > 1000");
    expect(fx).toContain('operator="gt"');
  });

  it(">= operator", () => {
    const fx = sql("SELECT name FROM account WHERE revenue >= 500");
    expect(fx).toContain('operator="ge"');
  });

  it("IS NULL", () => {
    const fx = sql("SELECT name FROM account WHERE emailaddress1 IS NULL");
    expect(fx).toContain('operator="null"');
  });

  it("IS NOT NULL", () => {
    const fx = sql("SELECT name FROM account WHERE emailaddress1 IS NOT NULL");
    expect(fx).toContain('operator="not-null"');
  });

  it("LIKE operator", () => {
    const fx = sql("SELECT name FROM account WHERE name LIKE '%test%'");
    expect(fx).toContain('operator="like"');
    expect(fx).toContain('value="%test%"');
  });

  it("NOT LIKE operator", () => {
    const fx = sql("SELECT name FROM account WHERE name NOT LIKE '%demo%'");
    expect(fx).toContain('operator="not-like"');
  });

  it("IN operator", () => {
    const fx = sql("SELECT name FROM account WHERE statecode IN (0, 1, 2)");
    expect(fx).toContain('operator="in"');
    expect(fx).toContain("<value>0</value>");
    expect(fx).toContain("<value>1</value>");
    expect(fx).toContain("<value>2</value>");
  });

  it("NOT IN operator", () => {
    const fx = sql("SELECT name FROM account WHERE statecode NOT IN (3, 4)");
    expect(fx).toContain('operator="not-in"');
  });

  it("AND combines conditions", () => {
    const fx = sql("SELECT name FROM account WHERE statecode = 0 AND revenue > 1000");
    expect(fx).toContain('type="and"');
  });

  it("OR combines conditions", () => {
    const fx = sql("SELECT name FROM account WHERE name = 'A' OR name = 'B'");
    expect(fx).toContain('type="or"');
  });

  it("nested AND/OR with parentheses", () => {
    const fx = sql("SELECT name FROM account WHERE statecode = 0 AND (name = 'A' OR name = 'B')");
    expect(fx).toContain('type="and"');
    expect(fx).toContain('type="or"');
  });
});

// ── ORDER BY ──────────────────────────────────────────────────
describe("ORDER BY", () => {
  it("ASC order", () => {
    const fx = sql("SELECT name FROM account ORDER BY name ASC");
    expect(fx).toContain('attribute="name"');
    expect(fx).toContain('descending="false"');
  });

  it("DESC order", () => {
    const fx = sql("SELECT name FROM account ORDER BY name DESC");
    expect(fx).toContain('descending="true"');
  });

  it("default order is ASC", () => {
    const fx = sql("SELECT name FROM account ORDER BY name");
    expect(fx).toContain('descending="false"');
  });

  it("multiple order columns", () => {
    const fx = sql("SELECT name, revenue FROM account ORDER BY name ASC, revenue DESC");
    expect(fx).toMatch(/attribute="name".*descending="false"/);
    expect(fx).toMatch(/attribute="revenue".*descending="true"/);
  });
});

// ── JOINs ─────────────────────────────────────────────────────
describe("JOINs", () => {
  it("INNER JOIN generates link-entity", () => {
    const fx = sql("SELECT a.name, bu.name FROM systemuser a JOIN businessunit bu ON a.businessunitid = bu.businessunitid");
    expect(fx).toContain('<link-entity name="businessunit"');
    expect(fx).toContain('link-type="inner"');
  });

  it("LEFT JOIN generates outer link-type", () => {
    const fx = sql("SELECT name FROM account LEFT JOIN contact c ON account.primarycontactid = c.contactid");
    expect(fx).toContain('link-type="outer"');
  });

  it("JOIN with alias", () => {
    const fx = sql("SELECT u.fullname, bu.name FROM systemuser u JOIN businessunit bu ON u.businessunitid = bu.businessunitid");
    expect(fx).toContain('alias="bu"');
  });
});

// ── Aggregations ──────────────────────────────────────────────
describe("Aggregations", () => {
  it("COUNT(*)", () => {
    const fx = sql("SELECT COUNT(*) FROM account");
    expect(fx).toContain('aggregate="true"');
    expect(fx).toContain('aggregate="count"');
  });

  it("SUM with alias", () => {
    const fx = sql("SELECT SUM(revenue) AS total FROM account");
    expect(fx).toContain('aggregate="sum"');
    expect(fx).toContain('alias="total"');
  });

  it("AVG", () => {
    const fx = sql("SELECT AVG(revenue) FROM account");
    expect(fx).toContain('aggregate="avg"');
  });

  it("GROUP BY", () => {
    const fx = sql("SELECT industrycode, COUNT(*) AS cnt FROM account GROUP BY industrycode");
    expect(fx).toContain('groupby="true"');
    expect(fx).toContain('aggregate="count"');
  });
});

// ── Aliases ───────────────────────────────────────────────────
describe("Aliases", () => {
  it("column alias with AS", () => {
    const fx = sql("SELECT name AS accountname FROM account");
    expect(fx).toContain('alias="accountname"');
  });

  it("table alias", () => {
    const fx = sql("SELECT a.name FROM account AS a");
    expect(fx).toContain('<entity name="account">');
    expect(fx).toContain('<attribute name="name"/>');
  });
});

// ── Error handling ────────────────────────────────────────────
describe("Error handling", () => {
  it("empty query returns error", () => {
    const r = sqlToFetchXml("");
    expect(r.error).toBeTruthy();
    expect(r.fetchXml).toBe("");
  });

  it("null query returns error", () => {
    const r = sqlToFetchXml(null);
    expect(r.error).toBeTruthy();
  });

  it("non-SELECT returns error", () => {
    const r = sqlToFetchXml("INSERT INTO account (name) VALUES ('test')");
    expect(r.error).toContain("SELECT");
  });

  it("missing FROM returns error", () => {
    const r = sqlToFetchXml("SELECT name");
    expect(r.error).toBeTruthy();
  });

  it("invalid operator returns error", () => {
    const r = sqlToFetchXml("SELECT name FROM account WHERE name");
    expect(r.error).toBeTruthy();
  });
});

// ── XML escaping ──────────────────────────────────────────────
describe("XML escaping", () => {
  it("escapes special characters in values", () => {
    const fx = sql("SELECT name FROM account WHERE name = 'A&B<C>D'");
    expect(fx).toContain("A&amp;B&lt;C&gt;D");
    expect(fx).not.toContain("A&B");
  });
});

// ── Complex real-world queries ────────────────────────────────
describe("Real-world queries", () => {
  it("users with business unit", () => {
    const fx = sql(`
      SELECT u.fullname, u.internalemailaddress, bu.name
      FROM systemuser u
      JOIN businessunit bu ON u.businessunitid = bu.businessunitid
      WHERE u.isdisabled = 0
      ORDER BY u.fullname ASC
    `);
    expect(fx).toContain('<entity name="systemuser">');
    expect(fx).toContain('<attribute name="fullname"/>');
    expect(fx).toContain('<attribute name="internalemailaddress"/>');
    expect(fx).toContain('<link-entity name="businessunit"');
    expect(fx).toContain('operator="eq"');
    expect(fx).toContain('value="0"');
    expect(fx).toContain('<order attribute="fullname"');
  });

  it("accounts with filters and sorting", () => {
    const fx = sql(`
      SELECT TOP 50 name, revenue, telephone1
      FROM account
      WHERE statecode = 0 AND revenue > 1000000 AND name LIKE '%corp%'
      ORDER BY revenue DESC
    `);
    expect(fx).toContain('count="50"');
    expect(fx).toContain('operator="like"');
    expect(fx).toContain('descending="true"');
  });

  it("count by industry", () => {
    const fx = sql(`
      SELECT industrycode, COUNT(*) AS cnt
      FROM account
      WHERE statecode = 0
      GROUP BY industrycode
    `);
    expect(fx).toContain('aggregate="true"');
    expect(fx).toContain('groupby="true"');
    expect(fx).toContain('aggregate="count"');
  });
});
