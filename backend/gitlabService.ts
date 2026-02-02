import type { GitLabStore } from "./gitlabStore.js";
import { getLogger } from "./logger.js";

const logger = getLogger("GitLabService");
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1_000;

export interface GitLabProject {
  id: number;
  name: string;
  path_with_namespace: string;
  web_url: string;
  description: string | null;
  default_branch: string;
}

export interface GitLabMergeRequest {
  id: number;
  iid: number;
  title: string;
  description: string;
  state: string;
  web_url: string;
  source_branch: string;
  target_branch: string;
  author: {
    name: string;
    username: string;
  };
}

/**
 * Wraps GitLab API interactions for project and merge request workflows.
 */
export class GitLabService {
  constructor(private readonly gitlabStore: GitLabStore) {}

  /**
   * Resolves the configured GitLab base URL, ensuring no trailing slash.
   */
  private getBaseUrl(): string {
    const url = this.gitlabStore.getConfig("url") || "https://gitlab.com";
    return url.replace(/\/+$/, "");
  }

  /**
   * Retrieves the GitLab token or throws when missing.
   */
  private getToken(): string {
    const token = this.gitlabStore.getConfig("token");
    if (!token || token.trim().length === 0) {
      throw new Error("Token GitLab non configuré. Veuillez le configurer dans les paramètres.");
    }
    return token.trim();
  }

  /**
   * Validates that the token has a reasonable format.
   */
  private validateToken(token: string): void {
    // GitLab tokens are typically 20+ characters
    if (token.length < 10) {
      throw new Error("Le token GitLab semble invalide (trop court).");
    }
    // Check for obvious placeholder values
    if (/^(xxx|test|token|placeholder)/i.test(token)) {
      throw new Error("Le token GitLab semble être une valeur de test.");
    }
  }

  /**
   * Delays execution for the specified milliseconds.
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Determines if an error is retryable (network issues, rate limiting, etc.).
   */
  private isRetryableError(error: unknown, status?: number): boolean {
    // Retry on network errors
    if (error instanceof TypeError && error.message.includes("fetch")) {
      return true;
    }
    // Retry on server errors or rate limiting
    if (status && (status === 429 || (status >= 500 && status < 600))) {
      return true;
    }
    return false;
  }

  /**
   * Performs an authenticated GitLab API request with timeout and retry.
   */
  private async fetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const baseUrl = this.getBaseUrl();
    const token = this.getToken();
    this.validateToken(token);
    
    const url = `${baseUrl}/api/v4${endpoint}`;
    logger.debug({ url, method: options.method || "GET" }, "GitLab API request");

