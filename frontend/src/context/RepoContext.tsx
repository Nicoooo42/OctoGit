import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import type {
  BranchInfo,
  CommitDetails,
  CommitGraphData,
  RecentRepository,
  RepoSummary,
  MergeConflictFile
} from "../types/git";
import { unwrap } from "../utils/ipc";

export type DiffScope = "commit" | "working" | "staged";

type DiffState = {
  file: string;
  content: string;
  scope: DiffScope;
} | null;

const IPC_UNAVAILABLE_MESSAGE =
  "L'API BciGit n'est pas disponible. Assurez-vous de lancer l'application via Electron (npm run dev ou npm run build).";

function getBciGitApi() {
  if (typeof window === "undefined" || !window.BciGit) {
    throw new Error(IPC_UNAVAILABLE_MESSAGE);
  }
  return window.BciGit;
}

type RepoContextValue = {
  repo: RepoSummary | null;
  branches: BranchInfo[];
  graph: CommitGraphData | null;
  recents: RecentRepository[];
  loading: boolean;
  error: string | null;
  selectedCommit: string | null;
  selectedCommits: string[];
  commitDetails: CommitDetails | null;
  diff: DiffState;
  workingDirStatus: any;
  conflicts: MergeConflictFile[];
  clearError: () => void;
  fetchRecents: () => Promise<void>;
  openRepoFromDialog: () => Promise<boolean>;
  openRepoAtPath: (repoPath: string) => Promise<boolean>;
  refreshAll: () => Promise<void>;
  selectCommit: (hash: string | null, options?: { preserveMultiSelection?: boolean }) => Promise<void>;
  setSelectedCommits: (hashes: string[]) => void;
  loadDiff: (filePath: string, options?: { scope?: DiffScope }) => Promise<void>;
  getWorkingDirStatus: () => Promise<unknown>;
  commit: (message: string) => Promise<void>;
  checkout: (branch: string) => Promise<void>;
  createBranch: (name: string, base?: string) => Promise<void>;
  deleteBranch: (name: string, force?: boolean) => Promise<void>;
  pull: (remote?: string, branch?: string) => Promise<void>;
  push: (remote?: string, branch?: string) => Promise<void>;
  fetch: (remote?: string) => Promise<void>;
  merge: (branch: string) => Promise<void>;
  cherryPick: (hash: string) => Promise<void>;
  rebase: (onto: string) => Promise<void>;
  squashCommits: (commits: string[], message: string) => Promise<void>;
  dropCommits: (commits: string[]) => Promise<void>;
  stash: (message?: string) => Promise<void>;
  stashPop: () => Promise<void>;
  stashList: () => Promise<unknown>;
  stageHunk: (filePath: string, hunk: string) => Promise<void>;
  discardHunk: (filePath: string, hunk: string) => Promise<void>;
  unstageHunk: (filePath: string, hunk: string) => Promise<void>;
  unstageFile: (filePath: string) => Promise<void>;
  stageFile: (filePath: string) => Promise<void>;
  loadConflicts: () => Promise<void>;
  resolveConflict: (filePath: string, strategy: "ours" | "theirs") => Promise<void>;
  saveConflictResolution: (
    filePath: string,
    content: string,
    options?: { stage?: boolean }
  ) => Promise<void>;
};

const RepoContext = createContext<RepoContextValue | undefined>(undefined);

