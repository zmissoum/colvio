import { describe, it, expect } from "vitest";
import { parseXml, decodeEntities, opLabel, parseViewFetchXml, parseViewLayoutXml, parseFormSubgrids } from "../viewInspectorUtils.js";

// Realistic Dataverse-generated documents — the exact shapes savedquery/systemform emit.
const ACTIVE_ACCOUNTS_FETCH = `<fetch version="1.0" output-format="xml-platform" mapping="logical">
  <entity name="account">
    <attribute name="name" />
    <attribute name="primarycontactid" />
    <order attribute="name" descending="false" />
    <filter type="and">
      <condition attribute="statecode" operator="eq" value="0" />
      <condition attribute="name" operator="like" value="%Contoso%" />
      <filter type="or">
        <condition attribute="ownerid" operator="eq-userid" />
        <condition attribute="industrycode" operator="in">
          <value>1</value>
          <value>2</value>
        </condition>
      </filter>
    </filter>
    <link-entity name="contact" from="parentcustomerid" to="accountid" link-type="inner" alias="ct">
      <filter type="and">
        <condition attribute="emailaddress1" operator="not-null" />
      </filter>
    </link-entity>
  </entity>
</fetch>`;

const LAYOUT = `<grid name="resultset" object="1" jump="name" select="1" icon="1" preview="1">
  <row name="result" id="accountid">
    <cell name="name" width="300" />
    <cell name="primarycontactid" width="150" />
    <cell name="telephone1" width="100" />
    <cell name="accountid" ishidden="1" width="1" />
  </row>
</grid>`;

const FORMXML = `<form>
  <tabs><tab name="general"><columns><column><sections><section>
    <rows>
      <row>
        <cell id="{c1}"><labels><label description="Contacts" languagecode="1033" /></labels>
          <control id="Contacts" classid="{E7A81278-8635-4d9e-8D4D-59480B391C5B}" datafieldname="" disabled="false">
            <parameters>
              <TargetEntityType>contact</TargetEntityType>
              <ViewId>{00000000-0000-0000-00AA-000010001004}</ViewId>
              <EnableViewPicker>false</EnableViewPicker>
              <RelationshipName>contact_customer_accounts</RelationshipName>
            </parameters>
          </control>
        </cell>
      </row>
      <row>
        <cell id="{c2}"><labels><label description="Opportunit&#233;s ouvertes" languagecode="1036" /></labels>
          <control id="OppGrid" classid="{E7A81278-8635-4D9E-8D4D-59480B391C5B}">
            <parameters>
              <TargetEntityType>opportunity</TargetEntityType>
              <ViewId>{11111111-2222-3333-4444-555555555555}</ViewId>
              <EnableViewPicker>true</EnableViewPicker>
              <RelationshipName>opportunity_customer_accounts</RelationshipName>
            </parameters>
          </control>
        </cell>
      </row>
      <row>
        <cell id="{c3}"><labels><label description="Name" languagecode="1033" /></labels>
          <control id="name" classid="{4273EDBD-AC1D-40d3-9FB2-095C621B552D}" datafieldname="name" />
        </cell>
      </row>
    </rows>
  </section></sections></column></columns></tab></tabs>
</form>`;

describe("parseXml / decodeEntities", () => {
  it("parses nested elements, attributes and self-closing tags", () => {
    const t = parseXml(`<a x="1"><b y='2'/><c>text</c></a>`);
    const a = t.children[0];
    expect(a.tag).toBe("a"); expect(a.attrs.x).toBe("1");
    expect(a.children[0].attrs.y).toBe("2");
    expect(a.children[1].text).toBe("text");
  });
  it("decodes entities in attributes and text, &amp; last", () => {
    expect(decodeEntities("A &amp; B &lt;x&gt; &#233; &amp;lt;")).toBe("A & B <x> é &lt;");
    const t = parseXml(`<a v="Tom &amp; Jerry">caf&#xE9;</a>`);
    expect(t.children[0].attrs.v).toBe("Tom & Jerry");
    expect(t.children[0].text).toBe("café");
  });
  it("is safe on malformed or empty input", () => {
    expect(parseXml("").children).toHaveLength(0);
    expect(parseXml(null).children).toHaveLength(0);
    expect(() => parseXml("<a><b></a>")).not.toThrow();
  });
});

describe("parseViewFetchXml", () => {
  const v = parseViewFetchXml(ACTIVE_ACCOUNTS_FETCH);
  it("extracts entity, readable conditions and nested OR group", () => {
    expect(v.entity).toBe("account");
    expect(v.filter.logic).toBe("AND");
    const [c1, c2, g] = v.filter.items;
    expect(c1).toMatchObject({ attribute: "statecode", opLabel: "=", value: "0" });
    expect(c2).toMatchObject({ attribute: "name", opLabel: "contains", value: "%Contoso%" });
    expect(g.kind).toBe("group"); expect(g.logic).toBe("OR");
    expect(g.items[0].opLabel).toBe("equals current user");
    expect(g.items[1]).toMatchObject({ opLabel: "is one of", value: "1, 2", values: ["1", "2"] });
  });
  it("extracts link-entities with their own filters, and orders", () => {
    expect(v.linkEntities).toHaveLength(1);
    expect(v.linkEntities[0]).toMatchObject({ name: "contact", from: "parentcustomerid", to: "accountid", type: "inner" });
    expect(v.linkEntities[0].filter.items[0].opLabel).toBe("is not empty");
    expect(v.orders).toEqual([{ attribute: "name", desc: false }]);
  });
  it("x-operators substitute the value into the label; unknown operators pass through raw", () => {
    expect(opLabel("last-x-days", "30")).toBe("in the last 30 days");
    expect(opLabel("some-future-op", "5")).toBe("some-future-op");
  });
  it("returns a null filter (not a crash) on a filterless view", () => {
    const r = parseViewFetchXml(`<fetch><entity name="task"><attribute name="subject"/></entity></fetch>`);
    expect(r.entity).toBe("task"); expect(r.filter).toBeNull(); expect(r.linkEntities).toEqual([]);
  });
});

describe("parseViewLayoutXml", () => {
  it("returns visible columns in order with widths, hidden cells dropped", () => {
    expect(parseViewLayoutXml(LAYOUT)).toEqual([
      { name: "name", width: 300 },
      { name: "primarycontactid", width: 150 },
      { name: "telephone1", width: 100 },
    ]);
  });
});

describe("parseFormSubgrids", () => {
  const grids = parseFormSubgrids(FORMXML);
  it("finds every subgrid with label, target, cleaned view GUID, relationship, picker flag", () => {
    expect(grids).toHaveLength(2); // the name text control is NOT a subgrid
    expect(grids[0]).toEqual({
      controlId: "Contacts", label: "Contacts", targetEntity: "contact",
      viewId: "00000000-0000-0000-00aa-000010001004",
      relationshipName: "contact_customer_accounts", viewPicker: false,
    });
    expect(grids[1]).toMatchObject({ label: "Opportunités ouvertes", targetEntity: "opportunity", viewPicker: true });
  });
  it("returns [] on malformed or subgrid-free forms", () => {
    expect(parseFormSubgrids("<form></form>")).toEqual([]);
    expect(parseFormSubgrids("not xml at all")).toEqual([]);
  });
});
