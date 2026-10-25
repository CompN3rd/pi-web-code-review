import type { PluginCapability, StylesheetIntegrationCapabilityV1 } from "@jmfederico/pi-web/plugin-api";

function isStyles(value: unknown): value is StylesheetIntegrationCapabilityV1 {
  return typeof value === "object" && value !== null
    && "registerRoot" in value && typeof value.registerRoot === "function"
    && "createController" in value && typeof value.createController === "function"
    && "subscribe" in value && typeof value.subscribe === "function";
}

export const stylesheetIntegration: PluginCapability<StylesheetIntegrationCapabilityV1> = {
  pluginId: "pi-web", id: "stylesheet-integration", version: 1,
  parse(value) {
    if (!isStyles(value)) {
      throw new Error("Code Review requires stylesheet-integration v1");
    }
    return value;
  },
};
