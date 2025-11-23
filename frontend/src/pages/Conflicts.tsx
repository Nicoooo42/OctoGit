import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  GitMerge,
  RefreshCcw,
  Save,
  ShieldCheck
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useRepoContext } from "../context/RepoContext";
import Editor from '@monaco-editor/react';

const splitContentIntoLines = (content: string | null | undefined): string[] => {
  if (content === null || content === undefined) {
    return [];
  }
  return content.replace(/\r\n/g, "\n").split("\n");
};

type MergedLine = {
  source: "ours" | "theirs" | "both";
  text: string;
  lineNumber: number;
};

const Conflicts: React.FC = () => {
  const navigate = useNavigate();
  const {
    repo,
    conflicts,
    loadConflicts,
    resolveConflict,
    saveConflictResolution,
    loading
  } = useRepoContext();
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [editorValue, setEditorValue] = useState('');
  const [stageOnSave, setStageOnSave] = useState(true);
  const [isEditorDirty, setIsEditorDirty] = useState(false);
  const [lastSelectedPath, setLastSelectedPath] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const copyTimerRef = useRef<number | null>(null);
  const [oursSelections, setOursSelections] = useState<boolean[]>([]);
  const [theirsSelections, setTheirsSelections] = useState<boolean[]>([]);

  const busy = loading || isRefreshing;
  const remainingConflicts = conflicts.length;

  const languageMap = useMemo<Record<string, string>>(
    () => ({
      ts: "typescript",
      tsx: "typescript",
      js: "javascript",
      jsx: "javascript",
      mjs: "javascript",
      cjs: "javascript",
      json: "json",
      css: "css",
      scss: "scss",
      sass: "scss",
      less: "less",
      html: "html",
      htm: "html",
      md: "markdown",
      markdown: "markdown",
      yml: "yaml",
      yaml: "yaml",
      sh: "shell",
      bash: "shell",
      zsh: "shell",
      ps1: "powershell",
      ps: "powershell",
      xml: "xml",
      svg: "xml",
      py: "python",
      rb: "ruby",
      go: "go",
      rs: "rust",
      java: "java",
      kt: "kotlin",
      c: "c",
      h: "c",
      cpp: "cpp",
      hpp: "cpp",
      cs: "csharp",
      php: "php",
      sql: "sql",
      ini: "ini",
      toml: "toml",
      env: "properties",
      txt: "plaintext"
    }),
    []
  );

  const getLanguageId = useCallback(
    (path: string): string => {
      const ext = path.split('.').pop()?.toLowerCase() ?? "";
      return languageMap[ext] ?? "plaintext";
    },
    [languageMap]
  );

  useEffect(() => {
    if (!repo) {
      navigate("/", { replace: true });
      return;
    }
    void loadConflicts();
  }, [repo, loadConflicts, navigate]);

  useEffect(() => {
    if (conflicts.length === 0) {
      setSelectedPath(null);
      setLastSelectedPath(null);
      setEditorValue('');
      setIsEditorDirty(false);
      return;
    }

    setSelectedPath((previous) => {
      if (previous && conflicts.some((conflict) => conflict.path === previous)) {
        return previous;
      }
      return conflicts[0]?.path ?? null;
    });
  }, [conflicts]);

  const selectedConflict = useMemo(
    () => conflicts.find((conflict) => conflict.path === selectedPath) ?? null,
    [conflicts, selectedPath]
  );

  useEffect(() => {
    if (!selectedConflict) {
      return;
    }

    const newContent = selectedConflict.current ?? selectedConflict.ours ?? '';
    if (selectedConflict.path !== lastSelectedPath) {
      setEditorValue(newContent);
      setLastSelectedPath(selectedConflict.path);
      setIsEditorDirty(false);
      setStageOnSave(true);
      return;
    }

    if (!isEditorDirty) {
      setEditorValue(newContent);
    }
  }, [selectedConflict, lastSelectedPath, isEditorDirty]);

  useEffect(() => () => {
    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current);
    }
  }, []);

  const scheduleCopyFeedback = useCallback((section: string) => {
    setCopiedSection(section);
    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current);
    }
    copyTimerRef.current = window.setTimeout(() => {
      setCopiedSection((current) => (current === section ? null : current));
    }, 2000);
  }, []);

  const copyContent = useCallback(async (section: string, content: string) => {
    if (!navigator?.clipboard) {
      return;
    }
    try {
      await navigator.clipboard.writeText(content);
      scheduleCopyFeedback(section);
    } catch (error) {
      console.error("[Conflicts] Échec de la copie dans le presse-papiers", error);
    }
  }, [scheduleCopyFeedback]);

  const handleRefresh = useCallback(async () => {
    if (!repo) {
      return;
    }
    setIsRefreshing(true);
    await loadConflicts();
    setIsRefreshing(false);
  }, [repo, loadConflicts]);

  const handleAccept = useCallback(async (strategy: "ours" | "theirs") => {
    if (!selectedConflict) {
      return;
    }
    await resolveConflict(selectedConflict.path, strategy);
    setIsEditorDirty(false);
  }, [resolveConflict, selectedConflict]);

  const handleSave = useCallback(async () => {
    if (!selectedConflict || selectedConflict.isBinary) {
      return;
    }
    await saveConflictResolution(selectedConflict.path, editorValue, { stage: stageOnSave });
    setIsEditorDirty(false);
  }, [editorValue, saveConflictResolution, selectedConflict, stageOnSave]);

  const handleEditorChange = (value: string) => {
    setEditorValue(value);
    setIsEditorDirty(true);
  };

  const handleApplyVersion = useCallback((content: string | null) => {
    if (content === null) {
      return;
    }
    setEditorValue(content);
    setIsEditorDirty(true);
  }, []);

  const handleRestoreFromCurrent = useCallback(() => {
    if (!selectedConflict) {
      return;
    }
    const fallback = selectedConflict.current ?? selectedConflict.ours ?? '';
    setEditorValue(fallback);
    setIsEditorDirty(false);
  }, [selectedConflict]);

  const removeConflictMarkers = useCallback(() => {
    const cleaned = editorValue
      .replace(/^<<<<<<< HEAD\n?/gm, '')
      .replace(/^=======\n?/gm, '')
      .replace(/^>>>>>>> .*\n?/gm, '');
    setEditorValue(cleaned);
    setIsEditorDirty(true);
  }, [editorValue]);

  const canEdit = Boolean(selectedConflict) && !selectedConflict?.isBinary;

  const currentConflictIndex = useMemo(
    () => conflicts.findIndex((conflict) => conflict.path === selectedPath),
    [conflicts, selectedPath]
  );

  const handleNavigateConflict = useCallback((direction: "prev" | "next") => {
    if (currentConflictIndex === -1) {
      return;
    }
    const targetIndex = direction === "prev" ? currentConflictIndex - 1 : currentConflictIndex + 1;
    if (targetIndex < 0 || targetIndex >= conflicts.length) {
      return;
    }
    setSelectedPath(conflicts[targetIndex].path);
  }, [conflicts, currentConflictIndex]);

  const totalConflicts = conflicts.length;
  const conflictPosition = currentConflictIndex >= 0 ? currentConflictIndex + 1 : 0;
  const hasPreviousConflict = currentConflictIndex > 0;
  const hasNextConflict = currentConflictIndex >= 0 && currentConflictIndex < conflicts.length - 1;

  const oursLines = useMemo<string[]>(
    () => splitContentIntoLines(selectedConflict?.ours ?? null),
    [selectedConflict?.ours]
  );

  const theirsLines = useMemo<string[]>(
    () => splitContentIntoLines(selectedConflict?.theirs ?? null),
    [selectedConflict?.theirs]
  );

  useEffect(() => {
    if (!selectedConflict || selectedConflict.isBinary) {
      setOursSelections([]);
      setTheirsSelections([]);
      return;
    }

    setOursSelections((previous) => {
      if (previous.length === oursLines.length && selectedConflict.path === lastSelectedPath) {
        return previous;
      }
      return oursLines.map(() => true);
    });

    setTheirsSelections((previous) => {
      if (previous.length === theirsLines.length && selectedConflict.path === lastSelectedPath) {
        return previous;
      }
      return theirsLines.map(() => true);
    });
  }, [selectedConflict, oursLines, theirsLines, lastSelectedPath]);

  const selectedOursCount = useMemo(() => {
    return oursSelections.reduce((count, current) => count + (current ? 1 : 0), 0);
  }, [oursSelections]);

  const selectedTheirsCount = useMemo(() => {
    return theirsSelections.reduce((count, current) => count + (current ? 1 : 0), 0);
  }, [theirsSelections]);

  const mergedLines = useMemo<MergedLine[]>(() => {
    if (!canEdit) {
      return [];
    }
    const result: MergedLine[] = [];
    const maxLength = Math.max(oursLines.length, theirsLines.length);
    for (let index = 0; index < maxLength; index += 1) {
      const oursLine = oursLines[index];
      const theirsLine = theirsLines[index];
      const oursSelected = Boolean(oursSelections[index]);
      const theirsSelected = Boolean(theirsSelections[index]);
      const lineNumber = index + 1;

      if (oursLine !== undefined && theirsLine !== undefined && oursLine === theirsLine) {
        if (oursSelected || theirsSelected) {
          result.push({ source: "both", text: oursLine, lineNumber });
        }
        continue;
      }

      if (oursLine !== undefined && oursSelected) {
        result.push({ source: "ours", text: oursLine, lineNumber });
      }

      if (theirsLine !== undefined && theirsSelected) {
        result.push({ source: "theirs", text: theirsLine, lineNumber });
      }
    }
    return result;
  }, [canEdit, oursLines, oursSelections, theirsLines, theirsSelections]);

  const mergedPreview = useMemo(() => {
    return mergedLines.map((line) => line.text).join("\n");
  }, [mergedLines]);

  const toggleLineSelection = useCallback((source: "ours" | "theirs", index: number) => {
    if (source === "ours") {
      setOursSelections((previous) => {
        if (index < 0 || index >= previous.length) {
          return previous;
        }
        return previous.map((value, currentIndex) => (currentIndex === index ? !value : value));
      });
      return;
    }
    setTheirsSelections((previous) => {
      if (index < 0 || index >= previous.length) {
        return previous;
      }
      return previous.map((value, currentIndex) => (currentIndex === index ? !value : value));
    });
  }, []);

  const toggleAllSelections = useCallback((source: "ours" | "theirs", checked: boolean) => {
    if (source === "ours") {
      setOursSelections(oursLines.map(() => checked));
      return;
    }
    setTheirsSelections(theirsLines.map(() => checked));
  }, [oursLines, theirsLines]);

  const handleApplySelection = useCallback(() => {
    if (!canEdit) {
      return;
    }
    setEditorValue(mergedPreview);
    setIsEditorDirty(true);
  }, [canEdit, mergedPreview]);

  const handleResetSelections = useCallback(() => {
    setOursSelections(oursLines.map(() => true));
    setTheirsSelections(theirsLines.map(() => true));
  }, [oursLines, theirsLines]);

  const handleCopyPaneSelection = useCallback((source: "ours" | "theirs") => {
    if (source === "ours") {
      const lines: string[] = [];
      oursLines.forEach((line, index) => {
        if (oursSelections[index]) {
          lines.push(line);
        }
      });
      void copyContent("ours", lines.join("\n"));
      return;
    }
    const selectedLines: string[] = [];
    theirsLines.forEach((line, index) => {
      if (theirsSelections[index]) {
        selectedLines.push(line);
      }
    });
    void copyContent("theirs", selectedLines.join("\n"));
  }, [copyContent, oursLines, oursSelections, theirsLines, theirsSelections]);

  const handleCopyMergedPreview = useCallback(() => {
    void copyContent("merged", mergedPreview);
  }, [copyContent, mergedPreview]);

  const handleCopyEditorValue = useCallback(() => {
    void copyContent("editor", editorValue);
  }, [copyContent, editorValue]);

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
            Retour au dépôt
          </button>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-slate-500">Résolution des conflits</div>
            <h1 className="mt-1 text-lg font-semibold text-slate-100">{repo?.name ?? "Aucun dépôt"}</h1>
            <p className="text-xs text-slate-500">
              {remainingConflicts > 0
                ? `${remainingConflicts} conflit${remainingConflicts > 1 ? 's' : ''} à résoudre`
                : "Aucun conflit en attente"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void handleRefresh()}
            disabled={busy}
            className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs text-slate-300 transition hover:border-cyan-400/40 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCcw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            Rafraîchir
          </button>
          {repo && (
            <div className="text-right text-xs text-slate-500">
              <p className="font-medium text-slate-300">{repo.name}</p>
              <p className="text-[11px]">{repo.path}</p>
            </div>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="w-80 border-r border-slate-800 bg-slate-900/80 px-5 py-4 text-sm text-slate-300">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-500">
            <AlertTriangle className="h-4 w-4" />
            Fichiers en conflit
          </div>
          <div className="mt-4 space-y-2">
            {conflicts.length === 0 && (
              <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 text-xs text-slate-500">
                Aucun conflit détecté.
              </div>
            )}
            {conflicts.map((conflict) => {
              const isActive = conflict.path === selectedPath;
              return (
                <button
                  key={conflict.path}
                  type="button"
                  onClick={() => setSelectedPath(conflict.path)}
                  className={`flex w-full flex-col rounded-lg border px-3 py-2 text-left text-xs transition ${
                    isActive
                      ? "border-cyan-400/40 bg-cyan-500/10 text-cyan-100"
                      : "border-slate-800 bg-slate-900/40 text-slate-300 hover:border-cyan-400/30 hover:bg-slate-800/60"
                  }`}
                >
                  <span className="truncate font-medium">{conflict.path}</span>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] uppercase text-slate-500">
                    <span className="rounded bg-slate-800/70 px-1.5 py-0.5 text-slate-400">Index&nbsp;: {conflict.indexStatus}</span>
                    <span className="rounded bg-slate-800/70 px-1.5 py-0.5 text-slate-400">Worktree&nbsp;: {conflict.workingTreeStatus}</span>
                    {conflict.isBinary && (
                      <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-200">Binaire</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {!selectedConflict ? (
            <div className="flex h-full items-center justify-center bg-slate-900 text-sm text-slate-400">
              {conflicts.length === 0
                ? "Plus aucun conflit. Vous pouvez retourner au dépôt."
                : "Sélectionnez un fichier en conflit pour commencer."}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-6 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleAccept("ours")}
                    disabled={busy}
                    className="flex items-center gap-2 rounded-lg border border-emerald-600/40 bg-emerald-600/10 px-3 py-2 text-xs font-medium text-emerald-200 transition hover:bg-emerald-600/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    Conserver nos changements
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleAccept("theirs")}
                    disabled={busy}
                    className="flex items-center gap-2 rounded-lg border border-rose-600/40 bg-rose-600/10 px-3 py-2 text-xs font-medium text-rose-200 transition hover:bg-rose-600/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <GitMerge className="h-4 w-4" />
                    Accepter leurs changements
                  </button>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => void handleSave()}
                      disabled={busy}
                      className="flex items-center gap-2 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-xs font-medium text-cyan-100 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Save className="h-4 w-4" />
                      Enregistrer la résolution
                    </button>
                  )}
                </div>
                {canEdit && (
                  <label className="flex items-center gap-2 text-xs text-slate-400">
                    <input
                      type="checkbox"
                      checked={stageOnSave}
                      onChange={() => setStageOnSave((prev) => !prev)}
                      className="h-4 w-4 rounded border border-slate-600 bg-slate-900 text-cyan-400 focus:ring-cyan-500"
                    />
                    Stage automatique
                  </label>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                {selectedConflict.isBinary && (
                  <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                    Ce fichier est binaire. Utilisez les actions ci-dessus pour choisir la version à conserver ou résolvez le conflit via la ligne de commande.
                  </div>
                )}
                {canEdit && (
                  <div className="mt-6 space-y-5">
                    <section className="overflow-hidden rounded-xl border border-slate-700 bg-slate-900/80 shadow-lg">
                      <div className="flex flex-col gap-3 border-b border-slate-700/60 bg-slate-800/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h2 className="text-sm font-semibold text-slate-100">Comparaison détaillée</h2>
                          <p className="text-xs text-slate-400">
                            Sélectionnez ligne par ligne les modifications à conserver.
                          </p>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-400">
                          <span>
                            Conflit {conflictPosition} / {totalConflicts || 1}
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleNavigateConflict("prev")}
                              disabled={!hasPreviousConflict}
                              className="flex h-8 w-8 items-center justify-center rounded border border-slate-600/60 bg-slate-900/60 text-slate-300 transition hover:border-cyan-400/40 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <ChevronUp className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleNavigateConflict("next")}
                              disabled={!hasNextConflict}
                              className="flex h-8 w-8 items-center justify-center rounded border border-slate-600/60 bg-slate-900/60 text-slate-300 transition hover:border-cyan-400/40 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <ChevronDown className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-4 lg:grid-cols-2">
                        <ConflictPane
                          badge="A"
                          title="Applied patch or stash"
                          description="Version locale"
                          lines={oursLines}
                          selections={oursSelections}
                          onToggleLine={(index) => toggleLineSelection("ours", index)}
                          onToggleAll={(checked) => toggleAllSelections("ours", checked)}
                          onCopySelected={() => handleCopyPaneSelection("ours")}
                          copied={copiedSection === "ours"}
                          accent="cyan"
                        />
                        <ConflictPane
                          badge="B"
                          title="Applied patch or stash"
                          description="Version distante"
                          lines={theirsLines}
                          selections={theirsSelections}
                          onToggleLine={(index) => toggleLineSelection("theirs", index)}
                          onToggleAll={(checked) => toggleAllSelections("theirs", checked)}
                          onCopySelected={() => handleCopyPaneSelection("theirs")}
                          copied={copiedSection === "theirs"}
                          accent="amber"
                        />
                      </div>

                      <OutputPreview
                        lines={mergedLines}
                        onCopy={handleCopyMergedPreview}
                        copied={copiedSection === "merged"}
                      />

                      <div className="flex flex-col gap-3 border-t border-slate-700/60 bg-slate-800/30 px-4 py-3 text-xs text-slate-300 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex flex-wrap items-center gap-3">
                          <span>Sélection A&nbsp;: {selectedOursCount}/{oursLines.length}</span>
                          <span>Sélection B&nbsp;: {selectedTheirsCount}/{theirsLines.length}</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => handleResetSelections()}
                            className="rounded-lg border border-slate-600/50 bg-slate-900/50 px-3 py-1.5 font-medium text-slate-200 transition hover:border-slate-500"
                          >
                            Réinitialiser sélection
                          </button>
                          <button
                            type="button"
                            onClick={() => handleApplySelection()}
                            className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 font-medium text-emerald-200 transition hover:bg-emerald-500/20"
                          >
                            Appliquer au résultat
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCopyMergedPreview()}
                            className="flex items-center gap-1 rounded-lg border border-slate-600/50 bg-slate-900/50 px-3 py-1.5 font-medium text-slate-200 transition hover:border-cyan-400/40 hover:text-cyan-200"
                          >
                            {copiedSection === "merged" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                            Copier la sortie
                          </button>
                        </div>
                      </div>
                    </section>

                    <section className="overflow-hidden rounded-xl border border-slate-700 bg-slate-900/80 shadow-lg">
                      <div className="flex flex-col gap-3 border-b border-slate-700/60 bg-slate-800/40 px-4 py-3 text-slate-300 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h3 className="text-sm font-semibold text-slate-100">Éditeur de résolution</h3>
                          <span className={`text-xs ${isEditorDirty ? "text-amber-300" : "text-emerald-300"}`}>
                            {isEditorDirty ? "● Modifications non sauvegardées" : "✓ Synchronisé avec le fichier"}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs">
                          {selectedConflict.ours !== null && (
                            <button
                              type="button"
                              onClick={() => handleApplyVersion(selectedConflict.ours)}
                              className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 font-medium text-cyan-100 transition hover:bg-cyan-500/20"
                            >
                              Remplacer par notre version
                            </button>
                          )}
                          {selectedConflict.theirs !== null && (
                            <button
                              type="button"
                              onClick={() => handleApplyVersion(selectedConflict.theirs)}
                              className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 font-medium text-rose-100 transition hover:bg-rose-500/20"
                            >
                              Remplacer par version distante
                            </button>
                          )}
                          {selectedConflict.base !== null && (
                            <button
                              type="button"
                              onClick={() => handleApplyVersion(selectedConflict.base)}
                              className="rounded-lg border border-slate-600/40 bg-slate-800/50 px-3 py-1.5 font-medium text-slate-200 transition hover:border-slate-500"
                            >
                              Revenir à la base
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleCopyEditorValue()}
                            className="flex items-center gap-1 rounded-lg border border-slate-600/40 bg-slate-900/60 px-3 py-1.5 font-medium text-slate-200 transition hover:border-cyan-400/40 hover:text-cyan-200"
                          >
                            {copiedSection === "editor" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                            Copier le contenu
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRestoreFromCurrent()}
                            className="rounded-lg border border-slate-600/40 bg-slate-800/50 px-3 py-1.5 font-medium text-slate-200 transition hover:border-slate-500"
                          >
                            Recharger le fichier
                          </button>
                          <button
                            type="button"
                            onClick={() => removeConflictMarkers()}
                            className="rounded-lg border border-amber-600/40 bg-amber-600/10 px-3 py-1.5 font-medium text-amber-200 transition hover:bg-amber-600/20"
                            title="Nettoie les marqueurs de conflits Git (<<<<<<< HEAD, =======, >>>>>>>)"
                          >
                            🧹 Nettoyer marqueurs
                          </button>
                        </div>
                      </div>
                      <Editor
                        height="360px"
                        language={getLanguageId(selectedConflict.path)}
                        value={editorValue}
                        onChange={(value) => handleEditorChange(value || '')}
                        options={{
                          minimap: { enabled: false },
                          scrollBeyondLastLine: false,
                          lineNumbers: "on",
                          fontSize: 12,
                          wordWrap: "on",
                          tabSize: 2,
                        }}
                        theme="vs-dark"
                        loading={<div className="flex h-full items-center justify-center text-slate-400">Chargement de l'éditeur...</div>}
                      />
                    </section>
                  </div>
                )}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
};

type ConflictPaneProps = {
  badge: string;
  title: string;
  description: string;
  lines: string[];
  selections: boolean[];
  onToggleLine: (index: number) => void;
  onToggleAll: (checked: boolean) => void;
  onCopySelected: () => void;
  copied: boolean;
  accent: "cyan" | "amber";
};

const ConflictPane: React.FC<ConflictPaneProps> = ({
  badge,
  title,
  description,
  lines,
  selections,
  onToggleLine,
  onToggleAll,
  onCopySelected,
  copied,
  accent,
}) => {
  const masterCheckboxRef = useRef<HTMLInputElement | null>(null);
  const allSelected = selections.length > 0 && selections.every((value) => value);
  const someSelected = selections.some((value) => value);

  useEffect(() => {
    if (masterCheckboxRef.current) {
      masterCheckboxRef.current.indeterminate = !allSelected && someSelected;
    }
  }, [allSelected, someSelected]);

  const palette = accent === "cyan"
    ? {
        badge: "border-cyan-400/40 bg-cyan-500/15 text-cyan-100",
        checkbox: "text-cyan-400 focus:ring-cyan-500",
        selected: "border-cyan-500/40 bg-cyan-500/10 text-cyan-100",
      }
    : {
        badge: "border-amber-400/40 bg-amber-500/15 text-amber-100",
        checkbox: "text-amber-400 focus:ring-amber-500",
        selected: "border-amber-500/40 bg-amber-500/10 text-amber-100",
      };

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-900/70">
      <div className="flex items-center justify-between border-b border-slate-700/60 bg-slate-800/40 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className={`inline-flex h-6 w-6 items-center justify-center rounded border text-xs font-semibold uppercase ${palette.badge}`}>
            {badge}
          </span>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-200">{title}</div>
            <div className="text-[11px] text-slate-500">{description}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[11px] uppercase text-slate-400">
          <label className="flex items-center gap-2">
            <input
              ref={masterCheckboxRef}
              type="checkbox"
              checked={allSelected}
              onChange={(event) => onToggleAll(event.target.checked)}
              className={`h-4 w-4 rounded border border-slate-600 bg-slate-900 ${palette.checkbox}`}
            />
            Tout sélectionner
          </label>
          {lines.length > 0 && (
            <button
              type="button"
              onClick={onCopySelected}
              className="flex items-center gap-1 rounded border border-slate-600/60 bg-slate-900/60 px-2 py-1 text-[11px] font-medium text-slate-200 transition hover:border-cyan-400/40 hover:text-cyan-200"
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              Copier sélection
            </button>
          )}
        </div>
      </div>
      <div className="scrollbar-thin flex-1 overflow-auto font-mono text-xs text-slate-200">
        {lines.length === 0 ? (
          <div className="px-4 py-6 text-center text-slate-500">Aucune ligne disponible.</div>
        ) : (
          lines.map((line, index) => {
            const selected = Boolean(selections[index]);
            return (
              <label
                key={`${badge}-${index}`}
                className={`flex items-center gap-3 border-b border-slate-800/60 px-3 py-1.5 transition hover:bg-slate-800/50 ${selected ? palette.selected : ""}`}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => onToggleLine(index)}
                  className={`h-4 w-4 rounded border border-slate-600 bg-slate-900 ${palette.checkbox}`}
                />
                <span className="w-10 text-[11px] text-slate-500">{index + 1}</span>
                <span className="flex-1 whitespace-pre-wrap">{line === "" ? " " : line}</span>
              </label>
            );
          })
        )}
      </div>
    </div>
  );
};

type OutputPreviewProps = {
  lines: MergedLine[];
  onCopy: () => void;
  copied: boolean;
};

const OutputPreview: React.FC<OutputPreviewProps> = ({ lines, onCopy, copied }) => (
  <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-900/70">
    <div className="flex items-center justify-between border-b border-slate-700/60 bg-slate-800/40 px-4 py-3">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-200">Output</div>
        <p className="text-[11px] text-slate-500">Aperçu du contenu résultant.</p>
      </div>
      <button
        type="button"
        onClick={onCopy}
        className="flex items-center gap-1 rounded border border-slate-600/60 bg-slate-900/60 px-2 py-1 text-[11px] font-medium text-slate-200 transition hover:border-cyan-400/40 hover:text-cyan-200"
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        Copier
      </button>
    </div>
    <div className="scrollbar-thin max-h-64 overflow-auto font-mono text-xs text-slate-200">
      {lines.length === 0 ? (
        <div className="px-4 py-6 text-center text-slate-500">Aucune ligne sélectionnée pour l'instant.</div>
      ) : (
        lines.map((line, index) => {
          const badgeStyles = line.source === "ours"
            ? "border-cyan-400/40 bg-cyan-500/15 text-cyan-100"
            : line.source === "theirs"
              ? "border-amber-400/40 bg-amber-500/15 text-amber-100"
              : "border-slate-600/40 bg-slate-800/60 text-slate-300";
          const badgeLabel = line.source === "ours" ? "A" : line.source === "theirs" ? "B" : "";
          return (
            <div
              key={`merged-${index}-${line.source}-${line.lineNumber}`}
              className="flex items-start gap-3 border-b border-slate-800/60 px-3 py-1.5"
            >
              <span className={`mt-0.5 flex h-5 min-w-[1.75rem] items-center justify-center rounded border px-2 text-[11px] font-semibold uppercase ${badgeStyles}`}>
                {badgeLabel}
              </span>
              <span className="w-10 text-[11px] text-slate-500">{line.lineNumber}</span>
              <span className="flex-1 whitespace-pre-wrap">{line.text === "" ? " " : line.text}</span>
            </div>
          );
        })
      )}
    </div>
  </div>
);

export default Conflicts;
