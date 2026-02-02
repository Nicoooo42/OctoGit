import fs from "node:fs";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { simpleGit, type SimpleGit } from "simple-git";
import {
  type AiTerminalExecuteResult,
  type BranchInfo,
  type CommitDetails,
  type CommitGraphData,
  type CommitLink,
  type CommitNode,
  type MergeConflictFile
} from "../shared/git.js";
import { getLogger } from "./logger.js";

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

const logger = getLogger("GitService");

/**
 * Centralizes every Git interaction so the rest of the app can rely on a single
 * abstraction. Keeps a handle on the current repository and exposes higher-level
 * helpers used throughout the UI.
 */
export class GitService {
  private git: SimpleGit | null = null;
  private repoPath: string | null = null;
  private branchColorMap = new Map<string, string>();

  /**
   * Logs debug messages for Git operations.
   */
  private debug(...args: unknown[]) {
    logger.debug({ args }, "GitService debug");
  }

  /**
   * Opens a repository and initializes the Git client context.
   */
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

  /**
   * Returns the active Git client or throws if none is set.
   */
  ensureRepo(): SimpleGit {
    if (!this.git) {
      throw new Error("Aucun dépôt ouvert");
    }
    return this.git;
  }

  /**
   * Returns the current repository path or throws if none is open.
   */
  getCurrentRepo(): string {
    if (!this.repoPath) {
      throw new Error("Aucun dépôt ouvert");
    }
    return this.repoPath;
  }

  /**
   * Lists local and remote branches with metadata.
   */
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

  /**
   * Returns working directory status details.
   */
  async getWorkingDirStatus() {
    const git = this.ensureRepo();
    const status = await git.status();
    return {
      isClean: status.isClean(),
      files: status.files,
      ahead: status.ahead,
      behind: status.behind,
      current: status.current,
      tracking: status.tracking,
      conflicted: status.conflicted
    };
  }

  /**
   * Returns the per-file conflict details for the current repository, including
   * stage content and a flag when any side is detected as binary.
   */
  async getMergeConflicts(): Promise<MergeConflictFile[]> {
    const git = this.ensureRepo();
    const status = await git.status();
    const conflicted = status.conflicted ?? [];

    if (conflicted.length === 0) {
      return [];
    }

    const statusMap = new Map<string, { index: string; working: string }>();
    status.files.forEach((file) => {
      statusMap.set(file.path, { index: file.index, working: file.working_dir });
    });

    const conflicts: MergeConflictFile[] = [];
    const repoPath = this.getCurrentRepo();

    for (const filePath of conflicted) {
      const entry = statusMap.get(filePath);
      const conflict: MergeConflictFile = {
        path: filePath,
        indexStatus: entry?.index ?? "U",
        workingTreeStatus: entry?.working ?? "U",
        base: null,
        ours: null,
        theirs: null,
        current: null,
        isBinary: false
      };

      const base = await this.getConflictStageContent(git, filePath, 1);
      const ours = await this.getConflictStageContent(git, filePath, 2);
      const theirs = await this.getConflictStageContent(git, filePath, 3);

      let isBinary = false;
      if (base !== null && this.containsBinary(base)) {
        isBinary = true;
      }
      if (ours !== null && this.containsBinary(ours)) {
        isBinary = true;
      }
      if (theirs !== null && this.containsBinary(theirs)) {
        isBinary = true;
      }

      let current: string | null = null;
      try {
        const absolute = path.join(repoPath, filePath);
        const buffer = fs.readFileSync(absolute);
        if (buffer.includes(0)) {
          isBinary = true;
        } else {
          current = buffer.toString("utf8");
        }
      } catch {
        current = null;
      }

      if (isBinary) {
        conflict.base = null;
        conflict.ours = null;
        conflict.theirs = null;
        conflict.current = null;
      } else {
        conflict.base = base;
        conflict.ours = ours;
        conflict.theirs = theirs;
        conflict.current = current;
      }

      conflict.isBinary = isBinary;
      conflicts.push(conflict);
    }

    return conflicts;
  }

