import fs from "node:fs";
import path from "node:path";

export class AppStore {
  private readonly configPath: string;

  constructor(storageDir: string) {
    this.configPath = path.join(storageDir, "app-config.json");
  }

  private ensureConfigFile() {
    if (!fs.existsSync(this.configPath)) {
      fs.writeFileSync(this.configPath, JSON.stringify({}), "utf8");
    }
  }

  setConfig(key: string, value: string) {
    this.ensureConfigFile();
    const config = this.readConfig();
    config[key] = value;
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), "utf8");
  }

  getConfig(key: string): string {
    this.ensureConfigFile();
    const config = this.readConfig();
    const value = config[key];
    return typeof value === "string" ? value : value != null ? String(value) : "";
  }

  clearConfig() {
    if (fs.existsSync(this.configPath)) {
      fs.unlinkSync(this.configPath);
    }
  }

  private readConfig(): Record<string, unknown> {
    try {
      const content = fs.readFileSync(this.configPath, "utf8");
      return JSON.parse(content) as Record<string, unknown>;
    } catch (error) {
      return {};
    }
  }
}