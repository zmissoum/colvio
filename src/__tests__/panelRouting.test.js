import { describe, it, expect } from "vitest";
import { panelOrgOf, pickPanel, relayCandidates } from "../panelRouting.js";

const EXT = "chrome-extension://abc/panel.html";
const DEV = "https://contoso-dev.crm4.dynamics.com", PROD = "https://contoso.crm4.dynamics.com";
const panel = (id, org, extra = {}) => ({ id, url: `${EXT}?orgUrl=${encodeURIComponent(org)}&tabId=${id + 100}`, windowId: 1, ...extra });

describe("one Colvio panel per environment", () => {
  it("reads the org a panel belongs to from its URL", () => {
    expect(panelOrgOf(panel(1, DEV).url)).toBe(DEV);
    expect(panelOrgOf(EXT)).toBe(null);
    expect(panelOrgOf("not a url")).toBe(null);
  });
  it("the icon on a DEV tab brings the DEV panel and never touches the PROD one", () => {
    const panels = [panel(1, PROD), panel(2, DEV)];
    expect(pickPanel(panels, DEV)?.id).toBe(2);
    expect(pickPanel(panels, PROD)?.id).toBe(1);
    expect(pickPanel(panels, "https://other.crm.dynamics.com")).toBe(null); // → a new panel
    expect(pickPanel([{ id: 3, url: EXT }], DEV)).toBe(null); // a panel without org is nobody's
    expect(pickPanel(panels, null)).toBe(null);
  });
  it("two panels of one environment: the clicked window's first, then the one used last", () => {
    const panels = [panel(1, DEV, { windowId: 2, lastAccessed: 900 }), panel(2, DEV, { windowId: 1, lastAccessed: 100 }), panel(3, DEV, { windowId: 1, lastAccessed: 500 })];
    expect(pickPanel(panels, DEV, 1).id).toBe(3);
    expect(pickPanel(panels, DEV, 2).id).toBe(1);
    expect(pickPanel(panels, DEV, 9).id).toBe(1);
  });
  it("relay candidates: the tab Colvio was last opened from, then the panel's, then the last registered — no repeats", () => {
    expect(relayCandidates(7, 5, 7)).toEqual([7, 5]);
    expect(relayCandidates(null, 5, undefined, 0)).toEqual([5, 0]);
    expect(relayCandidates(null, null)).toEqual([]);
  });
});