  /**
   * Resolves a conflict by checking out either ours or theirs and staging the result.
   */
  async resolveConflict(filePath: string, strategy: "ours" | "theirs") {
    const git = this.ensureRepo();
    const flag = strategy === "ours" ? "--ours" : "--theirs";
    await git.checkout([flag, "--", filePath]);
    await git.add(filePath);
  }

  /**
   * Writes conflict resolution content and optionally stages it.
   */
  async saveConflictResolution(filePath: string, content: string, stage = true) {
    const git = this.ensureRepo();
    const absolute = path.join(this.getCurrentRepo(), filePath);
    await fs.promises.writeFile(absolute, content, "utf8");
    if (stage) {
      await git.add(filePath);
    }
  }

  /**
   * Returns the staged diff, or throws if nothing is staged.
   */
  async getStagedChanges(): Promise<string> {
    this.debug("Getting staged changes");
    const git = this.ensureRepo();
    const diff = await git.raw(["diff", "--cached", "--color=never"]);
    this.debug("Raw diff result length:", diff.length);
    this.debug(
      "Diff preview:",
      diff.substring(0, 200) + (diff.length > 200 ? "..." : "")
    );

    if (diff.trim()) {
      this.debug("Returning diff with length:", diff.length);
      return diff;
    }

    // Fallback to status to confirm staged state before returning an empty message
    const status = await git.status();
    const hasStagedFiles = status.files.some((file) => file.index !== " ");
    this.debug("Status check - has staged files:", hasStagedFiles);
    this.debug(
      "Status files:",
      status.files.map((file) => ({ path: file.path, index: file.index, working_dir: file.working_dir }))
    );

    if (!hasStagedFiles) {
      throw new Error("Aucun fichier n'est actuellement staged.");
    }

    return diff;
  }

  /**
   * Returns the working directory diff (unstaged) and status summary.
   */
  async getWorkingChanges(): Promise<string> {
    this.debug("Getting working directory changes");
    const git = this.ensureRepo();
    const diff = await git.raw(["diff", "--color=never"]);
    const status = await git.status();

    const workingFiles = status.files.filter((file) => file.working_dir !== " ");
    const untracked = status.not_added ?? [];

    const hasWorkingChanges = Boolean(diff.trim()) || workingFiles.length > 0 || untracked.length > 0;

    if (!hasWorkingChanges) {
      throw new Error("Aucune modification dans le répertoire de travail.");
    }

    const statusLines: string[] = [];

    if (workingFiles.length > 0) {
      statusLines.push("Fichiers modifiés (non staged):");
      workingFiles.forEach((file) => {
        statusLines.push(`- ${file.path} (${file.working_dir})`);
      });
    }

    if (untracked.length > 0) {
      statusLines.push("Fichiers non suivis:");
      untracked.forEach((filePath) => {
        statusLines.push(`- ${filePath}`);
      });
    }

    const sections = [] as string[];
    if (statusLines.length > 0) {
      sections.push(statusLines.join("\n"));
    }
    if (diff.trim()) {
      sections.push(`Diff:\n${diff}`);
    }

    return sections.join("\n\n");
  }

  /**
   * Returns a lightweight status summary for AI prompting.
   */
  async getStatusSummary(): Promise<string> {
    const git = this.ensureRepo();
    const status = await git.status();
    const stagedCount = status.files.filter((file) => file.index !== " ").length;
    const modifiedCount = status.files.filter((file) => file.working_dir !== " ").length;
    const untrackedCount = status.not_added?.length ?? 0;

    return [
      `Branch: ${status.current ?? "detached"}`,
      `Ahead/behind: ${status.ahead}/${status.behind}`,
      `Staged files: ${stagedCount}`,
      `Modified files: ${modifiedCount}`,
      `Untracked files: ${untrackedCount}`
    ].join("\n");
  }

