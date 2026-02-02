import path from "node:path";
import { JsonStore } from "./jsonStore.js";

/**
 * Persists Copilot configuration values on disk.
 */
export class CopilotStore extends JsonStore<Record<string, unknown>> {
  constructor(storageDir: string) {
    super(path.join(storageDir, "copilot-config.json"));
  }

  /**
   * Stores a Copilot configuration value by key.
   */
  setConfig(key: string, value: string) {
    this.ensureConfigFile();
    const config = this.readConfig();
    config[key] = value;
    this.writeConfig(config);
  }

  /**
   * Retrieves a Copilot configuration value as a string (empty when unset).
   */
  getConfig(key: string): string {
    this.ensureConfigFile();
    const config = this.readConfig();
    const value = config[key];
    return typeof value === "string" ? value : value != null ? String(value) : "";
  }
}