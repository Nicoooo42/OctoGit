import fs from "node:fs";
import path from "node:path";

/**
 * Small utility base class to persist simple JSON configuration dictionaries on disk.
 * Subclasses can focus on their domain-specific behavior while inheriting basic
 * file management (creation, reading, writing and clearing).
 */
export abstract class JsonStore<T extends Record<string, unknown> = Record<string, unknown>> {
  protected constructor(protected readonly configPath: string) {
    const directory = path.dirname(configPath);
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true });
    }
  }

  /**
   * Ensures the configuration file exists on disk.
   */
  protected ensureConfigFile(): void {
    if (!fs.existsSync(this.configPath)) {
      fs.writeFileSync(this.configPath, JSON.stringify({}), "utf8");
    }
  }

  /**
   * Reads the current configuration snapshot from disk.
   */
  protected readConfig(): T {
    try {
      const contents = fs.readFileSync(this.configPath, "utf8");
      return JSON.parse(contents) as T;
    } catch (error) {
      return {} as T;
    }
  }

  /**
   * Writes the provided configuration snapshot to disk.
   */
  protected writeConfig(config: T): void {
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), "utf8");
  }

  /**
   * Deletes the configuration file if it exists.
   */
  clearConfig(): void {
    if (fs.existsSync(this.configPath)) {
      fs.unlinkSync(this.configPath);
    }
  }
}