  /**
   * Executes a single git command and returns stdout/stderr.
   */
  async executeGitCommand(command: string, options?: { env?: NodeJS.ProcessEnv }): Promise<AiTerminalExecuteResult> {
    const trimmed = command.trim();
    if (!trimmed) {
      throw new Error("Commande Git vide.");
    }

    const parsed = this.splitCommand(trimmed);
    if (parsed.hasUnsafeOperator) {
      throw new Error("Les enchaînements de commandes ne sont pas autorisés.");
    }

    const args = parsed.args;
    if (args.length === 0 || args[0].toLowerCase() !== "git") {
      throw new Error("La commande doit commencer par 'git'.");
    }

    const isGlobal = this.isGlobalCommand(args);
    const requiresRepo = this.requiresRepo(args, isGlobal);
    let repoPath: string | null = null;

    try {
      repoPath = this.getCurrentRepo();
    } catch {
      repoPath = null;
    }

    if (!repoPath && requiresRepo) {
      throw new Error("Aucun dépôt ouvert pour exécuter cette commande.");
    }

    const cwd = repoPath ?? os.homedir();
    const start = Date.now();

    return new Promise((resolve, reject) => {
      const child = spawn("git", args.slice(1), {
        cwd,
        windowsHide: true,
        env: options?.env ? { ...process.env, ...options.env } : process.env
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      child.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      child.once("error", (error) => {
        reject(error);
      });

      child.once("close", (code) => {
        resolve({
          command: trimmed,
          stdout,
          stderr,
          exitCode: typeof code === "number" ? code : null,
          durationMs: Date.now() - start,
          isGlobal
        });
      });
    });
  }

  /**
   * Builds a condensed commit graph (nodes + links) for consumption by the
   * frontend visualisation. The algorithm assigns deterministic lanes/colors so
   * the graph stays stable between refreshes.
   */
  async getCommitGraph(limit = 150): Promise<CommitGraphData> {
    const git = this.ensureRepo();

    this.debug(`Building commit graph with limit ${limit}`);

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
    this.debug(`Found ${branchAssignments.length} branches while assigning lanes`);

    const branchLaneMap = new Map<string, number>();

    branchAssignments.forEach((branch, index) => {
      branchLaneMap.set(branch.name, index);
      this.branchColorMap.set(branch.name, branch.color);
    });

    this.debug("Branch lane map:", Object.fromEntries(branchLaneMap));
    this.debug("Branch color map:", Object.fromEntries(this.branchColorMap));

    const lines = logRaw.split("\n").filter(Boolean);
    const commitLaneMap = new Map<string, number>();
    const commitColorMap = new Map<string, string>();
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

      let lane = commitLaneMap.get(hash) ?? this.pickLane(refs, branchLaneMap, commitLaneMap, nextLane);
      if (lane === nextLane) {
        nextLane += 1;
      }
      commitLaneMap.set(hash, lane);

      this.debug(`Commit ${hash.substring(0, 7)} assigned lane ${lane}, refs: ${refs.join(", ")}`);

      // Propagate lane to parents if they don't have one yet
      parents.forEach((parentHash: string, parentIndex: number) => {
        if (parentIndex === 0) {
          commitLaneMap.set(parentHash, lane);
          this.debug(`Propagated lane ${lane} to first parent ${parentHash.substring(0, 7)}`);
        }
      });

      const existingColor = commitColorMap.get(hash);
      const color = existingColor || this.resolveCommitColor(refs, lane);

      commitColorMap.set(hash, color);

      // Propagate color to the first parent to keep the main lane consistent
      parents.forEach((parentHash: string, parentIndex: number) => {
        if (parentIndex === 0) {
          commitColorMap.set(parentHash, color);
          this.debug(`Propagated color ${color} to first parent ${parentHash.substring(0, 7)}`);
        }
      });

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

      parents.forEach((parentHash: string, parentIndex: number) => {
        links.push({
          source: hash,
          target: parentHash,
          color,
          isFirstParent: parentIndex === 0
        });
      });
    });

    // Get HEAD commit hash
    const headHash = (await git.revparse(["HEAD"])).trim();

    // Add working directory node if there are uncommitted changes
    const status = await git.status();
    if (!status.isClean()) {
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

    return { nodes, links, head: headHash };
  }

  /**
   * Returns metadata and file list for a commit or working directory snapshot.
   */
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

  /**
   * Returns a diff for a specific file and commit scope.
   */
  async getDiff(hash: string, filePath: string): Promise<string> {
    const git = this.ensureRepo();
    const repoPath = this.getCurrentRepo();
    const relativeFilePath = path.relative(repoPath, path.resolve(repoPath, filePath));
    if (hash === "working-directory") {
      const diff = await git.raw(["diff", "--color=never", "--", relativeFilePath]);
      return diff;
    }
    if (hash === "staged") {
      const diff = await git.raw(["diff", "--cached", "--color=never", "--", relativeFilePath]);
      return diff;
    }
    const diff = await git.raw(["diff", "--color=never", `${hash}^!`, "--", relativeFilePath]);
    return diff;
  }

  /**
   * Creates a commit with the provided message.
   */
  async commit(message: string) {
    const git = this.ensureRepo();
    return git.commit(message);
  }

  /**
   * Checks out a branch by name.
   */
  async checkout(branchName: string) {
    const git = this.ensureRepo();
    await git.checkout(branchName);
  }

  /**
   * Creates a new branch, optionally from a base reference.
   */
  async createBranch(name: string, base?: string) {
    const git = this.ensureRepo();
    if (base) {
      await git.raw(["branch", name, base]);
      return;
    }
    await git.checkoutLocalBranch(name);
  }

  /**
   * Deletes a local branch.
   */
  async deleteBranch(name: string, force = false) {
    const git = this.ensureRepo();
    await git.deleteLocalBranch(name, force);
  }

  /**
   * Pulls updates from a remote.
   */
  async pull(remote = "origin", branch?: string) {
    const git = this.ensureRepo();
    if (!branch) {
      const branchSummary = await git.branch();
      branch = branchSummary.current;
    }
    return git.pull(remote, branch);
  }

  /**
   * Pushes commits to a remote.
   */
  async push(remote = "origin", branch?: string) {
    const git = this.ensureRepo();
    if (!branch) {
      const branchSummary = await git.branch();
      branch = branchSummary.current;
    }
    return git.push(remote, branch);
  }

  /**
   * Fetches updates from a remote.
   */
  async fetch(remote = "origin") {
    const git = this.ensureRepo();
    return git.fetch(remote);
  }

  /**
   * Merges the specified branch into the current branch.
   */
  async merge(branch: string) {
    const git = this.ensureRepo();
    return git.merge([branch]);
  }

  /**
   * Cherry-picks a commit by hash.
   */
  async cherryPick(commit: string) {
    const git = this.ensureRepo();
    await git.raw(["cherry-pick", commit]);
  }

  /**
   * Rebases the current branch onto the given reference.
   */
  async rebase(onto: string) {
    const git = this.ensureRepo();
    await git.raw(["rebase", onto]);
  }

  /**
   * Squashes selected commits into a single commit.
   */
  async squashCommits(commits: string[], message: string) {
    const git = this.ensureRepo();
    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
      throw new Error("Le message du commit résultant ne peut pas être vide.");
    }

    const { commits: normalized, base } = await this.normalizeRewriteSelection(commits);
    if (normalized.length < 2) {
      throw new Error("Sélectionnez au moins deux commits pour réaliser un squash.");
    }

    await git.reset(["--soft", base]);
    await git.commit(trimmedMessage);
  }