    let lastError: Error | null = null;
    let lastStatus: number | undefined;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        logger.info({ attempt, maxRetries: MAX_RETRIES }, "Retrying GitLab API request");
        await this.delay(RETRY_DELAY_MS * attempt);
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
          headers: {
            "PRIVATE-TOKEN": token,
            "Content-Type": "application/json",
            ...options.headers,
          },
        });

        clearTimeout(timeoutId);
        lastStatus = response.status;

        if (!response.ok) {
          const errorText = await response.text();
          const error = new Error(`GitLab API error (${response.status}): ${errorText}`);
          
          if (this.isRetryableError(error, response.status) && attempt < MAX_RETRIES) {
            lastError = error;
            continue;
          }
          
          logger.error({ status: response.status, errorText, url }, "GitLab API error");
          throw error;
        }

        const data = await response.json() as T;
        logger.debug({ url, status: response.status }, "GitLab API request successful");
        return data;
      } catch (error) {
        clearTimeout(timeoutId);

        if (error instanceof Error && error.name === "AbortError") {
          lastError = new Error(`GitLab API timeout après ${DEFAULT_TIMEOUT_MS / 1000} secondes`);
          if (attempt < MAX_RETRIES) {
            continue;
          }
          throw lastError;
        }

        if (this.isRetryableError(error, lastStatus) && attempt < MAX_RETRIES) {
          lastError = error instanceof Error ? error : new Error(String(error));
          continue;
        }

        throw error;
      }
    }

    throw lastError ?? new Error("GitLab API request failed after retries");
  }

  /**
   * Retrieves the currently authenticated GitLab user.
   */
  async getCurrentUser() {
    return this.fetch<{ id: number; name: string; username: string; email: string }>("/user");
  }

  /**
   * Retrieves accessible GitLab projects for the user.
   */
  async getProjects(page = 1, perPage = 20): Promise<GitLabProject[]> {
    const params = new URLSearchParams({
      membership: "true",
      page: String(Math.max(1, Math.floor(page))),
      per_page: String(Math.min(100, Math.max(1, Math.floor(perPage)))),
      order_by: "last_activity_at",
      sort: "desc",
    });
    return this.fetch<GitLabProject[]>(`/projects?${params.toString()}`);
  }

  /**
   * Retrieves merge requests for a given project.
   */
  async getMergeRequests(projectId: number, state = "opened"): Promise<GitLabMergeRequest[]> {
    if (!Number.isFinite(projectId) || projectId <= 0) {
      throw new Error("ID de projet GitLab invalide");
    }
    const validStates = ["opened", "closed", "merged", "all"];
    const safeState = validStates.includes(state) ? state : "opened";
    const params = new URLSearchParams({
      state: safeState,
      order_by: "updated_at",
      sort: "desc",
    });
    return this.fetch<GitLabMergeRequest[]>(`/projects/${encodeURIComponent(projectId)}/merge_requests?${params.toString()}`);
  }

  /**
   * Creates a merge request on GitLab.
   */
  async createMergeRequest(
    projectId: number,
    sourceBranch: string,
    targetBranch: string,
    title: string,
    description?: string
  ): Promise<GitLabMergeRequest> {
    if (!Number.isFinite(projectId) || projectId <= 0) {
      throw new Error("ID de projet GitLab invalide");
    }
    if (!sourceBranch || sourceBranch.trim().length === 0) {
      throw new Error("La branche source est requise");
    }
    if (!targetBranch || targetBranch.trim().length === 0) {
      throw new Error("La branche cible est requise");
    }
    if (!title || title.trim().length === 0) {
      throw new Error("Le titre de la merge request est requis");
    }
    if (sourceBranch.trim() === targetBranch.trim()) {
      throw new Error("Les branches source et cible doivent être différentes");
    }

    logger.info({ projectId, sourceBranch, targetBranch, title }, "Creating GitLab merge request");

    return this.fetch<GitLabMergeRequest>(`/projects/${encodeURIComponent(projectId)}/merge_requests`, {
      method: "POST",
      body: JSON.stringify({
        source_branch: sourceBranch.trim(),
        target_branch: targetBranch.trim(),
        title: title.trim(),
        description: description?.trim() || undefined,
      }),
    });
  }

  /**
   * Validates GitLab connectivity and returns the current user on success.
   */
  async testConnection(): Promise<{ success: boolean; user?: { name: string; username: string; email: string }; error?: string }> {
    logger.info("Testing GitLab connection");
    try {
      const user = await this.getCurrentUser();
      logger.info({ username: user.username }, "GitLab connection successful");
      return {
        success: true,
        user: {
          name: user.name,
          username: user.username,
          email: user.email,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, "GitLab connection test failed");
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Retrieves a single project by ID.
   */
  async getProject(projectId: number): Promise<GitLabProject> {
    if (!Number.isFinite(projectId) || projectId <= 0) {
      throw new Error("ID de projet GitLab invalide");
    }
    return this.fetch<GitLabProject>(`/projects/${encodeURIComponent(projectId)}`);
  }

  /**
   * Searches projects by name.
   */
  async searchProjects(search: string, page = 1, perPage = 20): Promise<GitLabProject[]> {
    if (!search || search.trim().length === 0) {
      return this.getProjects(page, perPage);
    }
    const params = new URLSearchParams({
      membership: "true",
      search: search.trim(),
      page: String(Math.max(1, Math.floor(page))),
      per_page: String(Math.min(100, Math.max(1, Math.floor(perPage)))),
      order_by: "last_activity_at",
      sort: "desc",
    });
    return this.fetch<GitLabProject[]>(`/projects?${params.toString()}`);
  }
}
