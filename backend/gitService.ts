import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { simpleGit, type SimpleGit } from "simple-git";
import {
  type BranchInfo,
  type CommitDetails,
  type CommitGraphData,
  type CommitLink,
  type CommitNode
} from "../shared/git.js";

const COLOR_PALETTE = [
  "#38bdf8",
  "#a855f7",
  "#f97316",
  "#22d3ee",
  "#facc15",
  "#fb7185",
  "#34d399",
  "#60a5fa"
];

export class GitService {
  private git: SimpleGit | null = null;
  private repoPath: string | null = null;
  private branchColorMap = new Map<string, string>();

  async openRepository(repoPath: string) {
    const normalized = path.resolve(repoPath);

    if (!fs.existsSync(normalized)) {
      throw new Error("Le chemin du dépôt est invalide.");
    }

    const gitFolder = path.join(normalized, ".git");
    if (!fs.existsSync(gitFolder)) {
      throw new Error("Ce dossier ne contient pas de dépôt Git valide.");
    }

    this.git = simpleGit({ baseDir: normalized, maxConcurrentProcesses: 6 });
    this.repoPath = normalized;
    this.branchColorMap.clear();
  }

  ensureRepo(): SimpleGit {
    if (!this.git) {
      throw new Error("Aucun dépôt ouvert");
    }
    return this.git;
  }

  getCurrentRepo(): string {
    if (!this.repoPath) {
      throw new Error("Aucun dépôt ouvert");
    }
    return this.repoPath;
  }

  async getBranches(): Promise<BranchInfo[]> {
    const git = this.ensureRepo();
    const branchSummary = await git.branch();

    const refsRaw = await git.raw([
      "for-each-ref",
      "--sort=-committerdate",
      "--format=%(refname)|%(refname:short)|%(authordate:iso8601)|%(authorname)|%(objectname)|%(subject)",
      "refs/heads",
      "refs/remotes"
    ]);

    const branches: BranchInfo[] = [];
    const seen = new Set<string>();
    let colorIndex = 0;

    refsRaw
      .split("\n")
      .map((line: string) => line.trim())
      .filter(Boolean)
      .forEach((line: string) => {
        const [refName, shortName, isoDate, author, commitHash, subject] = line.split("|");
        const type = refName.startsWith("refs/heads") ? "local" : "remote";
        if (seen.has(refName)) {
          return;
        }
        seen.add(refName);

        const isCurrent = type === "local" && branchSummary.current === shortName;
  const color = this.getBranchColor(shortName, colorIndex++);

        branches.push({
          name: shortName,
          fullName: refName,
          type,
          current: isCurrent,
          latestCommit: subject,
          author,
          updatedAt: isoDate,
          color
        });
      });

    return branches;
  }

  async getWorkingDirStatus() {
    const git = this.ensureRepo();
    const status = await git.status();
    return {
      isClean: status.isClean(),
      files: status.files,
      ahead: status.ahead,
      behind: status.behind,
      current: status.current,
      tracking: status.tracking
    };
  }

