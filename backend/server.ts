import { GitService } from "./gitService.js";
import { RecentRepoStore } from "./recentRepoStore.js";

export class BackendServer {
  private readonly gitService = new GitService();
  private readonly recentRepos: RecentRepoStore;

  constructor(private readonly storageDir: string) {
    this.recentRepos = new RecentRepoStore(storageDir);
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
}
