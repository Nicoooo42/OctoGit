import { GitService } from "./gitService.js";
import { RecentRepoStore } from "./recentRepoStore.js";
import { GitLabStore } from "./gitlabStore.js";
import { GitLabService } from "./gitlabService.js";
import { CopilotStore } from "./copilotStore.js";
import { CopilotService } from "./copilotService.js";
import { AppStore } from "./appStore.js";
import { getLogger } from "./logger.js";

const PERIODIC_FETCH_CONFIG_KEY = "periodic_fetch_enabled";
const PERIODIC_FETCH_INTERVAL_MS = 60_000;
const AI_TERMINAL_HISTORY_KEY = "ai_terminal_history";
const logger = getLogger("BackendServer");
const toMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

type PeriodicFetchHandler = (payload: { success: boolean; error?: string }) => void;

/**
 * Orchestrates backend services and exposes high-level operations to the UI.
 */
export class BackendServer {
  private readonly gitService = new GitService();
  private readonly recentRepos: RecentRepoStore;
  private readonly gitlabStore: GitLabStore;
  private readonly gitlabService: GitLabService;
  private readonly copilotStore: CopilotStore;
  private readonly copilotService: CopilotService;
  private readonly appStore: AppStore;
  private readonly onPeriodicFetch?: PeriodicFetchHandler;
  private periodicFetchInterval: NodeJS.Timeout | null = null;

  /**
   * Creates the backend server with the provided storage directory.
   */
  constructor(private readonly storageDir: string, options?: { onPeriodicFetch?: PeriodicFetchHandler }) {
    this.recentRepos = new RecentRepoStore(storageDir);
    this.gitlabStore = new GitLabStore(storageDir);
    this.gitlabService = new GitLabService(this.gitlabStore);
    this.copilotStore = new CopilotStore(storageDir);
    this.copilotService = new CopilotService(this.copilotStore);
    this.appStore = new AppStore(storageDir);
    this.onPeriodicFetch = options?.onPeriodicFetch;
  }

  /**
   * Opens a repository and returns its basic metadata.
   */
  async openRepository(repoPath: string) {
    await this.gitService.openRepository(repoPath);
    this.recentRepos.touch(repoPath);
    this.startPeriodicFetch();

    return {
      path: this.gitService.getCurrentRepo(),
      name: this.repoName
    };
  }