export const RepoProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [repo, setRepo] = useState<RepoSummary | null>(null);
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [graph, setGraph] = useState<CommitGraphData | null>(null);
  const [recents, setRecents] = useState<RecentRepository[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null);
  const [selectedCommits, setSelectedCommitsState] = useState<string[]>([]);
  const [commitDetails, setCommitDetails] = useState<CommitDetails | null>(null);
  const [diff, setDiff] = useState<DiffState>(null);
  const [workingDirStatus, setWorkingDirStatus] = useState<any>(null);
  const [conflicts, setConflicts] = useState<MergeConflictFile[]>([]);

  const handleError = useCallback((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    setError(message);
    console.error(`[BciGit]`, err);
  }, []);

  const selectCommitInternal = useCallback(
    async (hash: string | null, updateSelection = true) => {
      if (!hash) {
        setSelectedCommit(null);
        setCommitDetails(null);
        setDiff(null);
        return;
      }

      try {
  const details = await unwrap(getBciGitApi().getCommitDetails(hash));
        if (updateSelection) {
          setSelectedCommit(hash);
        }
        setCommitDetails(details);
        setDiff(null);
      } catch (err) {
        handleError(err);
      }
    },
    [handleError]
  );

  const loadSnapshot = useCallback(
    async (snapshot: {
      repo: RepoSummary;
      commits: CommitGraphData;
      branches: BranchInfo[];
    }) => {
      setRepo(snapshot.repo);
      setGraph(snapshot.commits);
      setBranches(snapshot.branches);
      setConflicts([]);
      const initialHash = snapshot.commits.nodes[0]?.hash ?? null;
      setSelectedCommit(initialHash);
      setSelectedCommitsState(initialHash ? [initialHash] : []);
      if (initialHash) {
        await selectCommitInternal(initialHash, false);
      } else {
        setCommitDetails(null);
        setDiff(null);
      }
    },
    [selectCommitInternal]
  );

  const fetchRecents = useCallback(async () => {
    try {
  const recentRepos = await unwrap(getBciGitApi().getRecentRepositories());
      setRecents(recentRepos);
    } catch (err) {
      handleError(err);
    }
  }, [handleError]);

  const selectCommit = useCallback(
    async (hash: string | null, options?: { preserveMultiSelection?: boolean }) => {
      setSelectedCommitsState((prev) => {
        if (!hash) {
          return options?.preserveMultiSelection ? prev : [];
        }

        if (options?.preserveMultiSelection) {
          return prev;
        }

        return [hash];
      });

      await selectCommitInternal(hash, true);
    },
    [selectCommitInternal]
  );

  const setSelectedCommits = useCallback((hashes: string[]) => {
    setSelectedCommitsState(hashes);
  }, []);

  const openRepoFromDialog = useCallback(async () => {
    setLoading(true);
    try {
      const snapshot = await unwrap(getBciGitApi().openRepositoryDialog());
      await loadSnapshot(snapshot);
      await fetchRecents();
      return true;
    } catch (err) {
      handleError(err);
      return false;
    } finally {
      setLoading(false);
    }
  }, [fetchRecents, handleError, loadSnapshot]);

  const openRepoAtPath = useCallback(
    async (repoPath: string) => {
      setLoading(true);
      try {
        const snapshot = await unwrap(getBciGitApi().openRepository(repoPath));
        await loadSnapshot(snapshot);
        await fetchRecents();
        return true;
      } catch (err) {
        handleError(err);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [fetchRecents, handleError, loadSnapshot]
  );

  const refreshAll = useCallback(async () => {
    if (!repo) {
      return;
    }
    setLoading(true);
    try {
      const [branchesData, graphData, workingDirData, conflictsData] = await Promise.all([
        unwrap(getBciGitApi().getBranches()),
        unwrap(getBciGitApi().getCommitGraph()),
        unwrap(getBciGitApi().getWorkingDirStatus()),
        unwrap<MergeConflictFile[]>(getBciGitApi().getMergeConflicts())
      ]);
      setBranches(branchesData);
      setGraph(graphData);
      setWorkingDirStatus(workingDirData);
      setConflicts(conflictsData);
      if (selectedCommit) {
        await selectCommitInternal(selectedCommit);
      }
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  }, [handleError, repo, selectCommitInternal, selectedCommit]);

  const loadDiff = useCallback(
    async (filePath: string, options?: { scope?: DiffScope }) => {
      const scope = options?.scope ?? (selectedCommit === "working-directory" ? "working" : "commit");

      let ref: string | null = null;
      switch (scope) {
        case "working":
          ref = "working-directory";
          break;
        case "staged":
          ref = "staged";
          break;
        case "commit":
        default:
          ref = selectedCommit && selectedCommit !== "working-directory" ? selectedCommit : null;
          break;
      }

      if (!ref) return;
      try {
        const diffText = await unwrap(getBciGitApi().getDiff(ref, filePath));
        setDiff({ file: filePath, content: diffText, scope });
      } catch (err) {
        handleError(err);
      }
    },
    [handleError, selectedCommit]
  );

  const getWorkingDirStatus = useCallback(
    async () => {
      return unwrap(getBciGitApi().getWorkingDirStatus());
    },
    []
  );

  const loadConflicts = useCallback(async () => {
    if (!repo) {
      setConflicts([]);
      return;
    }
    try {
      const data = await unwrap<MergeConflictFile[]>(getBciGitApi().getMergeConflicts());
      setConflicts(data);
    } catch (err) {
      handleError(err);
    }
  }, [handleError, repo]);

  const gitAction = useCallback(
    async (action: () => Promise<unknown>) => {
      setLoading(true);
      try {
        await action();
        await refreshAll();
      } catch (err) {
        handleError(err);
      } finally {
        setLoading(false);
      }
    },
    [handleError, refreshAll]
  );

  const commit = useCallback(
    async (message: string) => {
      await gitAction(async () => unwrap(getBciGitApi().commit(message)));
    },
    [gitAction]
  );

  const checkout = useCallback(
    async (branch: string) => {
      await gitAction(async () => unwrap(getBciGitApi().checkout(branch)));
    },
    [gitAction]
  );

  const createBranch = useCallback(
    async (name: string, base?: string) => {
      await gitAction(async () => unwrap(getBciGitApi().createBranch(name, base)));
    },
    [gitAction]
  );

  const deleteBranch = useCallback(
    async (name: string, force = false) => {
      await gitAction(async () => unwrap(getBciGitApi().deleteBranch(name, force)));
    },
    [gitAction]
  );

  const pull = useCallback(
    async (remote?: string, branch?: string) => {
      await gitAction(async () => unwrap(getBciGitApi().pull(remote, branch)));
    },
    [gitAction]
  );

  const push = useCallback(
    async (remote?: string, branch?: string) => {
      await gitAction(async () => unwrap(getBciGitApi().push(remote, branch)));
    },
    [gitAction]
  );

  const fetch = useCallback(
    async (remote?: string) => {
      await gitAction(async () => unwrap(getBciGitApi().fetch(remote)));
    },
    [gitAction]
  );

  const merge = useCallback(
    async (branch: string) => {
      await gitAction(async () => unwrap(getBciGitApi().merge(branch)));
    },
    [gitAction]
  );

  const cherryPick = useCallback(
    async (hash: string) => {
      await gitAction(async () => unwrap(getBciGitApi().cherryPick(hash)));
    },
    [gitAction]
  );

  const rebase = useCallback(
    async (onto: string) => {
      await gitAction(async () => unwrap(getBciGitApi().rebase(onto)));
    },
    [gitAction]
  );

  const squashCommits = useCallback(
    async (commits: string[], message: string) => {
      await gitAction(async () => unwrap(getBciGitApi().squashCommits(commits, message)));
    },
    [gitAction]
  );

  const dropCommits = useCallback(
    async (commits: string[]) => {
      await gitAction(async () => unwrap(getBciGitApi().dropCommits(commits)));
    },
    [gitAction]
  );

  const stash = useCallback(
    async (message?: string) => {
      await gitAction(async () => unwrap(getBciGitApi().stash(message)));
    },
    [gitAction]
  );

  const stashPop = useCallback(
    async () => {
      await gitAction(async () => unwrap(getBciGitApi().stashPop()));
    },
    [gitAction]
  );

  const stashList = useCallback(
    async () => {
      return unwrap(getBciGitApi().stashList());
    },
    []
  );

  const stageHunk = useCallback(
    async (filePath: string, hunk: string) => {
      return gitAction(() => unwrap(getBciGitApi().stageHunk(filePath, hunk)));
    },
    []
  );

  const discardHunk = useCallback(
    async (filePath: string, hunk: string) => {
      return gitAction(() => unwrap(getBciGitApi().discardHunk(filePath, hunk)));
    },
    []
  );

  const unstageHunk = useCallback(
    async (filePath: string, hunk: string) => {
      return gitAction(() => unwrap(getBciGitApi().unstageHunk(filePath, hunk)));
    },
    []
  );

  const unstageFile = useCallback(
    async (filePath: string) => {
      return gitAction(() => unwrap(getBciGitApi().unstageFile(filePath)));
    },
    []
  );

  const stageFile = useCallback(
    async (filePath: string) => {
      return gitAction(() => unwrap(getBciGitApi().stageFile(filePath)));
    },
    []
  );

  const resolveConflict = useCallback(
    async (filePath: string, strategy: "ours" | "theirs") => {
      await gitAction(() => unwrap(getBciGitApi().resolveConflict(filePath, strategy)));
    },
    [gitAction]
  );

  const saveConflictResolution = useCallback(
    async (filePath: string, content: string, options?: { stage?: boolean }) => {
      const stage = options?.stage ?? true;
      await gitAction(() => unwrap(getBciGitApi().saveConflictResolution(filePath, content, stage)));
    },
    [gitAction]
  );

  const clearError = useCallback(() => setError(null), []);

  useEffect(() => {
    if (!repo) {
      setConflicts([]);
      return;
    }

    let cancelled = false;
    let timeoutId: number | undefined;
    const POLL_INTERVAL_MS = 4000;

    const pollWorkingDirStatus = async () => {
      try {
        const [status, conflictsData] = await Promise.all([
          unwrap(getBciGitApi().getWorkingDirStatus()),
          unwrap<MergeConflictFile[]>(getBciGitApi().getMergeConflicts())
        ]);
        if (!cancelled) {
          setWorkingDirStatus(status);
          setConflicts(conflictsData);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("[BciGit]", err);
        }
      } finally {
        if (!cancelled) {
          timeoutId = window.setTimeout(pollWorkingDirStatus, POLL_INTERVAL_MS);
        }
      }
    };

    pollWorkingDirStatus();

    return () => {
      cancelled = true;
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [repo]);

  const value = useMemo<RepoContextValue>(
    () => ({
      repo,
      branches,
      graph,
      recents,
      loading,
      error,
      selectedCommit,
      selectedCommits,
      commitDetails,
      diff,
      workingDirStatus,
      conflicts,
      clearError,
      fetchRecents,
      openRepoFromDialog,
      openRepoAtPath,
      refreshAll,
      selectCommit,
      setSelectedCommits,
      loadDiff,
      getWorkingDirStatus,
      commit,
      checkout,
      createBranch,
      deleteBranch,
      pull,
      push,
      fetch,
      merge,
      cherryPick,
      rebase,
      squashCommits,
      dropCommits,
      stash,
      stashPop,
      stashList,
      stageHunk,
      discardHunk,
      unstageHunk,
      unstageFile,
      stageFile,
      loadConflicts,
      resolveConflict,
      saveConflictResolution
    }),
    [
      branches,
      checkout,
      cherryPick,
      clearError,
      commit,
      commitDetails,
      conflicts,
      createBranch,
      deleteBranch,
      diff,
      discardHunk,
      dropCommits,
      fetch,
      fetchRecents,
      getWorkingDirStatus,
      graph,
      loadConflicts,
      loadDiff,
      loading,
      merge,
      openRepoAtPath,
      openRepoFromDialog,
      pull,
      push,
      rebase,
      recents,
      refreshAll,
      repo,
      resolveConflict,
      saveConflictResolution,
      selectedCommit,
      selectedCommits,
      selectCommit,
      setSelectedCommits,
      squashCommits,
      stageFile,
      stageHunk,
      stash,
      stashList,
      stashPop,
      unstageFile,
      unstageHunk,
      workingDirStatus
    ]
  );

  return <RepoContext.Provider value={value}>{children}</RepoContext.Provider>;
};

export function useRepoContext(): RepoContextValue {
  const context = useContext(RepoContext);
  if (!context) {
    throw new Error("useRepoContext doit être utilisé dans un RepoProvider");
  }
  return context;
}
