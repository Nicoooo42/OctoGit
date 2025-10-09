import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ENCRYPTION_KEY = process.env.GITLAB_ENCRYPTION_KEY || "default-key-change-in-production-32"; // Must be 32 chars for AES-256
const ALGORITHM = "aes-256-cbc";
const IV_LENGTH = 16;

export class GitLabStore {
  private configPath: string;

  constructor(storageDir: string) {
    this.configPath = path.join(storageDir, "gitlab-config.json");
  }

  private encrypt(text: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const key = Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').substring(0, 32));
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");
    return iv.toString("hex") + ":" + encrypted;
  }

  private decrypt(text: string): string {
    const parts = text.split(":");
    if (parts.length !== 2) {
      throw new Error("Invalid encrypted data format");
    }
    const iv = Buffer.from(parts[0], "hex");
    const encryptedText = parts[1];
    const key = Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').substring(0, 32));
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encryptedText, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  }

  private ensureConfigFile() {
    if (!fs.existsSync(this.configPath)) {
      fs.writeFileSync(this.configPath, JSON.stringify({}), "utf8");
    }
  }

  setConfig(key: string, value: string): void {
    this.ensureConfigFile();
    const config = this.readConfig();
    
    // Encrypt sensitive data like token
    if (key === "token") {
      config[key] = this.encrypt(value);
    } else {
      config[key] = value;
    }
    
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), "utf8");
  }

  getConfig(key: string): string {
    this.ensureConfigFile();
    const config = this.readConfig();
    const value = config[key];
    
    if (!value) {
      return "";
    }
    
    // Decrypt sensitive data like token
    if (key === "token") {
      try {
        return this.decrypt(value);
      } catch (error) {
        console.error("Error decrypting token:", error);
        return "";
      }
    }
    
    return value;
  }

  private readConfig(): Record<string, string> {
    try {
      const content = fs.readFileSync(this.configPath, "utf8");
      return JSON.parse(content);
    } catch (error) {
      return {};
    }
  }

  clearConfig(): void {
    if (fs.existsSync(this.configPath)) {
      fs.unlinkSync(this.configPath);
    }
  }
}
