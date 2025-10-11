import { app, BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BackendServer } from "../backend/server.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.env.NODE_ENV === "development";
let mainWindow: BrowserWindow | null = null;
let backend: BackendServer | null = null;

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
  backend = new BackendServer(app.getPath("userData"));

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
    "repo:commit",
    async (_event: IpcMainInvokeEvent, message: string) => buildResponse(backend!.commit(message))
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
      buildResponse(backend!.getGitLabConfig(payload.key))
  );

  ipcMain.handle(
    "gitlab:set-config",
    async (_event: IpcMainInvokeEvent, payload: { key: string; value: string }) =>
      buildResponse(backend!.setGitLabConfig(payload.key, payload.value))
  );

  ipcMain.handle(
    "gitlab:clear-config",
    async () => buildResponse(backend!.clearGitLabConfig())
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
    "ollama:get-config",
    async (_event: IpcMainInvokeEvent, payload: { key: string }) =>
      buildResponse(Promise.resolve(backend!.getOllamaConfig(payload.key)))
  );

  ipcMain.handle(
    "ollama:set-config",
    async (_event: IpcMainInvokeEvent, payload: { key: string; value: string }) =>
      buildResponse(backend!.setOllamaConfig(payload.key, payload.value))
  );

  ipcMain.handle(
    "ollama:clear-config",
    async () => buildResponse(backend!.clearOllamaConfig())
  );

  ipcMain.handle(
    "ollama:generate-commit-message",
    async () => buildResponse(backend!.generateCommitMessage())
  );

  ipcMain.handle(
    "repo:clone",
    async (_event: IpcMainInvokeEvent, payload: { repoUrl: string; localPath: string }) =>
      buildResponse(backend!.cloneRepository(payload.repoUrl, payload.localPath).then(result => openAndSnapshot(result.path)))
  );
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
