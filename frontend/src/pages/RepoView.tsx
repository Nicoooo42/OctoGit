import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import CommitDetails from "../components/CommitDetails";
import CommitGraph from "../components/CommitGraph";
import CommitList from "../components/CommitList";
import Sidebar from "../components/Sidebar";
import { useRepoContext } from "../context/RepoContext";

const RepoView: React.FC = () => {
  const { repo, error, clearError } = useRepoContext();
  const navigate = useNavigate();

  useEffect(() => {
    if (!repo) {
      navigate("/", { replace: true });
    }
  }, [navigate, repo]);

  useEffect(() => {
    if (error) {
      // eslint-disable-next-line no-alert
      alert(error);
      clearError();
    }
  }, [clearError, error]);

  if (!repo) {
    return null;
  }

  return (
    <div className="grid h-full grid-cols-[280px,1fr,380px] overflow-hidden bg-slate-900">
      <Sidebar />
      <main className="flex h-full flex-col overflow-hidden bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-100">{repo.name}</h1>
            <p className="text-xs text-slate-500">{repo.path}</p>
          </div>
          <div className="rounded-full border border-slate-800 px-4 py-1 text-xs uppercase tracking-wide text-slate-400">
            Vue du dépôt
          </div>
        </div>
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <CommitGraph />
        </div>
      </main>
      <CommitDetails />
    </div>
  );
};

export default RepoView;
