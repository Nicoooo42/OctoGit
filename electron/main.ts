import { app, BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent } from "electron";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BackendServer } from "../backend/server.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.env.NODE_ENV === "development";
let mainWindow: BrowserWindow | null = null;
let backend: BackendServer | null = null;
let copilotServerProcess: ChildProcessWithoutNullStreams | null = null;

type BackendResult<T> = { success: true; data: T } | { success: false; error: string };

type RepoSnapshot = {
  repo: { path: string; name: string };
  commits: Awaited<ReturnType<BackendServer["getCommitGraph"]>>;
  branches: Awaited<ReturnType<BackendServer["getBranches"]>>;
};

function buildResponse<T>(promise: Promise<T>): Promise<BackendResult<T>> {
  return promise
    .then((data) => ({ success: true as const, data }))
    .catch((error: unknown) => ({ success: false as const, error: toMessage(error) }));
}

function toMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

async function createWindow() {
  backend = new BackendServer(app.getPath("userData"), {
    onPeriodicFetch: (payload) => {
      if (!mainWindow || mainWindow.isDestroyed()) {
        return;
      }
      mainWindow.webContents.send("repo:periodic-fetch", payload);
    }
  });

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 720,
    title: "BciGit",
    backgroundColor: "#0f172a",
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: "hidden",
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      spellcheck: false
    }
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow?.show();
    if (isDev) {
      mainWindow?.webContents.openDevTools({ mode: "detach" });
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }: { url: string }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev) {
    await mainWindow.loadURL("http://localhost:5173");
  } else {
    const indexPath = path.join(__dirname, "../renderer/index.html");
    await mainWindow.loadFile(indexPath);
  }

  registerIpcHandlers();
  await autoStartCopilotServerIfEnabled();
}

