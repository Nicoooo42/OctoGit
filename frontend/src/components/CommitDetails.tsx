import React from "react";
import { Calendar, FileDiff, FileText, User } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useRepoContext } from "../context/RepoContext";

const CommitDetails: React.FC = () => {
  const { commitDetails, selectedCommit, repo, workingDirStatus } = useRepoContext();
  const navigate = useNavigate();

  if (selectedCommit === "working-directory") {
    return (
      <aside className="flex h-full flex-col border-l border-slate-800 bg-slate-850/80 text-sm">
        <header className="border-b border-slate-800 px-6 py-5">
          <div className="text-xs uppercase tracking-wide text-slate-500">État du répertoire de travail</div>
          <h2 className="mt-2 text-lg font-semibold text-slate-100">Changements non validés</h2>
        </header>

        <div className="flex-1 overflow-auto px-6 py-4">
          {!workingDirStatus ? (
            <p className="text-slate-400">Chargement de l'état du répertoire de travail…</p>
          ) : (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Fichiers modifiés</h3>
              <div className="mt-3 space-y-2">
                {workingDirStatus.files.map((file: any) => (
                  <button
                    key={`${file.working_dir}-${file.path}`}
                    type="button"
                    onClick={() => {
                      navigate({
                        pathname: `/repo/diff/working-directory`,
                        search: `?file=${encodeURIComponent(file.path)}`
                      });
                    }}
                    className="flex w-full items-center justify-between rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 text-left text-xs text-slate-300 transition hover:border-cyan-400/30 hover:bg-slate-800/60"
                  >
                    <span className="flex items-center gap-2">
                      <span className="rounded bg-slate-800/70 px-2 py-0.5 text-[10px] uppercase text-slate-400">
                        {file.working_dir}
                      </span>
                      <span className="truncate">{file.path}</span>
                    </span>
                    <FileDiff className="h-4 w-4 text-slate-500" />
                  </button>
                ))}
                {workingDirStatus.files.length === 0 && (
                  <p className="rounded bg-slate-900/60 px-3 py-2 text-xs text-slate-500">
                    Aucun fichier modifié dans le répertoire de travail.
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
      <aside className="flex h-full flex-col border-l border-slate-800 bg-slate-850/70 p-6 text-sm text-slate-400">
        <p>Chargement des détails du commit…</p>
      </aside>
    );
  }

  return (
    <aside className="flex h-full flex-col border-l border-slate-800 bg-slate-850/80 text-sm">
      <header className="border-b border-slate-800 px-6 py-5">
        <div className="text-xs uppercase tracking-wide text-slate-500">Détails du commit</div>
        <h2 className="mt-2 text-lg font-semibold text-slate-100">{commitDetails.message}</h2>
        <div className="mt-3 space-y-2 text-xs text-slate-400">
          <DetailLine icon={<User className="h-4 w-4" />} label="Auteur" value={commitDetails.author} />
          <DetailLine
            icon={<Calendar className="h-4 w-4" />}
            label="Date"
            value={new Date(commitDetails.date).toLocaleString("fr-FR")}
          />
          <DetailLine
            icon={<FileText className="h-4 w-4" />}
            label="Hash"
            value={<code className="rounded bg-slate-900/60 px-2 py-1 text-xs text-cyan-300">{commitDetails.hash}</code>}
          />
          {repo && <DetailLine icon={<FileText className="h-4 w-4" />} label="Dépôt" value={repo.name} />}
        </div>
      </header>

      <div className="flex-1 overflow-auto px-6 py-4">
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Fichiers modifiés</h3>
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
                Aucun fichier n'est associé à ce commit.
              </p>
            )}
          </div>
        </section>

        <section className="mt-6">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Diff</h3>
          <div className="mt-3 rounded-xl border border-slate-800 bg-slate-900/70">
            <div className="px-4 py-6 text-xs text-slate-500">
              Les diffs s&apos;ouvrent désormais dans une page dédiée. Cliquez sur un fichier ci-dessus pour y accéder.
            </div>
          </div>
        </section>
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
