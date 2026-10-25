// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultPreferences, preferencesKey, readPreferences, writePreferences } from "../src/browser/preferences.js";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); });

describe("review preferences", () => {
  it("uses independent defaults without any stored setting", () => {
    expect(readPreferences()).toEqual(defaultPreferences);
    expect(readPreferences()).not.toBe(defaultPreferences);
  });
  it.each(["{", "null", '"focus"', '{"layout":"other","wrapCode":true}', '{"layout":"focus","wrapCode":"true"}'])("ignores malformed settings %s", (value) => {
    localStorage.setItem(preferencesKey, value);
    expect(readPreferences()).toEqual(defaultPreferences);
  });
  it("round trips preferences without touching review data", () => {
    localStorage.setItem("pi-web-code-review:v1:legacy", "keep");
    writePreferences({ layout: "focus", wrapCode: false });
    expect(readPreferences()).toEqual({ layout: "focus", wrapCode: false });
    expect(localStorage.getItem("pi-web-code-review:v1:legacy")).toBe("keep");
  });
  it("falls back when local storage reads are blocked and reports failed writes to callers", () => {
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } });
    expect(readPreferences()).toEqual(defaultPreferences);
    expect(() => { writePreferences(defaultPreferences); }).toThrow("blocked");
  });
});