function registerIpcHandlers() {
  if (!backend) return;

  ipcMain.handle("app:get-recents", async () => buildResponse(Promise.resolve(backend!.listRecentRepositories())));

  ipcMain.handle("dialog:open-repository", async () => {
    if (!mainWindow) {
      return { success: false, error: "La fenêtre principale n'est pas initialisée." };
    }

    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory", "createDirectory"],
      title: "Sélectionner un dépôt Git"
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, error: "Aucun dossier sélectionné" };
    }

    return buildResponse(openAndSnapshot(result.filePaths[0]));
  });

  ipcMain.handle("repo:open", async (_event: IpcMainInvokeEvent, repoPath: string) => buildResponse(openAndSnapshot(repoPath)));

  ipcMain.handle("repo:branches", async () => buildResponse(backend!.getBranches()));
  ipcMain.handle("repo:tags", async () => buildResponse(backend!.getTags()));
  ipcMain.handle("repo:commits", async () => buildResponse(backend!.getCommitGraph()));
  ipcMain.handle(
    "repo:commit-details",
    async (_event: IpcMainInvokeEvent, hash: string) => buildResponse(backend!.getCommitDetails(hash))
  );
  ipcMain.handle(
    "repo:diff",
    async (_event: IpcMainInvokeEvent, payload: { hash: string; filePath: string }) =>
      buildResponse(backend!.getDiff(payload.hash, payload.filePath))
  );
  ipcMain.handle(
    "repo:working-dir-status",
    async () => buildResponse(backend!.getWorkingDirStatus())
  );
  ipcMain.handle(
    "repo:merge-conflicts",
    async () => buildResponse(backend!.getMergeConflicts())
  );
  ipcMain.handle(
    "repo:commit",
    async (_event: IpcMainInvokeEvent, message: string) => buildResponse(backend!.commit(message))
  );
  ipcMain.handle(
    "repo:resolve-conflict",
    async (_event: IpcMainInvokeEvent, payload: { filePath: string; strategy: "ours" | "theirs" }) =>
      buildResponse(backend!.resolveConflict(payload.filePath, payload.strategy))
  );
  ipcMain.handle(
    "repo:save-conflict-resolution",
    async (
      _event: IpcMainInvokeEvent,
      payload: { filePath: string; content: string; stage?: boolean }
    ) => buildResponse(backend!.saveConflictResolution(payload.filePath, payload.content, payload.stage ?? true))
  );
  ipcMain.handle(
    "repo:checkout",
    async (_event: IpcMainInvokeEvent, branch: string) => buildResponse(backend!.checkout(branch))
  );
  ipcMain.handle(
    "repo:create-branch",
    async (_event: IpcMainInvokeEvent, payload: { name: string; base?: string }) =>
      buildResponse(backend!.createBranch(payload.name, payload.base))
  );
  ipcMain.handle(
    "repo:delete-branch",
    async (_event: IpcMainInvokeEvent, payload: { name: string; force?: boolean }) =>
      buildResponse(backend!.deleteBranch(payload.name, payload.force))
  );
  ipcMain.handle(
    "repo:pull",
    async (_event: IpcMainInvokeEvent, payload: { remote?: string; branch?: string }) =>
      buildResponse(backend!.pull(payload.remote, payload.branch))
  );
  ipcMain.handle(
    "repo:push",
    async (_event: IpcMainInvokeEvent, payload: { remote?: string; branch?: string }) =>
      buildResponse(backend!.push(payload.remote, payload.branch))
  );
  ipcMain.handle(
    "repo:fetch",
    async (_event: IpcMainInvokeEvent, remote?: string) => buildResponse(backend!.fetch(remote))
  );
  ipcMain.handle(
    "repo:merge",
    async (_event: IpcMainInvokeEvent, branch: string) => buildResponse(backend!.merge(branch))
  );
  ipcMain.handle(
    "repo:cherry-pick",
    async (_event: IpcMainInvokeEvent, hash: string) => buildResponse(backend!.cherryPick(hash))
  );
  ipcMain.handle(
    "repo:rebase",
    async (_event: IpcMainInvokeEvent, onto: string) => buildResponse(backend!.rebase(onto))
  );
  ipcMain.handle(
    "repo:squash-commits",
    async (_event: IpcMainInvokeEvent, payload: { commits: string[]; message: string }) =>
      buildResponse(backend!.squashCommits(payload.commits, payload.message))
  );
  ipcMain.handle(
    "repo:drop-commits",
    async (_event: IpcMainInvokeEvent, payload: { commits: string[] }) =>
      buildResponse(backend!.dropCommits(payload.commits))
  );
  ipcMain.handle(
    "repo:stash",
    async (_event: IpcMainInvokeEvent, message?: string) => buildResponse(backend!.stash(message))
  );
  ipcMain.handle(
    "repo:stash-pop",
    async () => buildResponse(backend!.stashPop())
  );
  ipcMain.handle(
    "repo:stash-list",
    async () => buildResponse(backend!.stashList())
  );
  ipcMain.handle(
    "repo:stage-hunk",
    async (_event: IpcMainInvokeEvent, payload: { filePath: string; hunk: string }) =>
      buildResponse(backend!.stageHunk(payload.filePath, payload.hunk))
  );
  ipcMain.handle(
    "repo:discard-hunk",
    async (_event: IpcMainInvokeEvent, payload: { filePath: string; hunk: string }) =>
      buildResponse(backend!.discardHunk(payload.filePath, payload.hunk))
  );
  ipcMain.handle(
    "repo:unstage-hunk",
    async (_event: IpcMainInvokeEvent, payload: { filePath: string; hunk: string }) =>
      buildResponse(backend!.unstageHunk(payload.filePath, payload.hunk))
  );
  ipcMain.handle(
    "repo:unstage-file",
    async (_event: IpcMainInvokeEvent, payload: { filePath: string }) =>
      buildResponse(backend!.unstageFile(payload.filePath))
  );
  ipcMain.handle(
    "repo:stage-file",
    async (_event: IpcMainInvokeEvent, payload: { filePath: string }) =>
      buildResponse(backend!.stageFile(payload.filePath))
  );

  ipcMain.handle(
    "config:get",
    async (_event: IpcMainInvokeEvent, payload: { key: string }) =>
      buildResponse(backend!.getGitConfig(payload.key))
  );

  ipcMain.handle(
    "config:set",
    async (_event: IpcMainInvokeEvent, payload: { key: string; value: string; global?: boolean }) =>
      buildResponse(backend!.setGitConfig(payload.key, payload.value, payload.global))
  );

  ipcMain.handle(
    "gitlab:get-config",
    async (_event: IpcMainInvokeEvent, payload: { key: string }) =>
      buildResponse(Promise.resolve(backend!.getGitLabConfig(payload.key)))
  );

  ipcMain.handle(
    "gitlab:set-config",
    async (_event: IpcMainInvokeEvent, payload: { key: string; value: string }) =>
      buildResponse(Promise.resolve(backend!.setGitLabConfig(payload.key, payload.value)))
  );

  ipcMain.handle(
    "gitlab:clear-config",
    async () => buildResponse(Promise.resolve(backend!.clearGitLabConfig()))
  );

  ipcMain.handle(
    "gitlab:test-connection",
    async () => buildResponse(backend!.testGitLabConnection())
  );

  ipcMain.handle(
    "gitlab:get-projects",
    async (_event: IpcMainInvokeEvent, payload: { page?: number; perPage?: number }) =>
      buildResponse(backend!.getGitLabProjects(payload.page, payload.perPage))
  );

  ipcMain.handle(
    "gitlab:get-merge-requests",
    async (_event: IpcMainInvokeEvent, payload: { projectId: number; state?: string }) =>
      buildResponse(backend!.getGitLabMergeRequests(payload.projectId, payload.state))
  );

  ipcMain.handle(
    "gitlab:create-merge-request",
    async (_event: IpcMainInvokeEvent, payload: { projectId: number; sourceBranch: string; targetBranch: string; title: string; description?: string }) =>
      buildResponse(backend!.createGitLabMergeRequest(payload.projectId, payload.sourceBranch, payload.targetBranch, payload.title, payload.description))
  );

  ipcMain.handle(
    "copilot:get-config",
    async (_event: IpcMainInvokeEvent, payload: { key: string }) =>
      buildResponse(Promise.resolve(backend!.getCopilotConfig(payload.key)))
  );

  ipcMain.handle(
    "copilot:set-config",
    async (_event: IpcMainInvokeEvent, payload: { key: string; value: string }) =>
      buildResponse(backend!.setCopilotConfig(payload.key, payload.value))
  );

  ipcMain.handle(
    "copilot:clear-config",
    async () => buildResponse(backend!.clearCopilotConfig())
  );

  ipcMain.handle(
    "copilot:generate-commit-message",
    async () => buildResponse(backend!.generateCommitMessage())
  );

  ipcMain.handle(
    "copilot:generate-branch-name-suggestions",
    async () => buildResponse(backend!.generateBranchNameSuggestions())
  );

  ipcMain.handle(
    "copilot:suggest-git-command",
    async (_event: IpcMainInvokeEvent, payload: { prompt: string }) =>
      buildResponse(backend!.suggestGitCommand(payload.prompt))
  );

  ipcMain.handle(
    "git:execute-command",
    async (_event: IpcMainInvokeEvent, payload: { command: string }) =>
      buildResponse(backend!.executeGitCommand(payload.command))
  );

  ipcMain.handle(
    "ai-terminal:clear-session",
    async () => buildResponse(backend!.clearAiTerminalSession())
  );

  ipcMain.handle(
    "copilot:start-server",
    async (_event: IpcMainInvokeEvent, payload: { port: number }) =>
      buildResponse(startCopilotServer(payload.port))
  );

  ipcMain.handle(
    "copilot:stop-server",
    async () => buildResponse(stopCopilotServer())
  );

  ipcMain.handle(
    "app:get-config",
    async (_event: IpcMainInvokeEvent, payload: { key: string }) =>
      buildResponse(Promise.resolve(backend!.getAppConfig(payload.key)))
  );

  ipcMain.handle(
    "app:set-config",
    async (_event: IpcMainInvokeEvent, payload: { key: string; value: string }) =>
      buildResponse(backend!.setAppConfig(payload.key, payload.value))
  );

  ipcMain.handle(
    "app:clear-config",
    async () => buildResponse(backend!.clearAppConfig())
  );

  ipcMain.handle(
    "repo:clone",
    async (_event: IpcMainInvokeEvent, payload: { repoUrl: string; localPath: string }) =>
      buildResponse(backend!.cloneRepository(payload.repoUrl, payload.localPath).then(result => openAndSnapshot(result.path)))
  );
}

