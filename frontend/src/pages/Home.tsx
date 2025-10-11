import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FolderOpen, GitBranch, Download } from "lucide-react";
import { useRepoContext } from "../context/RepoContext";
import Loading from "../components/Loading";

const Home: React.FC = () => {
  const navigate = useNavigate();
  const { recents, fetchRecents, openRepoFromDialog, openRepoAtPath, loading, error, clearError } = useRepoContext();
  const [showCloneModal, setShowCloneModal] = useState(false);
  const [cloneUrl, setCloneUrl] = useState("");
  const [clonePath, setClonePath] = useState("");
  const [cloneLoading, setCloneLoading] = useState(false);
  const [cloneError, setCloneError] = useState<string | null>(null);

  useEffect(() => {
    fetchRecents();
  }, [fetchRecents]);

  useEffect(() => {
    if (error) {
      // eslint-disable-next-line no-alert
      alert(error);
      clearError();
    }
  }, [clearError, error]);

  const handleOpenDialog = async () => {
    const success = await openRepoFromDialog();
    if (success) {
      navigate("/repo");
    }
  };

  const handleOpenRepo = async (repoPath: string) => {
    const success = await openRepoAtPath(repoPath);
    if (success) {
      navigate("/repo");
    }
  };

  const handleClone = async () => {
    if (!cloneUrl.trim() || !clonePath.trim()) {
      setCloneError("Veuillez renseigner l'URL et le chemin de destination.");
      return;
    }

    setCloneLoading(true);
    setCloneError(null);
    try {
      if (!window.BciGit) {
        throw new Error("API non disponible");
      }
      const result = await window.BciGit.cloneRepository(cloneUrl, clonePath);
      if (result.success) {
        setShowCloneModal(false);
        setCloneUrl("");
        setClonePath("");
        navigate("/repo");
      } else {
        setCloneError(result.error || "Erreur lors du clone");
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Erreur lors du clone";
      setCloneError(message);
    } finally {
      setCloneLoading(false);
    }
  };

  return (
    <div className="flex h-full items-center justify-center bg-slate-900">
      <div className="w-full max-w-2xl rounded-3xl border border-slate-800 bg-slate-850/60 p-10 shadow-xl backdrop-blur">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-400">
            <GitBranch className="h-8 w-8" />
          </div>
          <div>
            <h1 className="text-3xl font-semibold text-white">BciGit</h1>
            <p className="text-sm text-slate-400">Votre cockpit Git moderne, inspiré par GitKraken.</p>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-6">
          <button
            type="button"
            onClick={handleOpenDialog}
            disabled={loading}
            className="flex items-center justify-center gap-3 rounded-xl bg-cyan-500/20 py-3 text-cyan-300 transition hover:bg-cyan-500/30 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <FolderOpen className="h-5 w-5" />
            Ouvrir un dépôt
          </button>

          <button
            type="button"
            onClick={() => setShowCloneModal(true)}
            disabled={loading}
            className="flex items-center justify-center gap-3 rounded-xl bg-orange-500/20 py-3 text-orange-300 transition hover:bg-orange-500/30 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Download className="h-5 w-5" />
            Cloner un dépôt
          </button>

          <div>
            <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-500">
              <span>Dépôts récents</span>
              <span>{recents.length} trouvé(s)</span>
            </div>
            <div className="mt-3 space-y-2">
              {recents.length === 0 && (
                <p className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-500">
                  Aucun dépôt pour l'instant. Ouvrez votre premier dépôt pour commencer.
                </p>
              )}
              {recents.map((repo) => (
                <button
                  key={repo.path}
                  type="button"
                  className="flex w-full items-center justify-between rounded-xl border border-transparent bg-slate-900/60 px-4 py-3 text-left transition hover:border-cyan-400/40 hover:bg-slate-800/70"
                  onClick={() => handleOpenRepo(repo.path)}
                >
                  <div>
                    <p className="text-sm font-medium text-slate-100">{repo.name}</p>
                    <p className="text-xs text-slate-500">{repo.path}</p>
                  </div>
                  <span className="text-xs text-slate-500">
                    {new Date(repo.lastOpened).toLocaleString("fr-FR", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit"
                    })}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Modal de clone */}
      {showCloneModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="w-full max-w-lg rounded-xl bg-slate-800 p-6 shadow-2xl">
            <h2 className="text-xl font-bold mb-4 text-cyan-300">Cloner un dépôt Git</h2>
            
            <div className="mb-4">
              <label htmlFor="cloneUrl" className="block mb-1 text-sm font-medium">
                URL du dépôt
              </label>
              <input
                id="cloneUrl"
                type="text"
                value={cloneUrl}
                onChange={(e) => setCloneUrl(e.target.value)}
                placeholder="https://gitlab.com/user/repo.git"
                className="w-full border border-slate-600 bg-slate-900 rounded px-3 py-2 text-slate-100"
              />
            </div>

            <div className="mb-4">
              <label htmlFor="clonePath" className="block mb-1 text-sm font-medium">
                Chemin de destination
              </label>
              <input
                id="clonePath"
                type="text"
                value={clonePath}
                onChange={(e) => setClonePath(e.target.value)}
                placeholder="C:\Users\...\mon-projet"
                className="w-full border border-slate-600 bg-slate-900 rounded px-3 py-2 text-slate-100"
              />
              <p className="text-xs text-slate-400 mt-1">
                Le dossier sera créé automatiquement
              </p>
            </div>

            {cloneError && (
              <div className="mb-4 p-3 bg-red-900/30 text-red-300 rounded text-sm">
                {cloneError}
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleClone}
                disabled={cloneLoading}
                className="flex-1 bg-cyan-600 text-white px-4 py-2 rounded hover:bg-cyan-700 disabled:opacity-50"
              >
                {cloneLoading ? "Clonage en cours..." : "Cloner"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCloneModal(false);
                  setCloneError(null);
                  setCloneUrl("");
                  setClonePath("");
                }}
                disabled={cloneLoading}
                className="flex-1 bg-slate-700 text-white px-4 py-2 rounded hover:bg-slate-600 disabled:opacity-50"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
      {cloneLoading && <Loading message="Clonage du dépôt en cours..." />}
    </div>
  );
};

export default Home;