  async getCommitGraph(limit = 150): Promise<CommitGraphData> {
    const git = this.ensureRepo();

    const logRaw = await git.raw([
      "log",
      "--all",
      "--topo-order",
      `-n${limit}`,
      "--date=iso-strict",
      "--pretty=format:%H|%P|%an|%ad|%s|%D"
    ]);

    const nodes: CommitNode[] = [];
    const links: CommitLink[] = [];

    const branchAssignments = await this.getBranches();
    const branchLaneMap = new Map<string, number>();

    branchAssignments.forEach((branch, index) => {
      branchLaneMap.set(branch.name, index);
      this.branchColorMap.set(branch.name, branch.color);
    });

  const lines = logRaw.split("\n").filter(Boolean);
  const commitLaneMap = new Map<string, number>();
  let nextLane = branchAssignments.length;

  lines.forEach((line: string) => {
      const [hash, parentsRaw, author, date, message, refsRaw] = line.split("|");
      const parents = parentsRaw ? parentsRaw.split(" ").filter(Boolean) : [];
      const refs = refsRaw
        ? refsRaw
            .split(",")
            .map((ref: string) => ref.trim())
            .filter((ref: string) => ref.length > 0 && !ref.startsWith("tag:"))
            .map((ref: string) => ref.replace(/^HEAD ->\s*/, ""))
        : [];

      let lane = this.pickLane(refs, branchLaneMap, commitLaneMap, nextLane);
      if (lane === nextLane) {
        nextLane += 1;
      }
      commitLaneMap.set(hash, lane);

      const color = this.resolveCommitColor(refs, lane);

      nodes.push({
        hash,
        parents,
        author,
        date,
        message,
        branches: refs,
        lane,
        color
      });

      parents.forEach((parentHash: string) => {
        links.push({
          source: hash,
          target: parentHash,
          color
        });
      });
    });

    // Add working directory node if there are uncommitted changes
    const status = await git.status();
    if (!status.isClean()) {
      const headHash = nodes[0]?.hash;
      if (headHash) {
        const wdNode: CommitNode = {
          hash: "working-directory",
          parents: [headHash],
          message: "Working Directory",
          author: status.current || "Unknown",
          date: new Date().toISOString(),
          branches: [],
          lane: nodes[0].lane,
          color: "#fbbf24" // Yellow color for working directory
        };
        nodes.unshift(wdNode);
        links.push({
          source: "working-directory",
          target: headHash,
          color: "#fbbf24"
        });
      }
    }

    return { nodes, links };
  }

  async getCommitDetails(hash: string): Promise<CommitDetails> {
    const git = this.ensureRepo();
    if (hash === "working-directory") {
      const status = await git.status();
      const files = [
        ...status.modified.map(path => ({ status: "M", path })),
        ...status.created.map(path => ({ status: "A", path })),
        ...status.deleted.map(path => ({ status: "D", path })),
        ...status.renamed.map(item => ({ status: "R", path: item.to })),
      ];
      return {
        hash: "working-directory",
        author: status.current || "Unknown",
        date: new Date().toISOString(),
        message: "Working Directory",
        files
      };
    }
    const raw = await git.raw([
      "show",
      "--name-status",
      "--pretty=format:%H|%an|%ad|%s",
      "--date=iso-strict",
      hash
    ]);

    const lines = raw.split("\n").filter(Boolean);
    const [header, ...fileLines] = lines;
    const [commitHash, author, date, message] = header.split("|");

    const files = fileLines.map((line: string) => {
      const [status, ...pathParts] = line.trim().split("\t");
      return {
        status,
        path: pathParts.join("\t")
      };
    });

    return {
      hash: commitHash,
      author,
      date,
      message,
      files
    };
  }

  async getDiff(hash: string, filePath: string): Promise<string> {
    const git = this.ensureRepo();
    if (hash === "working-directory") {
      const diff = await git.raw(["diff", "--color=never", "--", filePath]);
      return diff;
    }
    if (hash === "staged") {
      const diff = await git.raw(["diff", "--cached", "--color=never", "--", filePath]);
      return diff;
    }
    const diff = await git.raw(["diff", "--color=never", `${hash}^!`, "--", filePath]);
    return diff;
  }

  async commit(message: string) {
    const git = this.ensureRepo();
    return git.commit(message);
  }

  async checkout(branchName: string) {
    const git = this.ensureRepo();
    await git.checkout(branchName);
  }

  async createBranch(name: string, base?: string) {
    const git = this.ensureRepo();
    if (base) {
      await git.raw(["branch", name, base]);
      return;
    }
    await git.checkoutLocalBranch(name);
  }

  async deleteBranch(name: string, force = false) {
    const git = this.ensureRepo();
    await git.deleteLocalBranch(name, force);
  }