function startCopilotServer(port: number): Promise<{ started: boolean; pid?: number; message?: string }> {
  if (copilotServerProcess && !copilotServerProcess.killed) {
    return Promise.resolve({
      started: false,
      pid: copilotServerProcess.pid ?? undefined,
      message: "Copilot CLI server is already running"
    });
  }

  return new Promise((resolve, reject) => {
    const child = spawn("copilot", ["--server", "--port", String(port)], {
      shell: true,
      windowsHide: true
    });

    let resolved = false;

    child.once("spawn", () => {
      copilotServerProcess = child;
      resolved = true;
      resolve({ started: true, pid: child.pid ?? undefined });
    });

    child.once("error", (error) => {
      if (!resolved) {
        resolved = true;
        reject(error);
      }
    });

    child.once("exit", (code, signal) => {
      if (copilotServerProcess === child) {
        copilotServerProcess = null;
      }
      if (!resolved) {
        resolved = true;
        resolve({ started: false, message: `Copilot CLI exited (${code ?? signal ?? "unknown"})` });
      }
    });

    child.stdout.on("data", (data) => {
      console.log(`[copilot-cli] ${data.toString().trim()}`);
    });

    child.stderr.on("data", (data) => {
      console.error(`[copilot-cli] ${data.toString().trim()}`);
    });
  });
}

