import { contextBridge, ipcRenderer } from "electron";
import type {
  BackendResponse,
  BranchInfo,
  CommitDetails,
  CommitGraphData,
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

contextBridge.exposeInMainWorld("BciGit", api);

declare global {
  interface Window {
    BciGit: typeof api;
  }
}
