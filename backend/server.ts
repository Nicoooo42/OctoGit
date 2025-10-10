import { GitService } from "./gitService.js";
import { RecentRepoStore } from "./recentRepoStore.js";
import { GitLabStore } from "./gitlabStore.js";
import { GitLabService } from "./gitlabService.js";

export class BackendServer {
  private readonly gitService = new GitService();
  private readonly recentRepos: RecentRepoStore;
  private readonly gitlabStore: GitLabStore;
  private readonly gitlabService: GitLabService;

  constructor(private readonly storageDir: string) {
    this.recentRepos = new RecentRepoStore(storageDir);
    this.gitlabStore = new GitLabStore(storageDir);
    this.gitlabService = new GitLabService(this.gitlabStore);
  }

  async openRepository(repoPath: string) {
    await this.gitService.openRepository(repoPath);
    this.recentRepos.touch(repoPath);

    return {
      path: this.gitService.getCurrentRepo(),
      name: this.repoName
    };
  }

  get repoName() {
    const repoPath = this.gitService.getCurrentRepo();
    const segments = repoPath.split(/\\|\//g);
    return segments[segments.length - 1] ?? repoPath;
  }

  listRecentRepositories(limit?: number) {
    return this.recentRepos.list(limit);
  }

  async getBranches() {
    return this.gitService.getBranches();
  }

  async getCommitGraph() {
    return this.gitService.getCommitGraph();
  }

  async getCommitDetails(hash: string) {
    return this.gitService.getCommitDetails(hash);
  }

  async getDiff(hash: string, filePath: string) {
    return this.gitService.getDiff(hash, filePath);
  }

  async getWorkingDirStatus() {
    return this.gitService.getWorkingDirStatus();
  }

  async commit(message: string) {
    return this.gitService.commit(message);
  }

  async checkout(branch: string) {
    return this.gitService.checkout(branch);
  }

  async createBranch(name: string, base?: string) {
    return this.gitService.createBranch(name, base);
  }

  async deleteBranch(name: string, force = false) {
    return this.gitService.deleteBranch(name, force);
  }

  async pull(remote?: string, branch?: string) {
    return this.gitService.pull(remote, branch);
  }

  async push(remote?: string, branch?: string) {
    return this.gitService.push(remote, branch);
  }

  async fetch(remote?: string) {
    return this.gitService.fetch(remote);
  }

  async merge(branch: string) {
    return this.gitService.merge(branch);
  }

  async cherryPick(hash: string) {
    return this.gitService.cherryPick(hash);
  }

  async rebase(onto: string) {
    return this.gitService.rebase(onto);
  }

  async squashCommits(commits: string[], message: string) {
    return this.gitService.squashCommits(commits, message);
  }

  async dropCommits(commits: string[]) {
    return this.gitService.dropCommits(commits);
  }

  async stash(message?: string) {
    return this.gitService.stash(message);
  }

  async stashPop() {
    return this.gitService.stashPop();
  }

  async stashList() {
    return this.gitService.stashList();
  }

  async stageHunk(filePath: string, hunk: string) {
    return this.gitService.stageHunk(filePath, hunk);
  }

  async discardHunk(filePath: string, hunk: string) {
    return this.gitService.discardHunk(filePath, hunk);
  }

  async unstageHunk(filePath: string, hunk: string) {
    return this.gitService.unstageHunk(filePath, hunk);
  }

  async unstageFile(filePath: string) {
    return this.gitService.unstageFile(filePath);
  }

  async stageFile(filePath: string) {
    return this.gitService.stageFile(filePath);
  }

  async getGitConfig(key: string) {
    return this.gitService.getGitConfig(key);
  }

  async setGitConfig(key: string, value: string, global = false) {
    return this.gitService.setGitConfig(key, value, global);
  }

  async getGitLabConfig(key: string) {
    return this.gitlabStore.getConfig(key);
  }

  async setGitLabConfig(key: string, value: string) {
    return this.gitlabStore.setConfig(key, value);
  }

  async clearGitLabConfig() {
    return this.gitlabStore.clearConfig();
  }

  async testGitLabConnection() {
    return this.gitlabService.testConnection();
  }

  async getGitLabProjects(page = 1, perPage = 20) {
    return this.gitlabService.getProjects(page, perPage);
  }

  async getGitLabMergeRequests(projectId: number, state = "opened") {
    return this.gitlabService.getMergeRequests(projectId, state);
  }

  async createGitLabMergeRequest(
    projectId: number,
    sourceBranch: string,
    targetBranch: string,
    title: string,
    description?: string
  ) {
    return this.gitlabService.createMergeRequest(projectId, sourceBranch, targetBranch, title, description);
  }

  async cloneRepository(repoUrl: string, localPath: string) {
    await this.gitService.cloneRepository(repoUrl, localPath);
    // Après le clone, ouvrir le dépôt
    return this.openRepository(localPath);
  }
}
