import React, { useMemo } from "react";
import { Calendar, FileDiff, FileText, User } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useRepoContext } from "../context/RepoContext";

const CommitDetails: React.FC = () => {
  const { commitDetails, selectedCommit, repo, workingDirStatus } = useRepoContext();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language ?? "en";
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

  if (selectedCommit === "working-directory") {
    return (
  <aside className="flex h-full min-h-0 flex-col border-l border-slate-800 bg-slate-850/80 text-sm">
        <header className="border-b border-slate-800 px-6 py-5">
          <div className="text-xs uppercase tracking-wide text-slate-500">{t("commitDetails.workingDirectoryTitle")}</div>
          <h2 className="mt-2 text-lg font-semibold text-slate-100">{t("commitDetails.workingDirectorySubtitle")}</h2>
        </header>

        <div className="flex-1 overflow-auto px-6 py-4">
          {!workingDirStatus ? (
            <p className="text-slate-400">{t("commitDetails.loadingWorkingDir")}</p>
          ) : (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("commitDetails.modifiedFiles")}</h3>
              <div className="mt-3 space-y-2">
                {stagedFiles.length > 0 && (
                  <div>
                    <div className="text-[11px] font-medium uppercase tracking-wide text-emerald-300">{t("commitDetails.stagedLabel")}</div>
                    <div className="mt-2 space-y-1">
                      {stagedFiles.map((file: any) => (
                        <button
                          key={`${file.path}-staged-details`}
                          type="button"
                          onClick={() => {
                            navigate({
                              pathname: `/repo/diff/working-directory`,
                              search: `?file=${encodeURIComponent(file.path)}&scope=staged`
                            });
                          }}
                          className="flex w-full items-center justify-between rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 text-left text-xs text-slate-300 transition hover:border-cyan-400/30 hover:bg-slate-800/60"
                        >
                          <span className="flex items-center gap-2">
                            <span className="rounded bg-slate-800/70 px-2 py-0.5 text-[10px] uppercase text-slate-400">
                              {file.index}
                            </span>
                            <span className="truncate flex items-center gap-2">
                              {file.path}
                              {partialStagedPaths.has(file.path) && (
                                <span className="rounded bg-amber-500/10 px-2 py-0.5 text-[10px] uppercase text-amber-200">{t("commitDetails.partialBadge")}</span>
                              )}
                            </span>
                          </span>
                          <FileDiff className="h-4 w-4 text-slate-500" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {unstagedFiles.length > 0 && (
                  <div>
                    <div className="mt-4 text-[11px] font-medium uppercase tracking-wide text-amber-300">{t("commitDetails.unstagedLabel")}</div>
                    <div className="mt-2 space-y-1">
                      {unstagedFiles.map((file: any) => (
                        <button
                          key={`${file.path}-unstaged-details`}
                          type="button"
                          onClick={() => {
                            navigate({
                              pathname: `/repo/diff/working-directory`,
                              search: `?file=${encodeURIComponent(file.path)}&scope=working`
                            });
                          }}
                          className="flex w-full items-center justify-between rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 text-left text-xs text-slate-300 transition hover:border-cyan-400/30 hover:bg-slate-800/60"
                        >
                          <span className="flex items-center gap-2">
                            <span className="rounded bg-slate-800/70 px-2 py-0.5 text-[10px] uppercase text-slate-400">
                              {file.working_dir}
                            </span>
                            <span className="truncate flex items-center gap-2">
                              {file.path}
                              {partialStagedPaths.has(file.path) && (
                                <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase text-emerald-200">{t("commitDetails.partialBadge")}</span>
                              )}
                            </span>
                          </span>
                          <FileDiff className="h-4 w-4 text-slate-500" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {stagedFiles.length === 0 && unstagedFiles.length === 0 && (
                  <p className="rounded bg-slate-900/60 px-3 py-2 text-xs text-slate-500">
                    {t("commitDetails.noWorkingDirChanges")}
                  </p>
                )}
              </div>
            </section>
          )}
        </div>
      </aside>
    );
  }

  if (!commitDetails) {
    return (
  <aside className="flex h-full min-h-0 flex-col border-l border-slate-800 bg-slate-850/70 p-6 text-sm text-slate-400">
        <p>{t("commitDetails.loadingDetails")}</p>
      </aside>
    );
  }

  return (
  <aside className="flex h-full min-h-0 flex-col border-l border-slate-800 bg-slate-850/80 text-sm">
      <header className="border-b border-slate-800 px-6 py-5">
        <div className="text-xs uppercase tracking-wide text-slate-500">{t("commitDetails.header")}</div>
        <h2 className="mt-2 text-lg font-semibold text-slate-100">{commitDetails.message}</h2>
        <div className="mt-3 space-y-2 text-xs text-slate-400">
          <DetailLine icon={<User className="h-4 w-4" />} label={t("commitDetails.author")} value={commitDetails.author} />
          <DetailLine
            icon={<Calendar className="h-4 w-4" />}
            label={t("commitDetails.date")}
            value={new Intl.DateTimeFormat(locale, {
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit"
            }).format(new Date(commitDetails.date))}
          />
          <DetailLine
            icon={<FileText className="h-4 w-4" />}
            label={t("commitDetails.hash")}
            value={<code className="rounded bg-slate-900/60 px-2 py-1 text-xs text-cyan-300">{commitDetails.hash}</code>}
          />
          {repo && <DetailLine icon={<FileText className="h-4 w-4" />} label={t("commitDetails.repository")} value={repo.name} />}
        </div>
      </header>

      <div className="flex-1 overflow-auto px-6 py-4">
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("commitDetails.modifiedFiles")}</h3>
          <div className="mt-3 space-y-2">
            {commitDetails.files.map((file) => (
              <button
                key={`${file.status}-${file.path}`}
                type="button"
                onClick={() => {
                  if (!selectedCommit) return;
                  navigate({
                    pathname: `/repo/diff/${selectedCommit}`,
                    search: `?file=${encodeURIComponent(file.path)}`
                  });
                }}
                className="flex w-full items-center justify-between rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 text-left text-xs text-slate-300 transition hover:border-cyan-400/30 hover:bg-slate-800/60"
              >
                <span className="flex items-center gap-2">
                  <span className="rounded bg-slate-800/70 px-2 py-0.5 text-[10px] uppercase text-slate-400">
                    {file.status}
                  </span>
                  <span className="truncate">{file.path}</span>
                </span>
                <FileDiff className="h-4 w-4 text-slate-500" />
              </button>
            ))}
            {commitDetails.files.length === 0 && (
              <p className="rounded bg-slate-900/60 px-3 py-2 text-xs text-slate-500">
                {t("commitDetails.noFilesInCommit")}
              </p>
            )}
          </div>
        </section>

        <section className="mt-6">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("commitDetails.diffSectionTitle")}</h3>
          <div className="mt-3 rounded-xl border border-slate-800 bg-slate-900/70">
            <div className="px-4 py-6 text-xs text-slate-500">
              {t("commitDetails.diffSectionDescription")}
            </div>
          </div>
        </section>

        {/* Show working directory changes when viewing a commit */}
        {workingDirStatus && (stagedFiles.length > 0 || unstagedFiles.length > 0) && (
          <section className="mt-6">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("commitDetails.workingDirectoryTitle")}</h3>
            <div className="mt-3 space-y-2">
              {stagedFiles.length > 0 && (
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-wide text-emerald-300">{t("commitDetails.stagedLabel")}</div>
                  <div className="mt-2 space-y-1">
                    {stagedFiles.map((file: any) => (
                      <button
                        key={`${file.path}-staged-inline`}
                        type="button"
                        onClick={() => {
                          navigate({
                            pathname: `/repo/diff/working-directory`,
                            search: `?file=${encodeURIComponent(file.path)}&scope=staged`
                          });
                        }}
                        className="flex w-full items-center justify-between rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 text-left text-xs text-slate-300 transition hover:border-cyan-400/30 hover:bg-slate-800/60"
                      >
                        <span className="flex items-center gap-2">
                          <span className="rounded bg-slate-800/70 px-2 py-0.5 text-[10px] uppercase text-slate-400">
                            {file.index}
                          </span>
                          <span className="truncate flex items-center gap-2">
                            {file.path}
                            {partialStagedPaths.has(file.path) && (
                              <span className="rounded bg-amber-500/10 px-2 py-0.5 text-[10px] uppercase text-amber-200">{t("commitDetails.partialBadge")}</span>
                            )}
                          </span>
                        </span>
                        <FileDiff className="h-4 w-4 text-slate-500" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {unstagedFiles.length > 0 && (
                <div>
                  <div className={`${stagedFiles.length > 0 ? 'mt-4' : ''} text-[11px] font-medium uppercase tracking-wide text-amber-300`}>{t("commitDetails.unstagedLabel")}</div>
                  <div className="mt-2 space-y-1">
                    {unstagedFiles.map((file: any) => (
                      <button
                        key={`${file.path}-unstaged-inline`}
                        type="button"
                        onClick={() => {
                          navigate({
                            pathname: `/repo/diff/working-directory`,
                            search: `?file=${encodeURIComponent(file.path)}&scope=working`
                          });
                        }}
                        className="flex w-full items-center justify-between rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 text-left text-xs text-slate-300 transition hover:border-cyan-400/30 hover:bg-slate-800/60"
                      >
                        <span className="flex items-center gap-2">
                          <span className="rounded bg-slate-800/70 px-2 py-0.5 text-[10px] uppercase text-slate-400">
                            {file.working_dir}
                          </span>
                          <span className="truncate flex items-center gap-2">
                            {file.path}
                            {partialStagedPaths.has(file.path) && (
                              <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase text-emerald-200">{t("commitDetails.partialBadge")}</span>
                            )}
                          </span>
                        </span>
                        <FileDiff className="h-4 w-4 text-slate-500" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </aside>
  );
};

const DetailLine: React.FC<{ icon: React.ReactNode; label: string; value: React.ReactNode }> = ({ icon, label, value }) => (
  <div className="flex items-center gap-2 text-slate-400">
    <span className="text-slate-500">{icon}</span>
    <span className="w-20 text-[11px] uppercase tracking-wide text-slate-500">{label}</span>
    <span className="flex-1 text-slate-200">{value}</span>
  </div>
);

export default CommitDetails;
