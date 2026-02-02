import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  Check,
  Copy,
  Edit3,
  GitBranch,
  GitCommit,
  Play,
  RefreshCw,
  Send,
  Sparkles,
  Terminal as TerminalIcon,
  Trash2,
  User,
  X
} from "lucide-react";
import { useRepoContext } from "../context/RepoContext";
import { getBciGit } from "../utils/bciGit";
import { unwrap } from "../utils/ipc";
import ConfirmModal from "../components/ConfirmModal";
import type { AiTerminalExecuteResult, AiTerminalSuggestion } from "../types/git";

/* ─────────────────────────────────────────────────────────────────────────────
   Types
───────────────────────────────────────────────────────────────────────────── */

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  suggestion?: AiTerminalSuggestion;
  execution?: AiTerminalExecuteResult;
  error?: string;
  createdAt: number;
};

const STORAGE_KEY = "aiTerminal:history";

/* ─────────────────────────────────────────────────────────────────────────────
   Helpers
───────────────────────────────────────────────────────────────────────────── */

const createId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const isGlobalCommand = (cmd: string) => /--global|--system/i.test(cmd);

const loadHistory = (repoPath: string | undefined): ChatMessage[] => {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}:${repoPath ?? "global"}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const saveHistory = (repoPath: string | undefined, messages: ChatMessage[]) => {
  try {
    localStorage.setItem(`${STORAGE_KEY}:${repoPath ?? "global"}`, JSON.stringify(messages.slice(0, 100)));
  } catch {
    // quota exceeded, ignore
  }
};

/* ─────────────────────────────────────────────────────────────────────────────
   Component
───────────────────────────────────────────────────────────────────────────── */

