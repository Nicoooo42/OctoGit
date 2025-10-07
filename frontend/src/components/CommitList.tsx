import React from "react";
import { GitCommit } from "lucide-react";
import { useRepoContext } from "../context/RepoContext";

const CommitList: React.FC = () => {
  const { graph, selectedCommit, selectCommit } = useRepoContext();

  if (!graph) {
    return null;
  }

  return (
    <div className="h-64 overflow-auto border-t border-slate-800 bg-slate-900/80">
      <div className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Liste des commits
      </div>
      <div className="space-y-1 px-2 pb-3">
        {graph.nodes.map((node) => {
          const isSelected = node.hash === selectedCommit;
          return (
            <button
              key={node.hash}
              type="button"
              onClick={() => selectCommit(node.hash)}
              className={`flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left transition ${
                isSelected
                  ? "bg-cyan-500/10 text-cyan-100 border border-cyan-500/40"
                  : "bg-slate-800/40 text-slate-200 hover:bg-slate-800/70 border border-transparent"
              }`}
            >
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-800/60">
                <GitCommit className="h-4 w-4" />
              </span>
              <div className="flex-1">
                <p className="text-sm font-medium">{node.message}</p>
                <p className="text-xs text-slate-500">
                  {node.author} • {new Date(node.date).toLocaleString("fr-FR")}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default CommitList;
