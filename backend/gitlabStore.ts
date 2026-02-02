import path from "node:path";
import crypto from "node:crypto";
import { JsonStore } from "./jsonStore.js";
import { getLogger } from "./logger.js";

const ENCRYPTION_KEY = process.env.GITLAB_ENCRYPTION_KEY || "default-key-change-in-production-32"; // Must be 32 chars for AES-256
const ALGORITHM = "aes-256-cbc";
const IV_LENGTH = 16;
const SENSITIVE_KEYS = new Set(["token", "password", "secret"]);
const VALID_KEYS = new Set(["url", "token", "default_project_id"]);
const logger = getLogger("GitLabStore");

/**
 * Persists GitLab configuration values on disk with token encryption.
 */
export class GitLabStore extends JsonStore<Record<string, string>> {
  constructor(storageDir: string) {
    super(path.join(storageDir, "gitlab-config.json"));
    logger.debug({ configPath: this.configPath }, "GitLabStore initialized");
  }

  /**
   * Derives a consistent encryption key from the configured secret.
   */
  private getEncryptionKey(): Buffer {
    // Use PBKDF2-like approach for consistent key derivation
    const baseKey = ENCRYPTION_KEY.padEnd(32, '0').substring(0, 32);
    return Buffer.from(baseKey, 'utf8');
  }

  /**
   * Checks if a key holds sensitive data requiring encryption.
   */
  private isSensitiveKey(key: string): boolean {
    return SENSITIVE_KEYS.has(key.toLowerCase());
  }

  /**
   * Encrypts sensitive values before persisting them.
   */
  private encrypt(text: string): string {
    if (!text || text.length === 0) {
      return "";
    }
    try {
      const iv = crypto.randomBytes(IV_LENGTH);
      const key = this.getEncryptionKey();
      const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
      let encrypted = cipher.update(text, "utf8", "hex");
      encrypted += cipher.final("hex");
      return `v1:${iv.toString("hex")}:${encrypted}`;
    } catch (error) {
      logger.error({ error }, "Failed to encrypt value");
      throw new Error("Échec du chiffrement de la valeur");
    }
  }

  /**
   * Decrypts persisted sensitive values.
   */
  private decrypt(text: string): string {
    if (!text || text.length === 0) {
      return "";
    }

    try {
      // Handle versioned format (v1:iv:encrypted)
      if (text.startsWith("v1:")) {
        const parts = text.split(":");
        if (parts.length !== 3) {
          throw new Error("Invalid encrypted data format (v1)");
        }
        const iv = Buffer.from(parts[1], "hex");
        const encryptedText = parts[2];
        const key = this.getEncryptionKey();
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        let decrypted = decipher.update(encryptedText, "hex", "utf8");
        decrypted += decipher.final("utf8");
        return decrypted;
      }

      // Legacy format (iv:encrypted) - for backward compatibility
      const parts = text.split(":");
      if (parts.length !== 2) {
        throw new Error("Invalid encrypted data format (legacy)");
      }
      const iv = Buffer.from(parts[0], "hex");
      const encryptedText = parts[1];
      const key = this.getEncryptionKey();
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      let decrypted = decipher.update(encryptedText, "hex", "utf8");
      decrypted += decipher.final("utf8");
      return decrypted;
    } catch (error) {
      logger.error({ error }, "Failed to decrypt value - data may be corrupted or key changed");
      throw new Error("Échec du déchiffrement - le token peut être corrompu");
    }
  }

  /**
   * Validates the URL format for GitLab instances.
   */
  private validateUrl(url: string): string {
    if (!url || url.trim().length === 0) {
      return "https://gitlab.com";
    }
    
    const trimmed = url.trim();
    
    // Ensure URL has a protocol
    let normalizedUrl = trimmed;
    if (!normalizedUrl.startsWith("http://") && !normalizedUrl.startsWith("https://")) {
      normalizedUrl = `https://${normalizedUrl}`;
    }
    
    try {
      const parsed = new URL(normalizedUrl);
      // Remove trailing slashes and paths to get base URL
      return `${parsed.protocol}//${parsed.host}`;
    } catch {
      logger.warn({ url }, "Invalid GitLab URL format, using default");
      return "https://gitlab.com";
    }
  }

  /**
   * Stores a GitLab configuration value, encrypting sensitive data.
   */
  setConfig(key: string, value: string): void {
    if (!key || key.trim().length === 0) {
      logger.warn("Attempted to set config with empty key");
      return;
    }

    const normalizedKey = key.trim().toLowerCase();
    
    // Validate known keys
    if (!VALID_KEYS.has(normalizedKey)) {
      logger.warn({ key: normalizedKey }, "Setting unknown GitLab config key");
    }

    this.ensureConfigFile();
    const config = this.readConfig();
    
    // Handle URL validation
    if (normalizedKey === "url") {
      config[normalizedKey] = this.validateUrl(value);
      logger.debug({ key: normalizedKey }, "GitLab config URL set");
    }
    // Encrypt sensitive data
    else if (this.isSensitiveKey(normalizedKey)) {
      config[normalizedKey] = value ? this.encrypt(value) : "";
      logger.debug({ key: normalizedKey }, "GitLab config (encrypted) set");
    } else {
      config[normalizedKey] = value ?? "";
      logger.debug({ key: normalizedKey }, "GitLab config set");
    }
    
    this.writeConfig(config);
  }

  /**
   * Retrieves a GitLab configuration value, decrypting sensitive data if needed.
   */
  getConfig(key: string): string {
    if (!key || key.trim().length === 0) {
      return "";
    }

    const normalizedKey = key.trim().toLowerCase();
    this.ensureConfigFile();
    const config = this.readConfig();
    const value = config[normalizedKey];
    
    if (!value || value.length === 0) {
      // Return sensible defaults
      if (normalizedKey === "url") {
        return "https://gitlab.com";
      }
      return "";
    }
    
    // Decrypt sensitive data
    if (this.isSensitiveKey(normalizedKey)) {
      try {
        return this.decrypt(value);
      } catch (error) {
        logger.error({ error, key: normalizedKey }, "Failed to decrypt GitLab config value");
        return "";
      }
    }
    
    return value;
  }

  /**
   * Checks if a valid token is configured.
   */
  hasToken(): boolean {
    const token = this.getConfig("token");
    return token.length > 0;
  }

  /**
   * Returns all non-sensitive configuration for debugging purposes.
   */
  getPublicConfig(): Record<string, string> {
    this.ensureConfigFile();
    const config = this.readConfig();
    const publicConfig: Record<string, string> = {};
    
    for (const [key, value] of Object.entries(config)) {
      if (this.isSensitiveKey(key)) {
        publicConfig[key] = value ? "[CONFIGURED]" : "[NOT SET]";
      } else {
        publicConfig[key] = value;
      }
    }
    
    return publicConfig;
  }
}
