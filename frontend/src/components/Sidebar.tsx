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
  RefreshCcw,
  Sparkles,
  Tag,
  Terminal
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useRepoContext } from "../context/RepoContext";
import ConfirmModal from "./ConfirmModal";

const SectionHeader: React.FC<{ title: string }> = ({ title }) => (
  <div className="px-4 pt-6 text-xs font-semibold uppercase tracking-wide text-slate-500">
    {title}
  </div>
);

const Sidebar: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const {
    repo,
    branches,
    tags,
    loading,
    checkout,
    createBranch,
    deleteBranch,
    generateBranchNameSuggestions,
    generateCommitMessage,
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
  const [branchSuggestions, setBranchSuggestions] = useState<string[]>([]);
  const [branchSuggestionLoading, setBranchSuggestionLoading] = useState(false);
  const [branchSuggestionError, setBranchSuggestionError] = useState<string | null>(null);
  const [showCommitModal, setShowCommitModal] = useState(false);
  const [commitTitle, setCommitTitle] = useState('');
  const [commitDescription, setCommitDescription] = useState('');
  const [commitSuggestionLoading, setCommitSuggestionLoading] = useState(false);
  const [commitSuggestionError, setCommitSuggestionError] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

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
    setBranchSuggestions([]);
    setBranchSuggestionError(null);
  };

  const handleConfirmCreateBranch = async () => {
    if (newBranchName.trim()) {
      await createBranch(newBranchName.trim());
      setNewBranchName('');
      setShowBranchInput(false);
      setBranchSuggestions([]);
      setBranchSuggestionError(null);
    }
  };

  const handleCancelCreateBranch = () => {
    setNewBranchName('');
    setShowBranchInput(false);
    setBranchSuggestions([]);
    setBranchSuggestionError(null);
  };

  const handleGenerateBranchSuggestions = async () => {
    setBranchSuggestionLoading(true);
    setBranchSuggestionError(null);
    try {
      const suggestions = await generateBranchNameSuggestions();
      setBranchSuggestions(suggestions);
      if (!newBranchName.trim() && suggestions[0]) {
        setNewBranchName(suggestions[0]);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setBranchSuggestionError(message);
    } finally {
      setBranchSuggestionLoading(false);
    }
  };

  const handleCommit = () => {
    setShowCommitModal(true);
    setCommitSuggestionError(null);
  };

  const handleConfirmCommit = async () => {
    if (commitTitle.trim()) {
      const fullMessage = commitDescription.trim()
        ? `${commitTitle.trim()}\n\n${commitDescription.trim()}`
        : commitTitle.trim();
      await commit(fullMessage);
      setCommitTitle('');
      setCommitDescription('');
      setShowCommitModal(false);
    }
  };

  const handleCancelCommit = () => {
    setCommitTitle('');
    setCommitDescription('');
    setShowCommitModal(false);
    setCommitSuggestionError(null);
  };

  const handleGenerateCommitSuggestion = async () => {
    setCommitSuggestionLoading(true);
    setCommitSuggestionError(null);
    try {
      const { title, description } = await generateCommitMessage();
      setCommitTitle(title);
      setCommitDescription(description);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setCommitSuggestionError(message);
    } finally {
      setCommitSuggestionLoading(false);
    }
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

  const handleDeleteBranch = (branchName: string, force = false) => {
    const titleKey = force ? "confirmations.forceDeleteBranch.title" : "confirmations.deleteBranch.title";
    const messageKey = force ? "confirmations.forceDeleteBranch.message" : "confirmations.deleteBranch.message";
    
    setConfirmModal({
      isOpen: true,
      title: t(titleKey),
      message: t(messageKey, { branch: branchName }),
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          await deleteBranch(branchName, force);
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          // Check if the error is about branch not being fully merged
          if (errorMessage.includes("not fully merged") && !force) {
            // Offer to force delete
            handleDeleteBranch(branchName, true);
          }
          // Other errors are handled by the context
        }
      }
    });
  };

  return (
    <aside className="flex h-full min-h-0 flex-col border-r border-slate-800 bg-slate-800/60 text-sm">
      <div className="px-4 py-3 border-b border-slate-800">
        <button
          type="button"
          onClick={handleGoToConfig}
          className="block w-full rounded bg-cyan-700/20 text-cyan-300 text-center py-2 mb-2 hover:bg-cyan-700/30 transition"
        >
          {t("sidebar.openConfig")}
        </button>
        <button
          type="button"
          onClick={() => navigate("/ai-terminal")}
          className="flex w-full items-center justify-center gap-2 rounded bg-violet-700/20 text-violet-200 text-center py-2 hover:bg-violet-700/30 transition"
        >
          <Terminal className="h-4 w-4" />
          {t("sidebar.aiTerminal")}
        </button>
      </div>
      <div className="border-b border-slate-800 px-4 py-5">
        <div className="text-xs uppercase tracking-wide text-slate-500">{t("sidebar.repositorySection")}</div>
        <div className="mt-1 text-sm font-semibold text-slate-100">{repo?.name ?? t("sidebar.noRepository")}</div>
        <div className="truncate text-xs text-slate-500">{repo?.path ?? t("sidebar.selectPrompt")}</div>
      </div>

      <div className="grid grid-cols-3 gap-2 px-4 py-4 text-xs">
        <button
          type="button"
          onClick={() => pull()}
          disabled={loading}
          className="flex flex-col items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/60 p-2 text-slate-300 transition hover:border-cyan-400/40 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ArrowDownToLine className="h-4 w-4" />
          {t("sidebar.actions.pull")}
        </button>
        <button
          type="button"
          onClick={() => push()}
          disabled={loading}
          className="flex flex-col items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/60 p-2 text-slate-300 transition hover:border-cyan-400/40 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ArrowUpFromLine className="h-4 w-4" />
          {t("sidebar.actions.push")}
        </button>
        <button
          type="button"
          onClick={() => fetch()}
          disabled={loading}
          className="flex flex-col items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/60 p-2 text-slate-300 transition hover:border-cyan-400/40 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCcw className="h-4 w-4" />
          {t("sidebar.actions.fetch")}
        </button>
        <button
          type="button"
          onClick={handleCreateBranch}
          disabled={loading}
          className="flex flex-col items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/60 p-2 text-slate-300 transition hover:border-cyan-400/40 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          {t("sidebar.actions.branch")}
        </button>
        <button
          type="button"
          onClick={handleCommit}
          disabled={loading || !workingDirStatus || stagedFiles.length === 0}
          className="flex flex-col items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/60 p-2 text-slate-300 transition hover:border-cyan-400/40 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <GitCommit className="h-4 w-4" />
          {t("sidebar.actions.commit")}
        </button>
        <button
          type="button"
          onClick={handleStash}
          disabled={loading}
          className="flex flex-col items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/60 p-2 text-slate-300 transition hover:border-cyan-400/40 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Archive className="h-4 w-4" />
          {t("sidebar.actions.stash")}
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
          {conflictCount > 0
            ? t("sidebar.actions.conflictsWithCount", { count: conflictCount })
            : t("sidebar.actions.conflicts")}
        </button>
      </div>

      {showBranchInput && (
        <div className="px-4 pb-4">
          <input
            type="text"
            value={newBranchName}
            onChange={(e) => setNewBranchName(e.target.value)}
            placeholder={t("sidebar.newBranchPlaceholder")}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleConfirmCreateBranch();
              if (e.key === 'Escape') handleCancelCreateBranch();
            }}
          />
          <div className="mt-2">
            <button
              type="button"
              onClick={handleGenerateBranchSuggestions}
              disabled={branchSuggestionLoading}
              className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 hover:border-cyan-400/50 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {branchSuggestionLoading
                ? t("sidebar.branchSuggestionsGenerating")
                : t("sidebar.branchSuggestionsGenerate")}
            </button>
            {branchSuggestionError && (
              <p className="mt-2 text-xs text-rose-300">{branchSuggestionError}</p>
            )}
            {branchSuggestions.length > 0 && (
              <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900/60 p-2">
                <div className="mb-2 text-xs uppercase tracking-wide text-slate-500">
                  {t("sidebar.branchSuggestionsTitle")}
                </div>
                <div className="flex flex-col gap-1">
                  {branchSuggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => setNewBranchName(suggestion)}
                      className="w-full rounded-md border border-slate-700/60 bg-slate-900/40 px-2 py-1 text-left text-xs text-slate-200 hover:border-cyan-400/50 hover:text-cyan-200"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={handleConfirmCreateBranch}
              className="flex-1 rounded-lg bg-cyan-600 px-3 py-2 text-sm text-white hover:bg-cyan-700"
            >
              {t("sidebar.createBranch")}
            </button>
            <button
              type="button"
              onClick={handleCancelCreateBranch}
              className="flex-1 rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-600"
            >
              {t("sidebar.cancel")}
            </button>
          </div>
        </div>
      )}

      {showCommitModal && (
        <div className="px-4 pb-4">
          <input
            type="text"
            value={commitTitle}
            onChange={(e) => setCommitTitle(e.target.value)}
            placeholder={t("sidebar.commitTitlePlaceholder")}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.ctrlKey) handleConfirmCommit();
              if (e.key === 'Escape') handleCancelCommit();
            }}
          />
          <textarea
            value={commitDescription}
            onChange={(e) => setCommitDescription(e.target.value)}
            placeholder={t("sidebar.commitDescriptionPlaceholder")}
            rows={2}
            className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.ctrlKey) handleConfirmCommit();
              if (e.key === 'Escape') handleCancelCommit();
            }}
          />
          <div className="mt-2">
            <button
              type="button"
              onClick={handleGenerateCommitSuggestion}
              disabled={commitSuggestionLoading}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 hover:border-cyan-400/50 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Sparkles className="h-4 w-4" />
              {commitSuggestionLoading
                ? t("sidebar.branchSuggestionsGenerating")
                : t("sidebar.commitSuggestionsGenerate")}
            </button>
            {commitSuggestionError && (
              <p className="mt-2 text-xs text-rose-300">{commitSuggestionError}</p>
            )}
          </div>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={handleConfirmCommit}
              className="flex-1 rounded-lg bg-cyan-600 px-3 py-2 text-sm text-white hover:bg-cyan-700"
              disabled={!commitTitle.trim()}
            >
              {t("sidebar.commitButton")}
            </button>
            <button
              type="button"
              onClick={handleCancelCommit}
              className="flex-1 rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-600"
            >
              {t("sidebar.cancel")}
            </button>
          </div>
        </div>
      )}

      <SectionHeader title={t("sidebar.localBranches")} />
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
          <p className="px-2 text-xs text-slate-500">{t("sidebar.emptyLocal")}</p>
        )}
      </div>

      <SectionHeader title={t("sidebar.tags")} />
      <div className="scrollbar-thin mt-2 max-h-40 overflow-auto px-2 pb-6">
        {tags.map((tag) => (
          <TagRow
            key={tag.name}
            name={tag.name}
            message={tag.message}
            onCheckout={() => checkout(tag.name)}
          />
        ))}
        {tags.length === 0 && (
          <p className="px-2 text-xs text-slate-500">{t("sidebar.emptyTags")}</p>
        )}
      </div>

      <SectionHeader title={t("sidebar.remoteBranches")} />
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
          <p className="px-2 text-xs text-slate-500">{t("sidebar.emptyRemote")}</p>
        )}
      </div>
      <ConfirmModal
        isOpen={confirmModal?.isOpen ?? false}
        title={confirmModal?.title ?? ""}
        message={confirmModal?.message ?? ""}
        onConfirm={confirmModal?.onConfirm ?? (() => {})}
        onCancel={() => setConfirmModal(null)}
      />
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
}> = ({ name, color, current, latestCommit, remote = false, onCheckout, onDelete }) => {
  const { t } = useTranslation();
  return (
    <div className={`group mb-1 flex items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-slate-800/60 ${current ? 'bg-cyan-900/30 border border-cyan-600/50' : ''}`}>
      {/* Color indicator - fixed width */}
      <span className="inline-flex h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: color }} />
      
      {/* Main content - takes remaining space with overflow hidden */}
      <button
        type="button"
        onClick={onCheckout}
        className="flex min-w-0 flex-1 flex-col gap-0.5 text-left"
      >
        <div className="flex min-w-0 items-center gap-2">
          <GitBranch className="h-3.5 w-3.5 flex-shrink-0 text-slate-500" />
          <span 
            className={`truncate text-sm ${current ? 'font-semibold text-cyan-200' : 'text-slate-100'}`}
            title={name}
          >
            {name}
          </span>
          {remote && (
            <span className="flex-shrink-0 rounded bg-slate-700/80 px-1 text-xs text-slate-300">
              {t("sidebar.branchBadgeRemote")}
            </span>
          )}
          {current && (
            <span className="flex-shrink-0 rounded bg-cyan-500/20 px-1 text-[10px] uppercase text-cyan-300">
              HEAD
            </span>
          )}
        </div>
        {latestCommit && (
          <p className="truncate text-xs text-slate-500 pl-5" title={latestCommit}>
            {latestCommit}
          </p>
        )}
      </button>
      
      {/* Delete button - fixed width, always aligned */}
      <div className="flex flex-shrink-0 items-center">
        {!current ? (
          <IconButton label={t("sidebar.deleteTooltip")} onClick={onDelete}>
            <span className="text-xs">✕</span>
          </IconButton>
        ) : (
          <div className="h-7 w-7" /> /* Spacer to keep alignment */
        )}
      </div>
    </div>
  );
};

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

const TagRow: React.FC<{
  name: string;
  message?: string;
  onCheckout: () => void;
}> = ({ name, message, onCheckout }) => {
  return (
    <div className="group mb-1 flex items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-slate-800/60">
      <span className="inline-flex h-2.5 w-2.5 flex-shrink-0 rounded-full bg-yellow-500" />
      <button
        type="button"
        onClick={onCheckout}
        className="flex min-w-0 flex-1 flex-col gap-0.5 text-left"
      >
        <div className="flex min-w-0 items-center gap-2">
          <Tag className="h-3.5 w-3.5 flex-shrink-0 text-slate-500" />
          <span className="truncate text-sm text-slate-100" title={name}>
            {name}
          </span>
        </div>
        {message && (
          <p className="truncate text-xs text-slate-500 pl-5" title={message}>
            {message}
          </p>
        )}
      </button>
    </div>
  );
};

export default Sidebar;