  async pull(remote = "origin", branch?: string) {
    const git = this.ensureRepo();
    if (!branch) {
      const branchSummary = await git.branch();
      branch = branchSummary.current;
    }
    return git.pull(remote, branch);
  }

  async push(remote = "origin", branch?: string) {
    const git = this.ensureRepo();
    if (!branch) {
      const branchSummary = await git.branch();
      branch = branchSummary.current;
    }
    return git.push(remote, branch);
  }

  async fetch(remote = "origin") {
    const git = this.ensureRepo();
    return git.fetch(remote);
  }

  async merge(branch: string) {
    const git = this.ensureRepo();
    return git.merge([branch]);
  }

  async cherryPick(commit: string) {
    const git = this.ensureRepo();
    await git.raw(["cherry-pick", commit]);
  }

  async rebase(onto: string) {
    const git = this.ensureRepo();
    await git.raw(["rebase", onto]);
  }

  async stash(message?: string) {
    const git = this.ensureRepo();
    if (message) {
      return git.stash(["push", "-m", message]);
    }
    return git.stash();
  }

  async stashPop() {
    const git = this.ensureRepo();
    return git.stash(["pop"]);
  }

  async stashList() {
    const git = this.ensureRepo();
    return git.stash(["list"]);
  }

  async stageHunk(filePath: string, hunk: string) {
    const git = this.ensureRepo();
    const tempFile = path.join(os.tmpdir(), `patch-${Date.now()}.patch`);
    fs.writeFileSync(tempFile, hunk);
    try {
      await git.applyPatch(tempFile, { "--cached": null });
    } finally {
      fs.unlinkSync(tempFile);
    }
  }

  async discardHunk(filePath: string, hunk: string) {
    const git = this.ensureRepo();
    const tempFile = path.join(os.tmpdir(), `patch-${Date.now()}.patch`);
    fs.writeFileSync(tempFile, hunk);
    try {
      await git.applyPatch(tempFile, { "--reverse": null });
    } finally {
      fs.unlinkSync(tempFile);
    }
  }

  async unstageHunk(filePath: string, hunk: string) {
    const git = this.ensureRepo();
    const tempFile = path.join(os.tmpdir(), `patch-${Date.now()}.patch`);
    fs.writeFileSync(tempFile, hunk);
    try {
      await git.applyPatch(tempFile, { "--cached": null, "--reverse": null });
    } finally {
      fs.unlinkSync(tempFile);
    }
  }

  async unstageFile(filePath: string) {
    const git = this.ensureRepo();
    return git.reset(['HEAD', '--', filePath]);
  }

  async stageFile(filePath: string) {
    const git = this.ensureRepo();
    return git.add(filePath);
  }

  private pickLane(
    refs: string[],
    branchLaneMap: Map<string, number>,
    commitLaneMap: Map<string, number>,
    nextLane: number
  ) {
    for (const ref of refs) {
      const lane = branchLaneMap.get(ref);
      if (typeof lane === "number") {
        return lane;
      }
    }

    for (const ref of refs) {
      if (!branchLaneMap.has(ref)) {
        branchLaneMap.set(ref, nextLane);
        return nextLane;
      }
    }

    if (refs.length) {
      return branchLaneMap.get(refs[0]) ?? 0;
    }

    return nextLane;
  }

  private resolveCommitColor(refs: string[], lane: number) {
    for (const ref of refs) {
      const color = this.branchColorMap.get(ref);
      if (color) {
        return color;
      }
    }

    const fallback = COLOR_PALETTE[lane % COLOR_PALETTE.length];
    return fallback;
  }

  private getBranchColor(branchName: string, fallbackIndex: number) {
    const existing = this.branchColorMap.get(branchName);
    if (existing) {
      return existing;
    }

    const color = COLOR_PALETTE[fallbackIndex % COLOR_PALETTE.length];
    this.branchColorMap.set(branchName, color);
    return color;
  }
}