  /**
   * Drops selected commits from the current branch.
   */
  async dropCommits(commits: string[]) {
    const git = this.ensureRepo();
    const { commits: normalized, base } = await this.normalizeRewriteSelection(commits);

    if (normalized.length === 0) {
      throw new Error("Aucun commit valide n'a été fourni pour suppression.");
    }

    await git.reset(["--hard", base]);
  }

  /**
   * Stashes working directory changes.
   */
  async stash(message?: string) {
    const git = this.ensureRepo();
    if (message) {
      return git.stash(["push", "-m", message]);
    }
    return git.stash();
  }

  /**
   * Pops the most recent stash.
   */
  async stashPop() {
    const git = this.ensureRepo();
    return git.stash(["pop"]);
  }

  /**
   * Lists available stashes.
   */
  async stashList() {
    const git = this.ensureRepo();
    return git.stash(["list"]);
  }

  /**
   * Stages a single diff hunk.
   */
  async stageHunk(filePath: string, hunk: string) {
    this.debug(`Staging selected hunk for ${filePath}`);
    await this.applyPatchFromHunk(hunk, { "--cached": null });
  }

  /**
   * Discards a single diff hunk from the working tree.
   */
  async discardHunk(filePath: string, hunk: string) {
    this.debug(`Discarding selected hunk for ${filePath}`);
    await this.applyPatchFromHunk(hunk, { "--reverse": null });
  }

