import type { GitLabStore } from "./gitlabStore.js";

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

export class GitLabService {
  constructor(private readonly gitlabStore: GitLabStore) {}

  private getBaseUrl(): string {
    return this.gitlabStore.getConfig("url") || "https://gitlab.com";
  }

  private getToken(): string {
    const token = this.gitlabStore.getConfig("token");
    if (!token) {
      throw new Error("Token GitLab non configuré. Veuillez le configurer dans les paramètres.");
    }
    return token;
  }

  private async fetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const baseUrl = this.getBaseUrl();
    const token = this.getToken();
    
    const url = `${baseUrl}/api/v4${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        "PRIVATE-TOKEN": token,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GitLab API error (${response.status}): ${errorText}`);
    }

    return response.json() as Promise<T>;
  }

  async getCurrentUser() {
    return this.fetch<{ id: number; name: string; username: string; email: string }>("/user");
  }

  async getProjects(page = 1, perPage = 20): Promise<GitLabProject[]> {
    return this.fetch<GitLabProject[]>(`/projects?membership=true&page=${page}&per_page=${perPage}`);
  }

  async getProject(projectId: number): Promise<GitLabProject> {
    return this.fetch<GitLabProject>(`/projects/${projectId}`);
  }

  async getMergeRequests(projectId: number, state = "opened"): Promise<GitLabMergeRequest[]> {
    return this.fetch<GitLabMergeRequest[]>(`/projects/${projectId}/merge_requests?state=${state}`);
  }

  async createMergeRequest(
    projectId: number,
    sourceBranch: string,
    targetBranch: string,
    title: string,
    description?: string
  ): Promise<GitLabMergeRequest> {
    return this.fetch<GitLabMergeRequest>(`/projects/${projectId}/merge_requests`, {
      method: "POST",
      body: JSON.stringify({
        source_branch: sourceBranch,
        target_branch: targetBranch,
        title,
        description,
      }),
    });
  }

  async testConnection(): Promise<{ success: boolean; user?: { name: string; username: string; email: string }; error?: string }> {
    try {
      const user = await this.getCurrentUser();
      return {
        success: true,
        user: {
          name: user.name,
          username: user.username,
          email: user.email,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
