import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Calendar,
  File,
  FileDiff,
  FileText,
  GitCommit,
  User
} from "lucide-react";
import {
  createSearchParams,
  useNavigate,
  useParams,
  useSearchParams
} from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useRepoContext, type DiffScope } from "../context/RepoContext";
import DiffViewer from "../components/DiffViewer";
import { unwrap } from "../utils/ipc";
import { getBciGit, tryGetBciGit } from "../utils/bciGit";

const DiffView: React.FC = () => {
  const { commitHash } = useParams<{ commitHash: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language ?? "en";
  const {
    repo,
    selectedCommit,
    selectCommit,
    commitDetails,
    diff,
    loadDiff,
    workingDirStatus,
    commit,
    loading,
    unstageFile,
    stageFile
  } = useRepoContext();

  const filePath = searchParams.get("file") ?? "";
  const [showCommitModal, setShowCommitModal] = useState(false);
  const [commitTitle, setCommitTitle] = useState('');
  const [commitDescription, setCommitDescription] = useState('');
  const [copilotEnabled, setCopilotEnabled] = useState(false);
  const [generationLoading, setGenerationLoading] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  const isWorkingDirectory = commitHash === "working-directory";
  const scopeParam = searchParams.get("scope");
  const requestedScope: DiffScope | null = scopeParam === "staged"
    ? "staged"
    : scopeParam === "working"
      ? "working"
      : null;
  const effectiveScope: DiffScope = isWorkingDirectory
    ? requestedScope ?? "working"
    : "commit";
  const stagedFiles = useMemo(
    () => (workingDirStatus?.files ?? []).filter((file: any) => file.index !== ' '),
    [workingDirStatus]
  );
  const unstagedFiles = useMemo(
    () => (workingDirStatus?.files ?? []).filter((file: any) => file.working_dir !== ' '),
    [workingDirStatus]
  );
  const partialStagedPaths = useMemo(
    () => new Set(stagedFiles.filter((file: any) => file.working_dir !== ' ').map((file: any) => file.path)),
    [stagedFiles]
  );

  useEffect(() => {
    if (!repo) {
      navigate("/", { replace: true });
    }
  }, [navigate, repo]);

  useEffect(() => {
    if (!showCommitModal) {
      return;
    }

    const loadCopilotConfig = async () => {
      try {
        const bciGit = tryGetBciGit();
        if (!bciGit) {
          return;
        }
        const result = await bciGit.getCopilotConfig("enabled");
        if (result.success) {
          setCopilotEnabled(result.data === "true");
        }
      } catch (error) {
        console.error("[DiffView]", error);
      }
    };

    void loadCopilotConfig();
  }, [showCommitModal]);

  useEffect(() => {
    if (commitHash && commitHash !== "working-directory" && commitHash !== selectedCommit) {
      void selectCommit(commitHash);
    }
  }, [commitHash, selectCommit, selectedCommit]);

  useEffect(() => {
    if (filePath && commitHash && ((commitDetails?.hash === commitHash) || commitHash === "working-directory")) {
      void loadDiff(filePath, { scope: effectiveScope });
    }
  }, [commitDetails?.hash, commitHash, effectiveScope, filePath, loadDiff]);

  const currentDiff = useMemo(() => {
    if (!diff || diff.file !== filePath) {
      return null;
    }
    return diff;
  }, [diff, filePath]);

  const handleCommit = () => {
    setGenerationError(null);
    setGenerationLoading(false);
    setShowCommitModal(true);
  };

  const handleConfirmCommit = async () => {
    if (commitTitle.trim()) {
      await commit(`${commitTitle}\n\n${commitDescription}`.trim());
      setCommitTitle('');
      setCommitDescription('');
      setGenerationError(null);
      setGenerationLoading(false);
      setShowCommitModal(false);
    }
  };

  const handleGenerateCommitMessage = async () => {
    if (generationLoading) {
      return;
    }

    setGenerationLoading(true);
    setGenerationError(null);
    try {
      const bciGit = getBciGit();
      const { title, description } = await unwrap(bciGit.generateCommitMessage());
      setCommitTitle(title);
      setCommitDescription(description);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[DiffView] Generation error:', message);
      setGenerationError(message);
    } finally {
      setGenerationLoading(false);
    }
  };

  const handleCancelCommit = () => {
    setCommitTitle('');
    setCommitDescription('');
    setGenerationError(null);
    setGenerationLoading(false);
    setShowCommitModal(false);
  };

  const isCommitLoaded = commitHash === "working-directory" || (commitDetails?.hash === commitHash);
  const activeDetails = isCommitLoaded ? commitDetails : null;

  if (!commitHash) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-900 text-sm text-slate-400">
        {t("diffView.invalidHash")}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-slate-900 text-slate-100">
      <header className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigate("/repo")}
            className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-300 transition hover:border-cyan-400/40 hover:bg-slate-800/70 hover:text-cyan-200"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("diffView.backToRepo")}
          </button>
          {isWorkingDirectory && stagedFiles.length > 0 && (
            <button
              type="button"
              onClick={handleCommit}
              disabled={loading}
              className="flex items-center gap-2 rounded-lg border border-emerald-600/40 bg-emerald-600/10 px-3 py-2 text-xs font-medium text-emerald-200 transition hover:bg-emerald-600/20 disabled:opacity-50"
            >
              <GitCommit className="h-4 w-4" />
              {t("diffView.commitButton")}
            </button>
          )}
          <div>
            <div className="text-[11px] uppercase tracking-wide text-slate-500">
              {commitHash === "working-directory" ? t("diffView.workingDiffLabel") : t("diffView.commitDiffLabel")}
            </div>
            <h1 className="mt-1 text-lg font-semibold text-slate-100">
              {isWorkingDirectory ? t("diffView.workingHeading") : (activeDetails ? activeDetails.message : t("diffView.loading"))}
            </h1>
            {activeDetails && commitHash !== "working-directory" && (
              <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-400">
                <InfoPill
                  icon={<User className="h-4 w-4" />}
                  text={t("diffView.info.author", { author: activeDetails.author })}
                />
                <InfoPill
                  icon={<Calendar className="h-4 w-4" />}
                  text={t("diffView.info.date", {
                    date: new Intl.DateTimeFormat(locale, {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit"
                    }).format(new Date(activeDetails.date))
                  })}
                />
                <InfoPill
                  icon={<FileText className="h-4 w-4" />}
                  text={
                    <code className="rounded bg-slate-900/60 px-2 py-1 text-[11px] text-cyan-300">
                      {activeDetails.hash}
                    </code>
                  }
                />
              </div>
            )}
          </div>
        </div>
        {repo && (
          <div className="text-right text-xs text-slate-500">
            <p className="font-medium text-slate-300">{repo.name}</p>
            <p className="text-[11px]">{repo.path}</p>
          </div>
        )}
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="w-72 border-r border-slate-800 bg-slate-900/80 px-5 py-4 text-sm text-slate-300">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-500">
            <FileDiff className="h-4 w-4" />
            {t("diffView.sidebar.header")}
          </div>
          <div className="mt-4 space-y-2">
            {!isCommitLoaded && !isWorkingDirectory && (
              <p className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 text-xs text-slate-500">
                {t("diffView.sidebar.loading")}
              </p>
            )}
            {isWorkingDirectory && workingDirStatus ? (
              <>
                {stagedFiles.length > 0 && (
                  <div className="mb-3">
                    <div className="text-xs font-medium text-emerald-300 mb-2">{t("diffView.sidebar.stagedTitle")}</div>
                    <div className="space-y-1">
                      {stagedFiles.map((file: any) => {
                        const isActive = isWorkingDirectory && file.path === filePath && effectiveScope === "staged";
                        return (
                          <div
                            key={`${file.path}-staged`}
                            onClick={() => navigate({
                              pathname: `/repo/diff/working-directory`,
                              search: `?${createSearchParams({ file: file.path, scope: "staged" })}`
                            })}
                            className={`flex w-full cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-left text-xs transition ${
                              isActive
                                ? "border-cyan-400/40 bg-cyan-500/10 text-cyan-100"
                                : "border-slate-800 bg-slate-900/40 text-slate-300 hover:border-cyan-400/30 hover:bg-slate-800/60"
                            }`}
                          >
                            <span className="flex items-center gap-2">
                              <span className="truncate">{file.path}</span>
                              {partialStagedPaths.has(file.path) && (
                                <span className="rounded bg-amber-500/10 px-2 py-0.5 text-[10px] uppercase text-amber-200">{t("diffView.sidebar.partial")}</span>
                              )}
                            </span>
                            <div className="flex gap-1">
                              <button
                                type="button"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  await unstageFile(file.path);
                                  if (filePath) void loadDiff(filePath, { scope: effectiveScope });
                                }}
                                className="rounded border border-amber-600/40 bg-amber-600/10 px-2 py-1 text-[10px] text-amber-200 transition hover:bg-amber-600/20"
                              >
                                {t("diffView.sidebar.unstage")}
                              </button>
                              <FileDiff className="h-4 w-4 text-slate-500" />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {unstagedFiles.length > 0 && (
                  <div className="mb-3">
                    <div className="text-xs font-medium text-amber-300 mb-2">{t("diffView.sidebar.unstagedTitle")}</div>
                    <div className="space-y-1">
                      {unstagedFiles.map((file: any) => {
                        const isActive = isWorkingDirectory && file.path === filePath && effectiveScope === "working";
                        return (
                          <div
                            key={`${file.path}-unstaged`}
                            onClick={() => navigate({
                              pathname: `/repo/diff/working-directory`,
                              search: `?${createSearchParams({ file: file.path, scope: "working" })}`
                            })}
                            className={`flex w-full cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-left text-xs transition ${
                              isActive
                                ? "border-cyan-400/40 bg-cyan-500/10 text-cyan-100"
                                : "border-slate-800 bg-slate-900/40 text-slate-300 hover:border-cyan-400/30 hover:bg-slate-800/60"
                            }`}
                          >
                            <span className="flex items-center gap-2">
                              <span className="truncate">{file.path}</span>
                              {partialStagedPaths.has(file.path) && (
                                <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase text-emerald-200">{t("diffView.sidebar.partial")}</span>
                              )}
                            </span>
                            <div className="flex gap-1">
                              <button
                                type="button"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  await stageFile(file.path);
                                  if (filePath) void loadDiff(filePath, { scope: effectiveScope });
                                }}
                                className="rounded border border-emerald-600/40 bg-emerald-600/10 px-2 py-1 text-[10px] text-emerald-200 transition hover:bg-emerald-600/20"
                              >
                                {partialStagedPaths.has(file.path) ? t("diffView.sidebar.stageRest") : t("diffView.sidebar.stage")}
                              </button>
                              <FileDiff className="h-4 w-4 text-slate-500" />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {(workingDirStatus.not_added || []).length > 0 && (
                  <div className="mb-3">
                    <div className="text-xs font-medium text-blue-300 mb-2">{t("diffView.sidebar.untrackedTitle")}</div>
                    <div className="space-y-1">
                      {workingDirStatus.not_added.map((file: string) => (
                        <div key={file} className="flex items-center gap-2 text-xs text-slate-300">
                          <span className="truncate">{file}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {stagedFiles.length === 0 && unstagedFiles.length === 0 && (workingDirStatus.not_added || []).length === 0 && (
                  <div className="text-xs text-slate-500">{t("diffView.sidebar.noChanges")}</div>
                )}
              </>
            ) : isWorkingDirectory ? (
              <div className="text-xs text-slate-500">{t("diffView.sidebar.workingLoading")}</div>
            ) : null}
            {activeDetails && !isWorkingDirectory && activeDetails.files.length === 0 && (
              <p className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 text-xs text-slate-500">
                {t("commitDetails.noFilesInCommit")}
              </p>
            )}
            {activeDetails && !isWorkingDirectory &&
              activeDetails.files.map((file) => {
                const isActive = file.path === filePath;
                return (
                  <button
                    key={`${file.status}-${file.path}`}
                    type="button"
                    onClick={() =>
                      navigate({
                        pathname: `/repo/diff/${commitHash}`,
                        search: `?${createSearchParams({ file: file.path })}`
                      })
                    }
                    className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-xs transition ${
                      isActive
                        ? "border-cyan-400/40 bg-cyan-500/10 text-cyan-100"
                        : "border-slate-800 bg-slate-900/40 text-slate-300 hover:border-cyan-400/30 hover:bg-slate-800/60"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="rounded bg-slate-800/70 px-2 py-0.5 text-[10px] uppercase text-slate-400">
                        {file.status}
                      </span>
                      <span className="truncate">{file.path}</span>
                    </span>
                    <FileDiff className="h-4 w-4 text-slate-500" />
                  </button>
                );
              })}
          </div>
        </aside>

        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-800 px-6 py-3 text-xs text-slate-400">
            <span>{filePath ? filePath : t("diffView.noFileSelected")}</span>
            {activeDetails && !isWorkingDirectory && (
              <span>
                {t("diffView.fileCount", { count: activeDetails.files.length })}
              </span>
            )}
          </div>

          <div className="flex-1 overflow-auto bg-slate-900 px-6 py-5">
            {!filePath && (
              <div className="rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-6 text-xs text-slate-500">
                {t("diffView.selectFilePrompt")}
              </div>
            )}
            {filePath && !currentDiff && (
              <div className="rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-6 text-xs text-slate-500">
                {t("diffView.loadingDiff")}
              </div>
            )}
            {filePath && currentDiff && (
              <div className="space-y-4">
                <div className="rounded-lg border border-slate-800 bg-slate-900/80 px-4 py-2 text-xs text-cyan-200">
                  {currentDiff.file}
                </div>
                <div className="scrollbar-thin max-h-[70vh] overflow-auto">
                  <DiffViewer
                    diff={currentDiff.content}
                    filePath={filePath}
                    isWorkingDirectory={isWorkingDirectory}
                    scope={currentDiff.scope}
                    onHunkAction={() => {
                      if (isWorkingDirectory && filePath) {
                        void loadDiff(filePath, { scope: currentDiff.scope });
                      }
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {showCommitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-96 rounded-lg border border-slate-800 bg-slate-900 p-6">
            <h3 className="text-lg font-semibold text-slate-100">{t("diffView.modal.title")}</h3>
            <p className="mt-2 text-sm text-slate-400">
              {t("diffView.modal.description")}
            </p>
            {copilotEnabled && (
              <div className="mt-4 flex items-center justify-between gap-3">
                <span className="text-xs text-slate-500">{t("diffView.modal.copilotHint")}</span>
                <button
                  type="button"
                  onClick={handleGenerateCommitMessage}
                  className="rounded border border-emerald-600/40 bg-emerald-600/10 px-3 py-2 text-xs text-emerald-200 transition hover:bg-emerald-600/20 disabled:opacity-50"
                  disabled={generationLoading || loading}
                >
                  {generationLoading ? t("diffView.modal.generating") : t("diffView.modal.generate")}
                </button>
              </div>
            )}
            <div className="mt-4 space-y-3">
              <input
                type="text"
                value={commitTitle}
                onChange={(e) => setCommitTitle(e.target.value)}
                className="w-full rounded border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
                placeholder={t("diffView.modal.titlePlaceholder")}
              />
              <textarea
                value={commitDescription}
                onChange={(e) => setCommitDescription(e.target.value)}
                className="w-full rounded border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
                placeholder={t("diffView.modal.descriptionPlaceholder")}
                rows={3}
              />
            </div>
            {generationError && (
              <div className="mt-2 rounded border border-amber-600/40 bg-amber-600/10 px-3 py-2 text-xs text-amber-200">
                {generationError}
              </div>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={handleCancelCommit}
                className="rounded border border-slate-800 bg-slate-900 px-4 py-2 text-sm text-slate-300 transition hover:bg-slate-800"
              >
                {t("diffView.modal.cancel")}
              </button>
              <button
                type="button"
                onClick={handleConfirmCommit}
                disabled={!commitTitle.trim() || loading}
                className="rounded border border-emerald-600/40 bg-emerald-600/10 px-4 py-2 text-sm text-emerald-200 transition hover:bg-emerald-600/20 disabled:opacity-50"
              >
                {loading ? t("diffView.modal.confirmLoading") : t("diffView.modal.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const InfoPill: React.FC<{ icon: React.ReactNode; text: React.ReactNode }> = ({ icon, text }) => (
  <span className="flex items-center gap-2 text-slate-400">
    <span className="text-slate-500">{icon}</span>
    <span>{text}</span>
  </span>
);

export default DiffView;