  /**
   * Returns the current repository name derived from its path.
   */
  get repoName() {
    const repoPath = this.gitService.getCurrentRepo();
    const segments = repoPath.split(/\\|\//g);
    return segments[segments.length - 1] ?? repoPath;
  }

  /**
   * Returns the list of recently opened repositories.
   */
  listRecentRepositories(limit?: number) {
    return this.recentRepos.list(limit);
  }

  /**
   * Retrieves branch information for the current repository.
   */
  async getBranches() {
    return this.gitService.getBranches();
  }

  /**
   * Retrieves tag information for the current repository.
   */
  async getTags() {
    return this.gitService.getTags();
  }

  /**
   * Retrieves the commit graph for the current repository.
   */
  async getCommitGraph() {
    return this.gitService.getCommitGraph();
  }

  /**
   * Retrieves detailed information for a given commit.
   */
  async getCommitDetails(hash: string) {
    return this.gitService.getCommitDetails(hash);
  }

  /**
   * Retrieves a diff for a given commit and file.
   */
  async getDiff(hash: string, filePath: string) {
    return this.gitService.getDiff(hash, filePath);
  }

  /**
   * Returns the working directory status for the current repo.
   */
  async getWorkingDirStatus() {
    return this.gitService.getWorkingDirStatus();
  }

  /**
   * Returns merge conflict details if any are present.
   */
  async getMergeConflicts() {
    return this.gitService.getMergeConflicts();
  }

  /**
   * Resolves a conflicted file using the specified strategy.
   */
  async resolveConflict(filePath: string, strategy: "ours" | "theirs") {
    return this.gitService.resolveConflict(filePath, strategy);
  }

  /**
   * Persists and optionally stages conflict resolution content.
   */
  async saveConflictResolution(filePath: string, content: string, stage = true) {
    return this.gitService.saveConflictResolution(filePath, content, stage);
  }

  /**
   * Creates a commit with the given message.
   */
  async commit(message: string) {
    return this.gitService.commit(message);
  }

  /**
   * Checks out the requested branch.
   */
  async checkout(branch: string) {
    return this.gitService.checkout(branch);
  }

  /**
   * Creates a new branch, optionally from a base.
   */
  async createBranch(name: string, base?: string) {
    return this.gitService.createBranch(name, base);
  }

  /**
   * Deletes a branch, optionally forcing removal.
   */
  async deleteBranch(name: string, force = false) {
    return this.gitService.deleteBranch(name, force);
  }

  /**
   * Pulls from the configured remote/branch.
   */
  async pull(remote?: string, branch?: string) {
    return this.gitService.pull(remote, branch);
  }

  /**
   * Pushes to the configured remote/branch.
   */
  async push(remote?: string, branch?: string) {
    return this.gitService.push(remote, branch);
  }

  /**
   * Fetches updates from a remote.
   */
  async fetch(remote?: string) {
    return this.gitService.fetch(remote);
  }

  /**
   * Merges the specified branch into the current one.
   */
  async merge(branch: string) {
    return this.gitService.merge(branch);
  }

  /**
   * Cherry-picks a commit by hash.
   */
  async cherryPick(hash: string) {
    return this.gitService.cherryPick(hash);
  }

  /**
   * Rebases the current branch onto the provided commit/branch.
   */
  async rebase(onto: string) {
    return this.gitService.rebase(onto);
  }

  /**
   * Squashes the selected commits into a single commit with a message.
   */
  async squashCommits(commits: string[], message: string) {
    return this.gitService.squashCommits(commits, message);
  }

  /**
   * Drops the selected commits from the current branch.
   */
  async dropCommits(commits: string[]) {
    return this.gitService.dropCommits(commits);
  }

  /**
   * Stashes working directory changes with an optional message.
   */
  async stash(message?: string) {
    return this.gitService.stash(message);
  }

  /**
   * Pops the latest stash.
   */
  async stashPop() {
    return this.gitService.stashPop();
  }

  /**
   * Lists available stashes.
   */
  async stashList() {
    return this.gitService.stashList();
  }

  /**
   * Stages a selected diff hunk.
   */
  async stageHunk(filePath: string, hunk: string) {
    return this.gitService.stageHunk(filePath, hunk);
  }

  /**
   * Discards a selected diff hunk.
   */
  async discardHunk(filePath: string, hunk: string) {
    return this.gitService.discardHunk(filePath, hunk);
  }

  /**
   * Unstages a selected diff hunk.
   */
  async unstageHunk(filePath: string, hunk: string) {
    return this.gitService.unstageHunk(filePath, hunk);
  }

  /**
   * Unstages a file from the index.
   */
  async unstageFile(filePath: string) {
    return this.gitService.unstageFile(filePath);
  }

  /**
   * Stages a file into the index.
   */
  async stageFile(filePath: string) {
    return this.gitService.stageFile(filePath);
  }

  /**
   * Reads a Git configuration value.
   */
  async getGitConfig(key: string) {
    return this.gitService.getGitConfig(key);
  }

  /**
   * Writes a Git configuration value.
   */
  async setGitConfig(key: string, value: string, global = false) {
    return this.gitService.setGitConfig(key, value, global);
  }

  /**
   * Reads a GitLab configuration value.
   */
  getGitLabConfig(key: string) {
    return this.gitlabStore.getConfig(key);
  }

  /**
   * Writes a GitLab configuration value.
   */
  setGitLabConfig(key: string, value: string) {
    this.gitlabStore.setConfig(key, value);
  }

  /**
   * Clears all GitLab configuration values.
   */
  clearGitLabConfig() {
    this.gitlabStore.clearConfig();
  }

  /**
   * Tests the GitLab connection.
   */
  async testGitLabConnection() {
    return this.gitlabService.testConnection();
  }

  /**
   * Reads a Copilot configuration value.
   */
  getCopilotConfig(key: string) {
    return this.copilotStore.getConfig(key);
  }

  /**
   * Writes a Copilot configuration value.
   */
  async setCopilotConfig(key: string, value: string) {
    this.copilotStore.setConfig(key, value);
  }

  /**
   * Clears all Copilot configuration values.
   */
  async clearCopilotConfig() {
    this.copilotStore.clearConfig();
  }

  /**
   * Reads an application configuration value.
   */
  getAppConfig(key: string) {
    return this.appStore.getConfig(key);
  }

  /**
   * Writes an application configuration value and updates periodic fetch if needed.
   */
  async setAppConfig(key: string, value: string) {
    this.appStore.setConfig(key, value);
    if (key === PERIODIC_FETCH_CONFIG_KEY) {
      this.startPeriodicFetch();
    }
  }

  /**
   * Clears all application configuration values.
   */
  async clearAppConfig() {
    this.appStore.clearConfig();
  }

  /**
   * Indicates whether periodic fetch is enabled in settings.
   */
  private isPeriodicFetchEnabled() {
    return this.appStore.getConfig(PERIODIC_FETCH_CONFIG_KEY) === "true";
  }

  /**
   * Returns true when a repository is currently open.
   */
  private hasOpenRepository() {
    try {
      this.gitService.getCurrentRepo();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Logs periodic fetch lifecycle events.
   */
  private logPeriodic(message: string, ...args: unknown[]) {
    logger.info({ args }, message);
  }

  /**
   * Notifies listeners that a periodic fetch completed.
   */
  private notifyPeriodicFetch(payload: { success: boolean; error?: string }) {
    try {
      this.onPeriodicFetch?.(payload);
    } catch (error) {
      logger.error({ error }, "Failed to notify periodic fetch listeners");
    }
  }

  /**
   * Starts the periodic background fetch when enabled.
   */
  private startPeriodicFetch() {
    this.stopPeriodicFetch();
    if (!this.isPeriodicFetchEnabled() || !this.hasOpenRepository()) {
      return;
    }

    this.periodicFetchInterval = setInterval(async () => {
      try {
        if (!this.hasOpenRepository()) {
          return;
        }
        await this.gitService.fetch();
        this.logPeriodic("Fetch completed successfully");
        this.notifyPeriodicFetch({ success: true });
      } catch (error) {
        logger.error({ error }, "Periodic fetch failed");
        this.notifyPeriodicFetch({ success: false, error: toMessage(error) });
      }
    }, PERIODIC_FETCH_INTERVAL_MS);
    this.logPeriodic(`Started periodic fetch (every ${PERIODIC_FETCH_INTERVAL_MS / 1000} seconds)`);
  }

  /**
   * Stops the periodic fetch timer if active.
   */
  private stopPeriodicFetch() {
    if (this.periodicFetchInterval) {
      clearInterval(this.periodicFetchInterval);
      this.periodicFetchInterval = null;
      this.logPeriodic("Stopped periodic fetch");
    }
  }

  /**
   * Delegates commit message generation to the Copilot service using staged changes.
   */
  async generateCommitMessage() {
    logger.debug("Starting generateCommitMessage");
    const stagedChanges = await this.gitService.getStagedChanges();
    logger.debug("Staged changes retrieved, invoking Copilot");
    const result = await this.copilotService.generateCommitMessage(stagedChanges);
    logger.debug({ result }, "Copilot response received");
    return result;
  }

  /**
   * Delegates branch name suggestion generation to the Copilot service using working directory changes.
   */
  async generateBranchNameSuggestions() {
    logger.debug("Starting generateBranchNameSuggestions");
    const workingChanges = await this.gitService.getWorkingChanges();
    logger.debug("Working changes retrieved, invoking Copilot");
    const result = await this.copilotService.generateBranchNameSuggestions(workingChanges);
    logger.debug({ result }, "Copilot response received for branch names");
    return result;
  }

  /**
   * Delegates natural language Git command suggestion to the Copilot service.
   */
  async suggestGitCommand(prompt: string) {
    logger.debug("Starting suggestGitCommand");
    let repoPath: string | null = null;
    let repoName: string | null = null;
    let statusSummary: string | null = null;

    try {
      repoPath = this.gitService.getCurrentRepo();
      repoName = this.repoName;
      statusSummary = await this.gitService.getStatusSummary();
    } catch {
      repoPath = null;
      repoName = null;
      statusSummary = null;
    }

    const history = this.getAiTerminalHistory();

    const result = await this.copilotService.suggestGitCommand(prompt, {
      repoPath,
      repoName,
      statusSummary,
      history
    });

    logger.debug({ result }, "Copilot response received for git command");
    return result;
  }

  /**
   * Executes a Git command (single command only).
   */
  async executeGitCommand(command: string) {
    logger.debug({ command }, "Executing git command");
    const fallbackName = this.appStore.getConfig("default_user_name");
    const fallbackEmail = this.appStore.getConfig("default_user_email");
    const env: NodeJS.ProcessEnv = {};
    if (fallbackName) {
      env.GIT_AUTHOR_NAME = fallbackName;
      env.GIT_COMMITTER_NAME = fallbackName;
    }
    if (fallbackEmail) {
      env.GIT_AUTHOR_EMAIL = fallbackEmail;
      env.GIT_COMMITTER_EMAIL = fallbackEmail;
    }

    const result = await this.gitService.executeGitCommand(command, { env });
    this.appendAiTerminalHistory({
      command: result.command,
      exitCode: result.exitCode,
      isGlobal: result.isGlobal,
      timestamp: Date.now()
    });
    return result;
  }

  /**
   * Clears the AI terminal session history.
   */
  async clearAiTerminalSession() {
    this.appStore.setConfig(AI_TERMINAL_HISTORY_KEY, JSON.stringify([]));
  }

  /**
   * Returns the AI terminal history list.
   */
  private getAiTerminalHistory(): Array<{ command: string; exitCode: number | null; isGlobal: boolean; timestamp: number }> {
    const raw = this.appStore.getConfig(AI_TERMINAL_HISTORY_KEY);
    if (!raw) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw) as Array<{ command: string; exitCode: number | null; isGlobal: boolean; timestamp: number }>;
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed.filter((entry) => typeof entry?.command === "string");
    } catch {
      return [];
    }
  }

  /**
   * Appends a new entry to the AI terminal history (keeps last 20).
   */
  private appendAiTerminalHistory(entry: { command: string; exitCode: number | null; isGlobal: boolean; timestamp: number }) {
    const history = this.getAiTerminalHistory();
    history.unshift(entry);
    const trimmed = history.slice(0, 20);
    this.appStore.setConfig(AI_TERMINAL_HISTORY_KEY, JSON.stringify(trimmed));
  }

  /**
   * Retrieves GitLab projects for the current user.
   */
  async getGitLabProjects(page = 1, perPage = 20) {
    return this.gitlabService.getProjects(page, perPage);
  }

  /**
   * Retrieves merge requests for a GitLab project.
   */
  async getGitLabMergeRequests(projectId: number, state = "opened") {
    return this.gitlabService.getMergeRequests(projectId, state);
  }

  /**
   * Creates a GitLab merge request.
   */
  async createGitLabMergeRequest(
    projectId: number,
    sourceBranch: string,
    targetBranch: string,
    title: string,
    description?: string
  ) {
    return this.gitlabService.createMergeRequest(projectId, sourceBranch, targetBranch, title, description);
  }

  /**
   * Clones a repository locally and opens it.
   */
  async cloneRepository(repoUrl: string, localPath: string) {
    await this.gitService.cloneRepository(repoUrl, localPath);
    // Après le clone, ouvrir le dépôt
    return this.openRepository(localPath);
  }
}