const AiTerminal: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { repo } = useRepoContext();
  const hasRepo = Boolean(repo);

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [editingCommand, setEditingCommand] = useState<{ id: string; value: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [execLoadingId, setExecLoadingId] = useState<string | null>(null);
  const [pendingExecution, setPendingExecution] = useState<ChatMessage | null>(null);
  const [quickActionLoading, setQuickActionLoading] = useState<"commit" | "branch" | null>(null);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load history on mount / repo change
  useEffect(() => {
    setMessages(loadHistory(repo?.path));
  }, [repo?.path]);

  // Save history whenever messages change
  useEffect(() => {
    saveHistory(repo?.path, messages);
  }, [messages, repo?.path]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
    }
  }, [input]);

  /* ─────────────── Actions ─────────────── */

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const userMsg: ChatMessage = {
      id: createId(),
      role: "user",
      content: trimmed,
      createdAt: Date.now()
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    // Determine if this is a direct command (starts with "git ")
    const isDirect = /^git\s+/i.test(trimmed);

    try {
      const bciGit = getBciGit();

      if (isDirect) {
        // Direct command execution
        const suggestion: AiTerminalSuggestion = {
          command: trimmed,
          explanation: t("aiTerminal.directExplanation"),
          isGlobal: isGlobalCommand(trimmed),
          requiresRepo: false,
          warnings: []
        };
        const assistantMsg: ChatMessage = {
          id: createId(),
          role: "assistant",
          content: t("aiTerminal.directExplanation"),
          suggestion,
          createdAt: Date.now()
        };
        setMessages((prev) => [...prev, assistantMsg]);

        // Auto-execute if safe
        if (!suggestion.isGlobal && hasRepo) {
          await executeMessage(assistantMsg);
        } else {
          setPendingExecution(assistantMsg);
        }
      } else {
        // AI suggestion
        const suggestion = await unwrap(bciGit.suggestGitCommand(trimmed));
        const assistantMsg: ChatMessage = {
          id: createId(),
          role: "assistant",
          content: suggestion.explanation || t("aiTerminal.noExplanation"),
          suggestion,
          createdAt: Date.now()
        };
        setMessages((prev) => [...prev, assistantMsg]);
      }
    } catch (err) {
      const errorMsg: ChatMessage = {
        id: createId(),
        role: "assistant",
        content: t("aiTerminal.errorOccurred"),
        error: err instanceof Error ? err.message : String(err),
        createdAt: Date.now()
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, hasRepo, t]);

  const executeMessage = useCallback(
    async (msg: ChatMessage, customCommand?: string) => {
      if (!msg.suggestion) return;

      const command = customCommand ?? msg.suggestion.command;
      setExecLoadingId(msg.id);
      setEditingCommand(null);

      try {
        const bciGit = getBciGit();
        const result = await unwrap(bciGit.executeGitCommand(command));
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msg.id
              ? {
                  ...m,
                  suggestion: { ...m.suggestion!, command },
                  execution: result,
                  error: undefined
                }
              : m
          )
        );
      } catch (err) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msg.id
              ? { ...m, error: err instanceof Error ? err.message : String(err) }
              : m
          )
        );
      } finally {
        setExecLoadingId(null);
        setPendingExecution(null);
      }
    },
    []
  );

  const requestExecution = useCallback(
    (msg: ChatMessage) => {
      if (!msg.suggestion) return;
      if (msg.suggestion.isGlobal || !hasRepo) {
        setPendingExecution(msg);
      } else {
        void executeMessage(msg);
      }
    },
    [hasRepo, executeMessage]
  );

  const handleCopy = useCallback(async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // ignore
    }
  }, []);

  const handleClearHistory = useCallback(async () => {
    setMessages([]);
    try {
      const bciGit = getBciGit();
      await unwrap(bciGit.clearAiTerminalSession());
    } catch {
      // ignore
    }
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void handleSend();
      }
    },
    [handleSend]
  );

  const handleRetry = useCallback(
    (userContent: string) => {
      setInput(userContent);
      textareaRef.current?.focus();
    },
    []
  );

  /* ─────────────── Quick Actions (Copilot) ─────────────── */

  const handleGenerateCommitMessage = useCallback(async () => {
    if (!hasRepo || quickActionLoading) return;

    setQuickActionLoading("commit");

    // Add user message
    const userMsg: ChatMessage = {
      id: createId(),
      role: "user",
      content: t("aiTerminal.quickActions.commitRequest"),
      createdAt: Date.now()
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const bciGit = getBciGit();
      const result = await unwrap(bciGit.generateCommitMessage());

      const commitCommand = `git commit -m "${result.title.replace(/"/g, '\\"')}"${
        result.description ? ` -m "${result.description.replace(/"/g, '\\"')}"` : ""
      }`;

      const suggestion: AiTerminalSuggestion = {
        command: commitCommand,
        explanation: `**${t("aiTerminal.quickActions.suggestedCommit")}**\n\n**${t("aiTerminal.quickActions.title")}:** ${result.title}\n\n${
          result.description ? `**${t("aiTerminal.quickActions.description")}:** ${result.description}` : ""
        }`,
        isGlobal: false,
        requiresRepo: true,
        warnings: []
      };

      const assistantMsg: ChatMessage = {
        id: createId(),
        role: "assistant",
        content: suggestion.explanation,
        suggestion,
        createdAt: Date.now()
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      const errorMsg: ChatMessage = {
        id: createId(),
        role: "assistant",
        content: t("aiTerminal.quickActions.commitError"),
        error: err instanceof Error ? err.message : String(err),
        createdAt: Date.now()
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setQuickActionLoading(null);
    }
  }, [hasRepo, quickActionLoading, t]);

  const handleGenerateBranchName = useCallback(async () => {
    if (!hasRepo || quickActionLoading) return;

    setQuickActionLoading("branch");

    // Add user message
    const userMsg: ChatMessage = {
      id: createId(),
      role: "user",
      content: t("aiTerminal.quickActions.branchRequest"),
      createdAt: Date.now()
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const bciGit = getBciGit();
      const suggestions = await unwrap(bciGit.generateBranchNameSuggestions());

      const suggestionsList = suggestions.map((s, i) => `${i + 1}. \`${s}\``).join("\n");
      const firstSuggestion = suggestions[0] || "feature/new-branch";

      const branchCommand = `git checkout -b ${firstSuggestion}`;

      const suggestion: AiTerminalSuggestion = {
        command: branchCommand,
        explanation: `**${t("aiTerminal.quickActions.suggestedBranches")}**\n\n${suggestionsList}\n\n${t("aiTerminal.quickActions.branchHint")}`,
        isGlobal: false,
        requiresRepo: true,
        warnings: []
      };

      const assistantMsg: ChatMessage = {
        id: createId(),
        role: "assistant",
        content: suggestion.explanation,
        suggestion,
        createdAt: Date.now()
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      const errorMsg: ChatMessage = {
        id: createId(),
        role: "assistant",
        content: t("aiTerminal.quickActions.branchError"),
        error: err instanceof Error ? err.message : String(err),
        createdAt: Date.now()
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setQuickActionLoading(null);
    }
  }, [hasRepo, quickActionLoading, t]);

  /* ─────────────── Render helpers ─────────────── */

  const renderCommandBlock = (msg: ChatMessage) => {
    if (!msg.suggestion) return null;

    const isEditing = editingCommand?.id === msg.id;
    const isExecuting = execLoadingId === msg.id;
    const showWarning = msg.suggestion.isGlobal || !hasRepo;

    return (
      <div className="mt-3 rounded-lg border border-slate-700 bg-slate-950/70 p-3">
        {/* Command line */}
        <div className="flex items-center gap-2">
          <TerminalIcon className="h-4 w-4 text-cyan-400 shrink-0" />
          {isEditing ? (
            <input
              type="text"
              value={editingCommand.value}
              onChange={(e) => setEditingCommand({ id: msg.id, value: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  void executeMessage(msg, editingCommand.value);
                } else if (e.key === "Escape") {
                  setEditingCommand(null);
                }
              }}
              className="flex-1 bg-transparent font-mono text-sm text-cyan-200 outline-none border-b border-cyan-500"
              autoFocus
            />
          ) : (
            <code className="flex-1 font-mono text-sm text-cyan-200 break-all">
              {msg.suggestion.command}
            </code>
          )}
        </div>

        {/* Action buttons */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {isEditing ? (
            <>
              <button
                type="button"
                onClick={() => executeMessage(msg, editingCommand.value)}
                className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
              >
                <Check className="h-3 w-3" />
                {t("aiTerminal.runEdited")}
              </button>
              <button
                type="button"
                onClick={() => setEditingCommand(null)}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-600 px-3 py-1.5 text-xs text-slate-300 hover:border-slate-500"
              >
                <X className="h-3 w-3" />
                {t("common.cancel")}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => requestExecution(msg)}
                disabled={isExecuting || Boolean(msg.execution)}
                className="inline-flex items-center gap-1.5 rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Play className="h-3 w-3" />
                {isExecuting ? t("aiTerminal.executing") : msg.execution ? t("aiTerminal.executed") : t("aiTerminal.execute")}
              </button>
              {!msg.execution && (
                <button
                  type="button"
                  onClick={() => setEditingCommand({ id: msg.id, value: msg.suggestion!.command })}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-600 px-3 py-1.5 text-xs text-slate-300 hover:border-cyan-500 hover:text-cyan-300"
                >
                  <Edit3 className="h-3 w-3" />
                  {t("aiTerminal.edit")}
                </button>
              )}
              <button
                type="button"
                onClick={() => handleCopy(msg.suggestion!.command, msg.id)}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-600 px-3 py-1.5 text-xs text-slate-300 hover:border-slate-500"
              >
                <Copy className="h-3 w-3" />
                {copiedId === msg.id ? t("aiTerminal.copied") : t("aiTerminal.copy")}
              </button>
            </>
          )}
        </div>

        {/* Warning badge */}
        {showWarning && !msg.execution && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              {msg.suggestion.isGlobal
                ? t("aiTerminal.globalWarningInline")
                : t("aiTerminal.noRepoWarningInline")}
            </span>
          </div>
        )}

        {/* Execution result */}
        {msg.execution && (
          <div className="mt-3 rounded-md border border-slate-700 bg-slate-900/80 p-3">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    msg.execution.exitCode === 0 ? "bg-emerald-500" : "bg-rose-500"
                  }`}
                />
                {t("aiTerminal.exitCode", { code: msg.execution.exitCode ?? "?" })}
              </span>
              <span>{t("aiTerminal.duration", { ms: msg.execution.durationMs })}</span>
            </div>
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap font-mono text-xs text-slate-200">
              {[msg.execution.stdout, msg.execution.stderr]
                .filter((v) => v?.trim())
                .join("\n") || t("aiTerminal.noOutput")}
            </pre>
          </div>
        )}

        {/* Error */}
        {msg.error && !msg.execution && (
          <div className="mt-3 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
            {msg.error}
          </div>
        )}
      </div>
    );
  };

  /* ─────────────── Main render ─────────────── */

  const confirmTitle = pendingExecution?.suggestion?.isGlobal
    ? t("aiTerminal.globalWarningTitle")
    : t("aiTerminal.noRepoWarningTitle");

  const confirmMessage = pendingExecution?.suggestion?.isGlobal
    ? t("aiTerminal.globalWarningMessage")
    : t("aiTerminal.noRepoWarningMessage");

  return (
    <div className="flex h-full flex-col text-slate-100">
      {/* Navigation bar */}
      <div className="flex items-center gap-2 border-b border-slate-800 bg-slate-950/80 px-4 py-2">
        <button
          type="button"
          onClick={() => navigate("/repo")}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("aiTerminal.backToRepo")}
        </button>
      </div>

      {/* Header */}
      <div className="flex items-center gap-3 border-b border-slate-800 bg-slate-900/80 px-5 py-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/20 to-cyan-500/20">
          <Sparkles className="h-5 w-5 text-cyan-300" />
        </div>
        <div className="flex-1">
          <h1 className="text-lg font-semibold">{t("aiTerminal.title")}</h1>
          <p className="text-xs text-slate-400">{t("aiTerminal.subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={handleClearHistory}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs text-slate-400 hover:border-rose-500/50 hover:text-rose-300 transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
          {t("aiTerminal.clearHistory")}
        </button>
      </div>

      {/* Quick Actions */}
      {hasRepo && (
        <div className="flex items-center gap-2 border-b border-slate-800 bg-slate-900/50 px-5 py-3">
          <span className="text-xs text-slate-500 mr-2">{t("aiTerminal.quickActions.label")}</span>
          <button
            type="button"
            onClick={handleGenerateCommitMessage}
            disabled={quickActionLoading !== null || loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-600/50 bg-emerald-600/10 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-600/20 hover:border-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <GitCommit className="h-3.5 w-3.5" />
            {quickActionLoading === "commit" ? t("common.generating") : t("aiTerminal.quickActions.generateCommit")}
          </button>
          <button
            type="button"
            onClick={handleGenerateBranchName}
            disabled={quickActionLoading !== null || loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-violet-600/50 bg-violet-600/10 px-3 py-1.5 text-xs font-medium text-violet-300 hover:bg-violet-600/20 hover:border-violet-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <GitBranch className="h-3.5 w-3.5" />
            {quickActionLoading === "branch" ? t("common.generating") : t("aiTerminal.quickActions.generateBranch")}
          </button>
        </div>
      )}

      {/* No-repo warning */}
      {!hasRepo && (
        <div className="mx-5 mt-4 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{t("aiTerminal.noRepoWarning")}</span>
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {messages.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-full text-center text-slate-500">
            <Bot className="h-12 w-12 mb-3 text-slate-600" />
            <p className="text-sm">{t("aiTerminal.empty")}</p>
            <p className="text-xs mt-1 text-slate-600">{t("aiTerminal.hint")}</p>
          </div>
        )}

        {messages.map((msg, idx) => {
          const isUser = msg.role === "user";
          const prevMsg = messages[idx - 1];
          const showRetry = isUser && prevMsg?.role !== "user";

          return (
            <div
              key={msg.id}
              className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}
            >
              {/* Avatar */}
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                  isUser
                    ? "bg-violet-500/20 text-violet-300"
                    : "bg-cyan-500/20 text-cyan-300"
                }`}
              >
                {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
              </div>

              {/* Bubble */}
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                  isUser
                    ? "bg-violet-600/30 text-slate-100 rounded-br-md"
                    : "bg-slate-800/80 text-slate-200 rounded-bl-md"
                }`}
              >
                {isUser ? (
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                ) : (
                  <>
                    <div className="prose prose-invert prose-sm max-w-none text-slate-300">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                    {renderCommandBlock(msg)}
                    {msg.error && !msg.suggestion && (
                      <div className="mt-2 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                        {msg.error}
                      </div>
                    )}
                  </>
                )}

                {/* Retry button for user messages after error */}
                {isUser && showRetry && (
                  <button
                    type="button"
                    onClick={() => handleRetry(msg.content)}
                    className="mt-2 inline-flex items-center gap-1 text-xs text-slate-400 hover:text-cyan-300"
                  >
                    <RefreshCw className="h-3 w-3" />
                    {t("aiTerminal.retry")}
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {/* Loading indicator */}
        {loading && (
          <div className="flex gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cyan-500/20 text-cyan-300">
              <Bot className="h-4 w-4" />
            </div>
            <div className="rounded-2xl rounded-bl-md bg-slate-800/80 px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <div className="flex gap-1">
                  <span className="h-2 w-2 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="h-2 w-2 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="h-2 w-2 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
                <span>{t("aiTerminal.thinking")}</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-slate-800 bg-slate-900/80 p-4">
        <div className="flex items-end gap-3 rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 focus-within:border-cyan-500 transition-colors">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("aiTerminal.inputPlaceholder")}
            rows={1}
            className="flex-1 resize-none bg-transparent text-sm text-slate-100 placeholder:text-slate-500 outline-none"
            style={{ maxHeight: "150px" }}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-600 text-white transition hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500 text-center">
          {t("aiTerminal.inputHint")}
        </p>
      </div>

      {/* Confirm modal for global/no-repo commands */}
      <ConfirmModal
        isOpen={Boolean(pendingExecution)}
        title={confirmTitle}
        message={confirmMessage}
        confirmLabel={t("aiTerminal.confirmExecute")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => pendingExecution && executeMessage(pendingExecution)}
        onCancel={() => setPendingExecution(null)}
      />
    </div>
  );
};

export default AiTerminal;
