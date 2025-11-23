import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Archive,
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  File,
  GitBranch,
  GitCommit,
  Plus,
  RefreshCcw
} from "lucide-react";
import { useRepoContext } from "../context/RepoContext";

const SectionHeader: React.FC<{ title: string }> = ({ title }) => (
  <div className="px-4 pt-6 text-xs font-semibold uppercase tracking-wide text-slate-500">
    {title}
  </div>
);

const Sidebar: React.FC = () => {
  const navigate = useNavigate();
  const {
    repo,
    branches,
    loading,
    checkout,
    createBranch,
    deleteBranch,
    pull,
    push,
    fetch,
    merge,
    commit,
    stash,
    stashPop,
    workingDirStatus,
    getWorkingDirStatus,
    refreshAll,
    unstageFile,
    stageFile
  } = useRepoContext();

  const [showBranchInput, setShowBranchInput] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [showCommitModal, setShowCommitModal] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');

  const localBranches = useMemo(() => branches.filter((branch) => branch.type === "local"), [branches]);
  const remoteBranches = useMemo(() => branches.filter((branch) => branch.type === "remote"), [branches]);
  const stagedFiles = useMemo(() => (workingDirStatus?.files ?? []).filter((file: any) => file.index !== ' '), [workingDirStatus]);
  const unstagedFiles = useMemo(
    () => (workingDirStatus?.files ?? []).filter((file: any) => file.working_dir !== ' '),
    [workingDirStatus]
  );
  const partialStagedPaths = useMemo(() => new Set(
    stagedFiles
      .filter((file: any) => file.working_dir !== ' ')
      .map((file: any) => file.path)
  ), [stagedFiles]);
  const conflictCount = useMemo(
    () => (Array.isArray(workingDirStatus?.conflicted) ? workingDirStatus.conflicted.length : 0),
    [workingDirStatus]
  );

  const handleGoToConfig = () => {
    navigate('/config');
  };

  const handleCreateBranch = () => {
    setShowBranchInput(true);
  };

  const handleConfirmCreateBranch = async () => {
    if (newBranchName.trim()) {
      await createBranch(newBranchName.trim());
      setNewBranchName('');
      setShowBranchInput(false);
    }
  };

  const handleCancelCreateBranch = () => {
    setNewBranchName('');
    setShowBranchInput(false);
  };

  const handleCommit = () => {
    setShowCommitModal(true);
  };

  const handleConfirmCommit = async () => {
    if (commitMessage.trim()) {
      await commit(commitMessage.trim());
      setCommitMessage('');
      setShowCommitModal(false);
    }
  };

  const handleCancelCommit = () => {
    setCommitMessage('');
    setShowCommitModal(false);
  };

  const handleStash = async () => {
    await stash();
  };

  const handleStashPop = async () => {
    await stashPop();
  };

  const refreshStatus = async () => {
    await refreshAll();
  };

  const handleDeleteBranch = async (branchName: string) => {
    if (!confirm(`Supprimer la branche ${branchName} ?`)) return;
    await deleteBranch(branchName);
  };

  return (
    <aside className="flex h-full min-h-0 flex-col border-r border-slate-800 bg-slate-800/60 text-sm">
      <div className="px-4 py-3 border-b border-slate-800">
        <button
          type="button"
          onClick={handleGoToConfig}
          className="block w-full rounded bg-cyan-700/20 text-cyan-300 text-center py-2 mb-2 hover:bg-cyan-700/30 transition"
        >
          ⚙️ Config Git
        </button>
      </div>
      <div className="border-b border-slate-800 px-4 py-5">
        <div className="text-xs uppercase tracking-wide text-slate-500">Dépôt</div>
        <div className="mt-1 text-sm font-semibold text-slate-100">{repo?.name ?? "Aucun dépôt"}</div>
        <div className="truncate text-xs text-slate-500">{repo?.path ?? "Sélectionnez un dépôt pour commencer."}</div>
      </div>

      <div className="grid grid-cols-3 gap-2 px-4 py-4 text-xs">
        <button
          type="button"
          onClick={() => pull()}
          disabled={loading}
          className="flex flex-col items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/60 p-2 text-slate-300 transition hover:border-cyan-400/40 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ArrowDownToLine className="h-4 w-4" />
          Pull
        </button>
        <button
          type="button"
          onClick={() => push()}
          disabled={loading}
          className="flex flex-col items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/60 p-2 text-slate-300 transition hover:border-cyan-400/40 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ArrowUpFromLine className="h-4 w-4" />
          Push
        </button>
        <button
          type="button"
          onClick={() => fetch()}
          disabled={loading}
          className="flex flex-col items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/60 p-2 text-slate-300 transition hover:border-cyan-400/40 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCcw className="h-4 w-4" />
          Fetch
        </button>
        <button
          type="button"
          onClick={handleCreateBranch}
          disabled={loading}
          className="flex flex-col items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/60 p-2 text-slate-300 transition hover:border-cyan-400/40 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          Branche
        </button>
        <button
          type="button"
          onClick={handleCommit}
          disabled={loading || !workingDirStatus || stagedFiles.length === 0}
          className="flex flex-col items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/60 p-2 text-slate-300 transition hover:border-cyan-400/40 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <GitCommit className="h-4 w-4" />
          Commit
        </button>
        <button
          type="button"
          onClick={handleStash}
          disabled={loading}
          className="flex flex-col items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/60 p-2 text-slate-300 transition hover:border-cyan-400/40 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Archive className="h-4 w-4" />
          Stash
        </button>
        <button
          type="button"
          onClick={() => navigate('/repo/conflicts')}
          disabled={conflictCount === 0 || loading}
          className={`col-span-3 flex items-center justify-center gap-2 rounded-lg border p-2 text-sm transition ${
            conflictCount > 0
              ? "border-amber-400/60 bg-amber-500/10 text-amber-200 hover:border-amber-300/70 hover:bg-amber-500/20"
              : "border-slate-700 bg-slate-800/60 text-slate-300 hover:border-cyan-400/40 hover:text-cyan-200"
          } disabled:cursor-not-allowed disabled:opacity-50`}
        >
          <AlertTriangle className="h-4 w-4" />
          {conflictCount > 0 ? `Conflits (${conflictCount})` : 'Conflits'}
        </button>
      </div>

      {showBranchInput && (
        <div className="px-4 pb-4">
          <input
            type="text"
            value={newBranchName}
            onChange={(e) => setNewBranchName(e.target.value)}
            placeholder="Nom de la nouvelle branche"
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleConfirmCreateBranch();
              if (e.key === 'Escape') handleCancelCreateBranch();
            }}
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={handleConfirmCreateBranch}
              className="flex-1 rounded-lg bg-cyan-600 px-3 py-2 text-sm text-white hover:bg-cyan-700"
            >
              Créer
            </button>
            <button
              type="button"
              onClick={handleCancelCreateBranch}
              className="flex-1 rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-600"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {showCommitModal && (
        <div className="px-4 pb-4">
          <textarea
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            placeholder="Message de commit"
            rows={3}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.ctrlKey) handleConfirmCommit();
              if (e.key === 'Escape') handleCancelCommit();
            }}
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={handleConfirmCommit}
              className="flex-1 rounded-lg bg-cyan-600 px-3 py-2 text-sm text-white hover:bg-cyan-700"
              disabled={!commitMessage.trim()}
            >
              Commiter
            </button>
            <button
              type="button"
              onClick={handleCancelCommit}
              className="flex-1 rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-600"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      <SectionHeader title="Branches locales" />
  <div className="scrollbar-thin mt-2 flex-1 overflow-auto px-2 pb-6">
        {localBranches.map((branch) => (
          <BranchRow
            key={branch.fullName}
            name={branch.name}
            color={branch.color}
            current={branch.current}
            latestCommit={branch.latestCommit}
            onCheckout={() => checkout(branch.name)}
            onDelete={() => handleDeleteBranch(branch.name)}
          />
        ))}
        {localBranches.length === 0 && (
          <p className="px-2 text-xs text-slate-500">Aucune branche locale pour le moment.</p>
        )}
      </div>

      <SectionHeader title="Branches distantes" />
  <div className="scrollbar-thin mt-2 max-h-40 overflow-auto px-2 pb-6">
        {remoteBranches.map((branch) => (
          <BranchRow
            key={branch.fullName}
            name={branch.name}
            color={branch.color}
            current={false}
            latestCommit={branch.latestCommit}
            onCheckout={() => checkout(branch.name)}
            onDelete={() => handleDeleteBranch(branch.name)}
            remote
          />
        ))}
        {remoteBranches.length === 0 && (
          <p className="px-2 text-xs text-slate-500">Aucune branche distante détectée.</p>
        )}
      </div>
    </aside>
  );
};

