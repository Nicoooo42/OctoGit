/// <reference types="vite/client" />

import type {
  BranchInfo,
  CommitDetails,
  CommitGraphData,
  RecentRepository,
  RepoSummary,
  BackendResponse
} from "../shared/git";

interface RepoSnapshot {
  repo: RepoSummary;
  commits: CommitGraphData;
  branches: BranchInfo[];
}

declare global {
  interface Window {
    BciGit: {
      getRecentRepositories(): Promise<BackendResponse<RecentRepository[]>>;
      openRepositoryDialog(): Promise<BackendResponse<RepoSnapshot>>;
      openRepository(path: string): Promise<BackendResponse<RepoSnapshot>>;
      getBranches(): Promise<BackendResponse<BranchInfo[]>>;
      getCommitGraph(): Promise<BackendResponse<CommitGraphData>>;
      getCommitDetails(hash: string): Promise<BackendResponse<CommitDetails>>;
      getDiff(hash: string, filePath: string): Promise<BackendResponse<string>>;
      getWorkingDirStatus(): Promise<BackendResponse<unknown>>;
      commit(message: string): Promise<BackendResponse<unknown>>;
      checkout(branch: string): Promise<BackendResponse<unknown>>;
      createBranch(name: string, base?: string): Promise<BackendResponse<unknown>>;
      deleteBranch(name: string, force?: boolean): Promise<BackendResponse<unknown>>;
      pull(remote?: string, branch?: string): Promise<BackendResponse<unknown>>;
      push(remote?: string, branch?: string): Promise<BackendResponse<unknown>>;
      fetch(remote?: string): Promise<BackendResponse<unknown>>;
      merge(branch: string): Promise<BackendResponse<unknown>>;
      cherryPick(hash: string): Promise<BackendResponse<unknown>>;
      rebase(onto: string): Promise<BackendResponse<unknown>>;
  squashCommits(commits: string[], message: string): Promise<BackendResponse<unknown>>;
  dropCommits(commits: string[]): Promise<BackendResponse<unknown>>;
      stash(message?: string): Promise<BackendResponse<unknown>>;
      stashPop(): Promise<BackendResponse<unknown>>;
      stashList(): Promise<BackendResponse<unknown>>;
      stageHunk(filePath: string, hunk: string): Promise<BackendResponse<unknown>>;
      discardHunk(filePath: string, hunk: string): Promise<BackendResponse<unknown>>;
  unstageHunk(filePath: string, hunk: string): Promise<BackendResponse<unknown>>;
      unstageFile(filePath: string): Promise<BackendResponse<unknown>>;
      stageFile(filePath: string): Promise<BackendResponse<unknown>>;
      minimizeWindow(): Promise<void>;
      maximizeWindow(): Promise<void>;
      closeWindow(): Promise<void>;
      moveWindow(x: number, y: number): Promise<void>;
    };
  }
}