/**
 * Automatically starts the Copilot CLI server if the autostart option is enabled in config.
 */
async function autoStartCopilotServerIfEnabled(): Promise<void> {
  if (!backend) return;

  const enabled = backend.getCopilotConfig("enabled");
  const autostart = backend.getCopilotConfig("server_autostart");

  if (enabled !== "true" || autostart !== "true") {
    return;
  }

  const cliUrl = backend.getCopilotConfig("cli_url") || "localhost:4321";
  const port = parsePortFromUrl(cliUrl);

  console.log(`[copilot-cli] Auto-starting Copilot CLI server on port ${port}...`);

  try {
    const result = await startCopilotServer(port);
    if (result.started) {
      console.log(`[copilot-cli] Auto-start successful (PID ${result.pid})`);
    } else {
      console.log(`[copilot-cli] Auto-start skipped: ${result.message}`);
    }
  } catch (error) {
    console.error(`[copilot-cli] Auto-start failed:`, error);
  }
}

/**
 * Parses a port number from a URL string like "localhost:4321" or just "4321".
 */
function parsePortFromUrl(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) return 4321;
  const match = trimmed.match(/:(\d{2,5})$/);
  if (match?.[1]) {
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) ? parsed : 4321;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : 4321;
}

function stopCopilotServer(): Promise<{ stopped: boolean; pid?: number; message?: string }> {
  if (!copilotServerProcess || copilotServerProcess.killed) {
    return Promise.resolve({ stopped: false, message: "Copilot CLI server is not running" });
  }

  const pid = copilotServerProcess.pid ?? undefined;
  const processRef = copilotServerProcess;

  return new Promise((resolve) => {
    processRef.once("exit", () => {
      if (copilotServerProcess === processRef) {
        copilotServerProcess = null;
      }
      resolve({ stopped: true, pid });
    });

    try {
      processRef.kill();
    } catch (error) {
      resolve({
        stopped: false,
        pid,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });
}

ipcMain.handle("window:minimize", () => {
  if (mainWindow) {
    mainWindow.minimize();
  }
});

ipcMain.handle("window:maximize", () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.handle("window:close", () => {
  if (mainWindow) {
    mainWindow.close();
  }
});

async function openAndSnapshot(repoPath: string): Promise<RepoSnapshot> {
  if (!backend) {
    throw new Error("Le serveur backend n'est pas prêt");
  }
  const repo = await backend.openRepository(repoPath);
  const [commits, branches] = await Promise.all([backend.getCommitGraph(), backend.getBranches()]);
  return { repo, commits, branches };
}

app.whenReady().then(async () => {
  await createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

ipcMain.handle("window:move", async (_event: IpcMainInvokeEvent, payload: { x: number; y: number }) => {
  if (mainWindow) {
    const [currentX, currentY] = mainWindow.getPosition();
    mainWindow.setPosition(currentX + payload.x, currentY + payload.y);
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