const SidebarButton: React.FC<{ icon: React.ReactNode; onClick: () => void; disabled?: boolean; children: React.ReactNode }> = ({
  icon,
  onClick,
  disabled,
  children
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="flex items-center justify-center gap-2 rounded-lg border border-slate-700/60 bg-slate-900/60 py-2 text-slate-300 transition hover:border-cyan-400/50 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-60"
  >
    {icon}
    <span>{children}</span>
  </button>
);

const BranchRow: React.FC<{
  name: string;
  color: string;
  current: boolean;
  latestCommit?: string;
  remote?: boolean;
  onCheckout: () => void;
  onDelete: () => void;
}> = ({ name, color, current, latestCommit, remote = false, onCheckout, onDelete }) => (
  <div className={`group mb-1 flex items-center justify-between rounded-lg px-2 py-2 text-sm hover:bg-slate-800/60 ${current ? 'bg-cyan-900/30 border border-cyan-600/50' : ''}`}>
    <button
      type="button"
      onClick={onCheckout}
      className="flex flex-1 items-center gap-3 text-left"
    >
      <span className="inline-flex h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      <div>
        <div className="flex items-center gap-2 text-slate-100">
          <GitBranch className="h-3.5 w-3.5 text-slate-500" />
          <span className={`truncate text-sm ${current ? 'font-semibold text-cyan-200' : ''}`}>
            {name}
            {remote && <span className="ml-2 rounded bg-slate-700/80 px-1 text-xs text-slate-300">remote</span>}
          </span>
          {current && <span className="rounded bg-cyan-500/20 px-1 text-[10px] uppercase text-cyan-300">HEAD</span>}
        </div>
        {latestCommit && <p className="truncate text-xs text-slate-500">{latestCommit}</p>}
      </div>
    </button>
    <div className="flex gap-1">
      {!current && (
        <IconButton label="Supprimer" onClick={onDelete}>
          <span className="text-xs">✕</span>
        </IconButton>
      )}
    </div>
  </div>
);

const IconButton: React.FC<{ children: React.ReactNode; onClick: () => void; label: string }> = ({ children, onClick, label }) => (
  <button
    type="button"
    className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-700/60 bg-slate-900/60 text-slate-300 transition hover:border-cyan-400/40 hover:text-cyan-200"
    onClick={(event) => {
      event.stopPropagation();
      onClick();
    }}
    title={label}
  >
    {children}
  </button>
);

export default Sidebar;