  /**
   * Unstages a single diff hunk.
   */
  async unstageHunk(filePath: string, hunk: string) {
    this.debug(`Unstaging selected hunk for ${filePath}`);
    await this.applyPatchFromHunk(hunk, { "--cached": null, "--reverse": null });
  }

  /**
   * Unstages an entire file.
   */
  async unstageFile(filePath: string) {
    const git = this.ensureRepo();
    return git.reset(['HEAD', '--', filePath]);
  }

  /**
   * Stages an entire file.
   */
  async stageFile(filePath: string) {
    const git = this.ensureRepo();
    return git.add(filePath);
  }

  /**
   * Reads a Git configuration value.
   */
  async getGitConfig(key: string): Promise<string> {
    const git = this.ensureRepo();
    try {
      const value = await git.raw(['config', '--get', key]);
      return value.trim();
    } catch (error) {
      return '';
    }
  }

  /**
   * Writes a Git configuration value.
   */
  async setGitConfig(key: string, value: string, global = false): Promise<void> {
    const git = this.ensureRepo();
    const scope = global ? '--global' : '--local';
    await git.raw(['config', scope, key, value]);
  }

  /**
   * Ensures the list of commits selected for rewrite/reset operations is valid
   * (same first-parent chain that reaches HEAD) and returns the commits ordered
   * from newest to oldest alongside the base reference to reset to.
   */
  private async normalizeRewriteSelection(commits: string[]): Promise<{ commits: string[]; base: string }> {
    const git = this.ensureRepo();
    const filtered = commits.filter((hash) => hash && hash !== "working-directory");

    if (filtered.length === 0) {
      throw new Error("Aucun commit valide sélectionné.");
    }

    const normalized = Array.from(new Set(filtered));

    const status = await git.status();
    if (!status.isClean()) {
      throw new Error("Le répertoire de travail doit être propre avant de réécrire l'historique.");
    }

    const head = (await git.revparse(["HEAD"])).trim();
    if (!normalized.includes(head)) {
      throw new Error("La sélection doit inclure le commit HEAD (le plus récent).");
    }

    const selected = new Set(normalized);
    const ordered: string[] = [];
    let current: string | null = head;
    let base: string | null = null;

    while (current && selected.has(current)) {
      ordered.push(current);
      selected.delete(current);

      const parentsRaw: string = await git.raw(["rev-list", "--parents", "-n", "1", current]);
      const parts: string[] = parentsRaw.trim().split(" ");
      if (parts[0] !== current) {
        throw new Error(`Impossible de lire les parents du commit ${current.substring(0, 7)}.`);
      }

      const firstParent: string | null = parts[1] ?? null;
      current = firstParent;
      base = firstParent;
    }

    if (selected.size > 0) {
      throw new Error("Les commits sélectionnés doivent être contigus sur la même branche (first-parent).");
    }

    if (!base) {
      throw new Error("Impossible de réécrire le commit initial du dépôt.");
    }

    return { commits: ordered, base };
  }

  /**
   * Determines the lane index for a commit based on branch refs.
   */
  private pickLane(
    refs: string[],
    branchLaneMap: Map<string, number>,
    commitLaneMap: Map<string, number>,
    nextLane: number
  ) {
    this.debug(`pickLane called with refs: ${refs.join(", ")}, nextLane: ${nextLane}`);

    for (const ref of refs) {
      const lane = branchLaneMap.get(ref);
      if (typeof lane === "number") {
        this.debug(`Found existing lane ${lane} for ref ${ref}`);
        return lane;
      }
    }

    for (const ref of refs) {
      if (!branchLaneMap.has(ref)) {
        branchLaneMap.set(ref, nextLane);
        this.debug(`Assigned new lane ${nextLane} for ref ${ref}`);
        return nextLane;
      }
    }

    if (refs.length) {
      const lane = branchLaneMap.get(refs[0]) ?? 0;
      this.debug(`Using existing lane ${lane} for ref ${refs[0]}`);
      return lane;
    }

    this.debug(`Using nextLane ${nextLane} for commit without refs`);
    return nextLane;
  }

