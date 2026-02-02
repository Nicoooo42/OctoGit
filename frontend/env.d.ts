/// <reference types="vite/client" />

import type {
  AiTerminalExecuteResult,
  AiTerminalSuggestion,
  BranchInfo,
  CommitDetails,
  CommitGraphData,
  MergeConflictFile,
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
      cloneRepository(url: string, destination: string): Promise<BackendResponse<RepoSnapshot>>;
      getBranches(): Promise<BackendResponse<BranchInfo[]>>;
      getCommitGraph(): Promise<BackendResponse<CommitGraphData>>;
      getCommitDetails(hash: string): Promise<BackendResponse<CommitDetails>>;
      getDiff(hash: string, filePath: string): Promise<BackendResponse<string>>;
      getWorkingDirStatus(): Promise<BackendResponse<unknown>>;
  getMergeConflicts(): Promise<BackendResponse<MergeConflictFile[]>>;
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
      getGitConfig(key: string): Promise<BackendResponse<string>>;
      setGitConfig(key: string, value: string, global?: boolean): Promise<BackendResponse<unknown>>;
      getGitLabConfig(key: string): Promise<BackendResponse<string>>;
      setGitLabConfig(key: string, value: string): Promise<BackendResponse<unknown>>;
      clearGitLabConfig(): Promise<BackendResponse<unknown>>;
      testGitLabConnection(): Promise<BackendResponse<{ success: boolean; user?: { name: string; username: string; email: string }; error?: string }>>;
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
      resolveConflict(filePath: string, strategy: "ours" | "theirs"): Promise<BackendResponse<unknown>>;
      saveConflictResolution(filePath: string, content: string, stage?: boolean): Promise<BackendResponse<unknown>>;
      getCopilotConfig(key: string): Promise<BackendResponse<string>>;
      setCopilotConfig(key: string, value: string): Promise<BackendResponse<unknown>>;
      clearCopilotConfig(): Promise<BackendResponse<unknown>>;
      generateCommitMessage(): Promise<BackendResponse<{ title: string; description: string }>>;
      generateBranchNameSuggestions(): Promise<BackendResponse<string[]>>;
      suggestGitCommand(prompt: string): Promise<BackendResponse<AiTerminalSuggestion>>;
      executeGitCommand(command: string): Promise<BackendResponse<AiTerminalExecuteResult>>;
      clearAiTerminalSession(): Promise<BackendResponse<unknown>>;
      startCopilotServer(port: number): Promise<BackendResponse<{ started: boolean; pid?: number; message?: string }>>;
      stopCopilotServer(): Promise<BackendResponse<{ stopped: boolean; pid?: number; message?: string }>>;
      getAppConfig(key: string): Promise<BackendResponse<string>>;
      setAppConfig(key: string, value: string): Promise<BackendResponse<unknown>>;
      clearAppConfig(): Promise<BackendResponse<unknown>>;
      onPeriodicFetch(handler: (payload: { success: boolean; error?: string }) => void): () => void;
      minimizeWindow(): Promise<void>;
      maximizeWindow(): Promise<void>;
      closeWindow(): Promise<void>;
      moveWindow(x: number, y: number): Promise<void>;
    };
  }
}
