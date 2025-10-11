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

  async getStagedChanges(): Promise<string> {
    console.log('[GitService] Getting staged changes');
    const git = this.ensureRepo();
    const diff = await git.raw(["diff", "--cached", "--color=never"]);
    console.log('[GitService] Raw diff result length:', diff.length);
    console.log('[GitService] Diff preview:', diff.substring(0, 200) + (diff.length > 200 ? '...' : ''));

    if (diff.trim()) {
      console.log('[GitService] Returning diff with length:', diff.length);
      return diff;
    }

    // Fallback to status to confirm staged state before returning an empty message
    const status = await git.status();
    const hasStagedFiles = status.files.some((file) => file.index !== " ");
    console.log('[GitService] Status check - has staged files:', hasStagedFiles);
    console.log('[GitService] Status files:', status.files.map(f => ({ path: f.path, index: f.index, working_dir: f.working_dir })));

    if (!hasStagedFiles) {
      throw new Error("Aucun fichier n'est actuellement staged.");
    }

    return diff;
  }

  async getCommitGraph(limit = 150): Promise<CommitGraphData> {
    const git = this.ensureRepo();

    console.log(`[GitService] Building commit graph with limit ${limit}`);

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
    console.log(`[GitService] Found ${branchAssignments.length} branches`);

    const branchLaneMap = new Map<string, number>();

    branchAssignments.forEach((branch, index) => {
      branchLaneMap.set(branch.name, index);
      this.branchColorMap.set(branch.name, branch.color);
    });

    console.log(`[GitService] Branch lane map:`, Object.fromEntries(branchLaneMap));
    console.log(`[GitService] Branch color map:`, Object.fromEntries(this.branchColorMap));

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

      console.log(`[GitService] Commit ${hash.substring(0,7)} assigned lane ${lane}, refs: ${refs.join(', ')}`);

      // Propagate lane to parents if they don't have one yet
      parents.forEach((parentHash: string) => {
        if (!commitLaneMap.has(parentHash)) {
          commitLaneMap.set(parentHash, lane);
          console.log(`[GitService] Propagated lane ${lane} to parent ${parentHash.substring(0,7)}`);
        }
      });

      const existingColor = commitColorMap.get(hash);
      const color = existingColor || this.resolveCommitColor(refs, lane);

      commitColorMap.set(hash, color);

      // Propagate color to parents if they don't have one yet
      parents.forEach((parentHash: string) => {
        if (!commitColorMap.has(parentHash)) {
          commitColorMap.set(parentHash, color);
          console.log(`[GitService] Propagated color ${color} to parent ${parentHash.substring(0,7)}`);
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

      parents.forEach((parentHash: string) => {
        links.push({
          source: hash,
          target: parentHash,
          color
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
    const relativeFilePath = path.relative(this.repoPath!, path.resolve(this.repoPath!, filePath));
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

  async dropCommits(commits: string[]) {
    const git = this.ensureRepo();
    const { commits: normalized, base } = await this.normalizeRewriteSelection(commits);

    if (normalized.length === 0) {
      throw new Error("Aucun commit valide n'a été fourni pour suppression.");
    }

    await git.reset(["--hard", base]);
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

  async getGitConfig(key: string): Promise<string> {
    const git = this.ensureRepo();
    try {
      const value = await git.raw(['config', '--get', key]);
      return value.trim();
    } catch (error) {
      return '';
    }
  }

  async setGitConfig(key: string, value: string, global = false): Promise<void> {
    const git = this.ensureRepo();
    const scope = global ? '--global' : '--local';
    await git.raw(['config', scope, key, value]);
  }

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

  private pickLane(
    refs: string[],
    branchLaneMap: Map<string, number>,
    commitLaneMap: Map<string, number>,
    nextLane: number
  ) {
    console.log(`[GitService] pickLane called with refs: ${refs.join(', ')}, nextLane: ${nextLane}`);

    for (const ref of refs) {
      const lane = branchLaneMap.get(ref);
      if (typeof lane === "number") {
        console.log(`[GitService] Found existing lane ${lane} for ref ${ref}`);
        return lane;
      }
    }

    for (const ref of refs) {
      if (!branchLaneMap.has(ref)) {
        branchLaneMap.set(ref, nextLane);
        console.log(`[GitService] Assigned new lane ${nextLane} for ref ${ref}`);
        return nextLane;
      }
    }

    if (refs.length) {
      const lane = branchLaneMap.get(refs[0]) ?? 0;
      console.log(`[GitService] Using existing lane ${lane} for ref ${refs[0]}`);
      return lane;
    }

    console.log(`[GitService] Using nextLane ${nextLane} for commit without refs`);
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
}