  /**
   * Resolves a color for a commit based on branch refs or lane fallback.
   */
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

  /**
   * Returns the color assigned to a branch or allocates a new one.
   */
  private getBranchColor(branchName: string, fallbackIndex: number) {
    const existing = this.branchColorMap.get(branchName);
    if (existing) {
      return existing;
    }

    const color = COLOR_PALETTE[fallbackIndex % COLOR_PALETTE.length];
    this.branchColorMap.set(branchName, color);
    return color;
  }

  /**
   * Clones a repository into the specified local path.
   */
  async cloneRepository(repoUrl: string, localPath: string): Promise<void> {
    const normalized = path.resolve(localPath);
    
    // Vérifier que le dossier n'existe pas déjà
    if (fs.existsSync(normalized)) {
      throw new Error(`Le dossier ${normalized} existe déjà. Veuillez choisir un autre emplacement.`);
    }

    // Créer le dossier parent si nécessaire
    const parentDir = path.dirname(normalized);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    // Cloner le dépôt
    await simpleGit().clone(repoUrl, normalized);
  }

  /**
   * Splits a command string into arguments and detects unsafe operators.
   */
  private splitCommand(input: string): { args: string[]; hasUnsafeOperator: boolean } {
    const args: string[] = [];
    let current = "";
    let quote: '"' | "'" | null = null;
    let escape = false;
    let hasUnsafeOperator = false;

    for (const char of input) {
      if (escape) {
        current += char;
        escape = false;
        continue;
      }
      if (char === "\\") {
        escape = true;
        continue;
      }
      if (quote) {
        if (char === quote) {
          quote = null;
        } else {
          current += char;
        }
        continue;
      }
      if (char === '"' || char === "'") {
        quote = char;
        continue;
      }
      if (char === "|" || char === ";" || char === "&") {
        hasUnsafeOperator = true;
        continue;
      }
      if (/\s/.test(char)) {
        if (current) {
          args.push(current);
          current = "";
        }
        continue;
      }
      current += char;
    }

    if (current) {
      args.push(current);
    }

    return { args, hasUnsafeOperator };
  }

  /**
   * Returns true when the command targets global/system config.
   */
  private isGlobalCommand(args: string[]): boolean {
    return args.some((arg) => {
      const lower = arg.toLowerCase();
      return lower === "--global" || lower === "--system";
    });
  }

  /**
   * Returns true when the command should run inside a repo.
   */
  private requiresRepo(args: string[], isGlobal: boolean): boolean {
    if (isGlobal) {
      return false;
    }
    const subcommand = args[1]?.toLowerCase() ?? "";
    if (!subcommand) {
      return false;
    }
    const noRepoCommands = new Set(["clone", "init", "config", "help", "version", "--version", "--help", "ls-remote"]);
    if (noRepoCommands.has(subcommand) || subcommand.startsWith("-")) {
      return false;
    }
    return true;
  }

  /**
   * Reads conflict content from a specific stage, returning null when missing.
   */
  private async getConflictStageContent(git: SimpleGit, filePath: string, stage: number): Promise<string | null> {
    try {
      return await git.raw(["show", `:${stage}:${filePath}`]);
    } catch {
      return null;
    }
  }

  /**
   * Detects null bytes in content to infer binary payloads.
   */
  private containsBinary(content: string): boolean {
    for (let index = 0; index < content.length; index += 1) {
      if (content.charCodeAt(index) === 0) {
        return true;
      }
    }
    return false;
  }

  /**
   * Writes the provided hunk to a temporary patch file, applies it with the
   * requested options, and always cleans up the temporary artifact.
   */
  /**
   * Writes a temporary patch file and applies it with git.
   */
  private async applyPatchFromHunk(hunk: string, options: Record<string, null>) {
    const git = this.ensureRepo();
    const tempFile = path.join(
      os.tmpdir(),
      `patch-${Date.now()}-${Math.random().toString(16).slice(2)}.patch`
    );
    await fs.promises.writeFile(tempFile, hunk, "utf8");
    try {
      await git.applyPatch(tempFile, options);
    } finally {
      await fs.promises.unlink(tempFile).catch(() => undefined);
    }
  }
}
