export type ReviewLayout = "workbench" | "focus";
export interface ReviewPreferences { layout: ReviewLayout; wrapCode: boolean }
export const preferencesKey = "pi-web-code-review:preferences:v1";
export const defaultPreferences: ReviewPreferences = { layout: "workbench", wrapCode: true };

export function readPreferences(): ReviewPreferences {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(preferencesKey) ?? "null");
    if (typeof value === "object" && value !== null && "layout" in value && "wrapCode" in value
      && (value.layout === "workbench" || value.layout === "focus") && typeof value.wrapCode === "boolean") {
      return { layout: value.layout, wrapCode: value.wrapCode };
    }
  } catch { /* Unavailable or corrupt preferences must not block review storage or rendering. */ }
  return { ...defaultPreferences };
}

export function writePreferences(value: ReviewPreferences): void {
  localStorage.setItem(preferencesKey, JSON.stringify(value));
}
