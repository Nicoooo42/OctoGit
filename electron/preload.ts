import { contextBridge, ipcRenderer } from "electron";
import type {
  BackendResponse,
  BranchInfo,
  TagInfo,
  CommitDetails,
  CommitGraphData,
  MergeConflictFile,
  RecentRepository,
  RepoSummary
} from "../shared/git.js";

type Response<T> = Promise<BackendResponse<T>>;

type RepoSnapshot = {
  repo: RepoSummary;
  commits: CommitGraphData;
  branches: BranchInfo[];
};

const api = {
  getRecentRepositories(): Response<RecentRepository[]> {
    return ipcRenderer.invoke("app:get-recents");
  },
  openRepositoryDialog(): Response<RepoSnapshot> {
    return ipcRenderer.invoke("dialog:open-repository");
  },
  openRepository(path: string): Response<RepoSnapshot> {
    return ipcRenderer.invoke("repo:open", path);
  },
  getBranches(): Response<BranchInfo[]> {
    return ipcRenderer.invoke("repo:branches");
  },
  getTags(): Response<TagInfo[]> {
    return ipcRenderer.invoke("repo:tags");
  },
  getCommitGraph(): Response<CommitGraphData> {
    return ipcRenderer.invoke("repo:commits");
  },
  getCommitDetails(hash: string): Response<CommitDetails> {
    return ipcRenderer.invoke("repo:commit-details", hash);
  },
  getDiff(hash: string, filePath: string): Response<string> {
    return ipcRenderer.invoke("repo:diff", { hash, filePath });
  },
  getWorkingDirStatus(): Response<unknown> {
    return ipcRenderer.invoke("repo:working-dir-status");
  },
  getMergeConflicts(): Response<MergeConflictFile[]> {
    return ipcRenderer.invoke("repo:merge-conflicts");
  },
  commit(message: string): Response<unknown> {
    return ipcRenderer.invoke("repo:commit", message);
  },
  checkout(branch: string): Response<unknown> {
    return ipcRenderer.invoke("repo:checkout", branch);
  },
  createBranch(name: string, base?: string): Response<unknown> {
    return ipcRenderer.invoke("repo:create-branch", { name, base });
  },
  deleteBranch(name: string, force?: boolean): Response<unknown> {
    return ipcRenderer.invoke("repo:delete-branch", { name, force });
  },
  pull(remote?: string, branch?: string): Response<unknown> {
    return ipcRenderer.invoke("repo:pull", { remote, branch });
  },
  push(remote?: string, branch?: string): Response<unknown> {
    return ipcRenderer.invoke("repo:push", { remote, branch });
  },
  fetch(remote?: string): Response<unknown> {
    return ipcRenderer.invoke("repo:fetch", remote);
  },
  merge(branch: string): Response<unknown> {
    return ipcRenderer.invoke("repo:merge", branch);
  },
  cherryPick(hash: string): Response<unknown> {
    return ipcRenderer.invoke("repo:cherry-pick", hash);
  },
  rebase(onto: string): Response<unknown> {
    return ipcRenderer.invoke("repo:rebase", onto);
  },
  squashCommits(commits: string[], message: string): Response<unknown> {
    return ipcRenderer.invoke("repo:squash-commits", { commits, message });
  },
  dropCommits(commits: string[]): Response<unknown> {
    return ipcRenderer.invoke("repo:drop-commits", { commits });
  },
  stash(message?: string): Response<unknown> {
    return ipcRenderer.invoke("repo:stash", message);
  },
  stashPop(): Response<unknown> {
    return ipcRenderer.invoke("repo:stash-pop");
  },
  stashList(): Response<unknown> {
    return ipcRenderer.invoke("repo:stash-list");
  },
  stageHunk(filePath: string, hunk: string): Response<unknown> {
    return ipcRenderer.invoke("repo:stage-hunk", { filePath, hunk });
  },
  discardHunk(filePath: string, hunk: string): Response<unknown> {
    return ipcRenderer.invoke("repo:discard-hunk", { filePath, hunk });
  },
  unstageHunk(filePath: string, hunk: string): Response<unknown> {
    return ipcRenderer.invoke("repo:unstage-hunk", { filePath, hunk });
  },
  unstageFile(filePath: string): Response<unknown> {
    return ipcRenderer.invoke("repo:unstage-file", { filePath });
  },
  stageFile(filePath: string): Response<unknown> {
    return ipcRenderer.invoke("repo:stage-file", { filePath });
  },
  resolveConflict(filePath: string, strategy: "ours" | "theirs"): Response<unknown> {
    return ipcRenderer.invoke("repo:resolve-conflict", { filePath, strategy });
  },
  saveConflictResolution(filePath: string, content: string, stage?: boolean): Response<unknown> {
    return ipcRenderer.invoke("repo:save-conflict-resolution", { filePath, content, stage });
  },
  getGitConfig(key: string): Response<string> {
    return ipcRenderer.invoke("config:get", { key });
  },
  setGitConfig(key: string, value: string, global?: boolean): Response<unknown> {
    return ipcRenderer.invoke("config:set", { key, value, global });
  },
  getGitLabConfig(key: string): Response<string> {
    return ipcRenderer.invoke("gitlab:get-config", { key });
  },
  setGitLabConfig(key: string, value: string): Response<unknown> {
    return ipcRenderer.invoke("gitlab:set-config", { key, value });
  },
  clearGitLabConfig(): Response<unknown> {
    return ipcRenderer.invoke("gitlab:clear-config");
  },
  testGitLabConnection(): Response<{ success: boolean; user?: { name: string; username: string; email: string }; error?: string }> {
    return ipcRenderer.invoke("gitlab:test-connection");
  },
  getGitLabProjects(page?: number, perPage?: number): Response<unknown> {
    return ipcRenderer.invoke("gitlab:get-projects", { page, perPage });
  },
  getGitLabMergeRequests(projectId: number, state?: string): Response<unknown> {
    return ipcRenderer.invoke("gitlab:get-merge-requests", { projectId, state });
  },
  createGitLabMergeRequest(projectId: number, sourceBranch: string, targetBranch: string, title: string, description?: string): Response<unknown> {
    return ipcRenderer.invoke("gitlab:create-merge-request", { projectId, sourceBranch, targetBranch, title, description });
  },
  cloneRepository(repoUrl: string, localPath: string): Response<RepoSnapshot> {
    return ipcRenderer.invoke("repo:clone", { repoUrl, localPath });
  },
  getCopilotConfig(key: string): Response<string> {
    return ipcRenderer.invoke("copilot:get-config", { key });
  },
  setCopilotConfig(key: string, value: string): Response<unknown> {
    return ipcRenderer.invoke("copilot:set-config", { key, value });
  },
  clearCopilotConfig(): Response<unknown> {
    return ipcRenderer.invoke("copilot:clear-config");
  },
  generateCommitMessage(): Response<{ title: string; description: string }> {
    return ipcRenderer.invoke("copilot:generate-commit-message");
  },
  generateBranchNameSuggestions(): Response<string[]> {
    return ipcRenderer.invoke("copilot:generate-branch-name-suggestions");
  },
  suggestGitCommand(prompt: string): Response<{ command: string; explanation: string; isGlobal: boolean; requiresRepo: boolean; warnings: string[] }> {
    return ipcRenderer.invoke("copilot:suggest-git-command", { prompt });
  },
  executeGitCommand(command: string): Response<{ command: string; stdout: string; stderr: string; exitCode: number | null; durationMs: number; isGlobal: boolean }> {
    return ipcRenderer.invoke("git:execute-command", { command });
  },
  clearAiTerminalSession(): Response<unknown> {
    return ipcRenderer.invoke("ai-terminal:clear-session");
  },
  startCopilotServer(port: number): Response<{ started: boolean; pid?: number; message?: string }> {
    return ipcRenderer.invoke("copilot:start-server", { port });
  },
  stopCopilotServer(): Response<{ stopped: boolean; pid?: number; message?: string }> {
    return ipcRenderer.invoke("copilot:stop-server");
  },
  getAppConfig(key: string): Response<string> {
    return ipcRenderer.invoke("app:get-config", { key });
  },
  setAppConfig(key: string, value: string): Response<unknown> {
    return ipcRenderer.invoke("app:set-config", { key, value });
  },
  clearAppConfig(): Response<unknown> {
    return ipcRenderer.invoke("app:clear-config");
  },
  onPeriodicFetch(handler: (payload: { success: boolean; error?: string }) => void): () => void {
    const listener = (_event: Electron.IpcRendererEvent, payload: { success: boolean; error?: string }) => {
      handler(payload);
    };
    ipcRenderer.on("repo:periodic-fetch", listener);
    return () => {
      ipcRenderer.removeListener("repo:periodic-fetch", listener);
    };
  },
  minimizeWindow(): Promise<void> {
    return ipcRenderer.invoke("window:minimize");
  },
  maximizeWindow(): Promise<void> {
    return ipcRenderer.invoke("window:maximize");
  },
  closeWindow(): Promise<void> {
    return ipcRenderer.invoke("window:close");
  },
  moveWindow(x: number, y: number): Promise<void> {
    return ipcRenderer.invoke("window:move", { x, y });
  }
};
