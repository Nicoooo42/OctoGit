import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Home } from "lucide-react";
import CommitDetails from "../components/CommitDetails";
import CommitGraph from "../components/CommitGraph";
import ErrorModal from "../components/ErrorModal";
import Sidebar from "../components/Sidebar";
import { useRepoContext } from "../context/RepoContext";

const RepoView: React.FC = () => {
  const { repo, error, clearError } = useRepoContext();
  const navigate = useNavigate();
  const { t } = useTranslation();

  useEffect(() => {
    if (!repo) {
      navigate("/", { replace: true });
    }
  }, [navigate, repo]);

  if (!repo) {
    return null;
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[240px,minmax(400px,1fr),300px] overflow-hidden bg-slate-900">
      <Sidebar />
      <main className="flex h-full min-h-0 flex-col overflow-hidden bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => navigate("/")}
              className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-300 transition hover:border-cyan-400/40 hover:bg-slate-800/70 hover:text-cyan-200"
              title={t("repoView.backToHome")}
            >
              <Home className="h-4 w-4" />
            </button>
            <div>
              <h1 className="text-lg font-semibold text-slate-100">{repo.name}</h1>
              <p className="text-xs text-slate-500">{repo.path}</p>
            </div>
          </div>
          <div className="rounded-full border border-slate-800 px-4 py-1 text-xs uppercase tracking-wide text-slate-400">
            {t("repoView.pill")}
          </div>
        </div>
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <CommitGraph />
        </div>
      </main>
      <CommitDetails />
      <ErrorModal
        isOpen={!!error}
        message={error ?? ""}
        onClose={clearError}
      />
    </div>
  );
};

export default RepoView;
