import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Minus } from "lucide-react";
import { useRepoContext, type DiffScope } from "../context/RepoContext";

type DiffLineType = "add" | "remove" | "context" | "meta";

type DiffLine = {
  type: DiffLineType;
  sign: string;
  content: string;
  raw: string;
};

type DiffHunk = {
  header: string;
  headerRaw: string;
  lines: DiffLine[];
};

type ParsedDiff = {
  prologue: DiffLine[];
  hunks: DiffHunk[];
};

const PROLOGUE_PREFIXES = [
  "diff --git",
  "index ",
  "---",
  "+++",
  "rename ",
  "similarity ",
  "new file mode",
  "deleted file mode",
  "old mode",
  "new mode",
  "Binary files"
];

function classifyLine(rawLine: string, context: "prologue" | "hunk"): DiffLine {
  if (rawLine === "") {
    return { type: "context", sign: " ", content: "", raw: "" };
  }

  if (rawLine.startsWith("\\")) {
    return { type: "meta", sign: " ", content: rawLine, raw: rawLine };
  }

  if (context === "prologue") {
    const trimmed = rawLine.trimStart();
    const isPrologueMeta = PROLOGUE_PREFIXES.some((prefix) =>
      trimmed.startsWith(prefix)
    );
    if (isPrologueMeta) {
      return { type: "meta", sign: " ", content: rawLine, raw: rawLine };
    }
  }

  const indicator = rawLine[0];
  switch (indicator) {
    case "+":
      return { type: "add", sign: "+", content: rawLine.slice(1), raw: rawLine };
    case "-":
      return { type: "remove", sign: "-", content: rawLine.slice(1), raw: rawLine };
    case " ":
      return { type: "context", sign: " ", content: rawLine.slice(1), raw: rawLine };
    default:
      if (context === "prologue") {
        return { type: "meta", sign: " ", content: rawLine, raw: rawLine };
      }
      return { type: "meta", sign: " ", content: rawLine, raw: rawLine };
  }
}

function parseDiff(diff: string): ParsedDiff {
  const normalized = diff.replace(/\r\n/g, "\n");
  const rawLines = normalized.split("\n");
  const prologue: DiffLine[] = [];
  const hunks: DiffHunk[] = [];
  let currentHunk: DiffHunk | null = null;

  rawLines.forEach((rawLine) => {
    if (rawLine.startsWith("@@")) {
      const headerRaw = rawLine;
      const header = rawLine.split(" @@")[0] + " @@";
      currentHunk = { header, headerRaw, lines: [] };
      hunks.push(currentHunk);
      return;
    }

    if (!currentHunk) {
      const line = classifyLine(rawLine, "prologue");
      if (line.content !== "" || line.type !== "context") {
        prologue.push(line);
      }
      return;
    }

    const line = classifyLine(rawLine, "hunk");
    currentHunk.lines.push(line);
  });

  return { prologue, hunks };
}

const lineTypeClasses: Record<DiffLineType, string> = {
  add: "border-l-2 border-emerald-500/60 bg-emerald-500/10 text-emerald-100",
  remove: "border-l-2 border-rose-500/60 bg-rose-500/10 text-rose-100",
  context: "border-l-2 border-transparent text-slate-200",
  meta: "border-l-2 border-slate-700 bg-slate-900/70 text-slate-400"
};

const signClasses: Record<DiffLineType, string> = {
  add: "text-emerald-300",
  remove: "text-rose-300",
  context: "text-slate-600",
  meta: "text-slate-500"
};

const scopeBadgeClasses: Record<DiffScope, string> = {
  commit: "hidden",
  working: "border-amber-500/40 bg-amber-500/10 text-amber-200",
  staged: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
};

const DiffLineRow: React.FC<{ line: DiffLine }> = ({ line }) => {
  const content = line.content === "" ? "\u00a0" : line.content;
  return (
    <div
      className={`flex gap-3 whitespace-pre-wrap px-4 py-1.5 font-mono text-[13px] leading-relaxed ${
        lineTypeClasses[line.type]
      }`}
    >
      <span className={`select-none text-xs font-semibold ${signClasses[line.type]}`}>
        {line.sign}
      </span>
      <span className="flex-1">{content}</span>
    </div>
  );
};

type DiffViewerProps = {
  diff: string;
  filePath?: string;
  isWorkingDirectory?: boolean;
  scope?: DiffScope;
  onHunkAction?: () => void;
};

const DiffViewer: React.FC<DiffViewerProps> = ({
  diff,
  filePath,
  isWorkingDirectory = false,
  scope = "commit",
  onHunkAction
}) => {
  const { stageHunk, discardHunk, unstageHunk } = useRepoContext();
  const { t } = useTranslation();
  const scopeLabels = useMemo(
    () => ({
      commit: t("diffViewer.scope.commit"),
      working: t("diffViewer.scope.working"),
      staged: t("diffViewer.scope.staged")
    }),
    [t]
  );

  const getHunkPatch = (prologue: DiffLine[], hunk: DiffHunk): string => {
    const prologueLines = prologue.map((line) => line.raw).filter((line) => line !== "");
    const hunkLines = hunk.lines.map((line) => line.raw);
    const patchLines = [...prologueLines, hunk.headerRaw, ...hunkLines];
    return patchLines.join("\n") + "\n";
  };
  const parsed = useMemo(() => parseDiff(diff), [diff]);
  const { prologue, hunks } = parsed;

  return (
    <div className="space-y-6">
      {prologue.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70">
          <div className="border-b border-slate-800 bg-slate-900/80 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            {t("diffViewer.metadata")}
          </div>
          <div className="divide-y divide-slate-800">
            {prologue.map((line, index) => (
              <DiffLineRow key={`prologue-${index}`} line={line} />
            ))}
          </div>
        </div>
      )}

      {hunks.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-6 text-xs text-slate-500">
          {t("diffViewer.noDiff")}
        </div>
      ) : (
        hunks.map((hunk, hunkIndex) => (
          <div
            key={`${hunk.header}-${hunkIndex}`}
            className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70"
          >
            <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/90 px-4 py-2">
              <div className="font-mono text-[12px] text-cyan-200">
                {hunk.header}
              </div>
              {isWorkingDirectory && filePath && scope !== "commit" && (
                <div className="flex items-center gap-2">
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${scopeBadgeClasses[scope]}`}>
                    {scopeLabels[scope]}
                  </span>
                  {scope === "working" && (
                    <>
                      <button
                        type="button"
                        onClick={async () => {
                          await stageHunk(filePath, getHunkPatch(prologue, hunk));
                          onHunkAction?.();
                        }}
                        className="flex items-center gap-1 rounded border border-emerald-600/40 bg-emerald-600/10 px-2 py-1 text-[10px] text-emerald-200 transition hover:bg-emerald-600/20"
                      >
                        <Plus className="h-3 w-3" />
                        {t("common.stage")}
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await discardHunk(filePath, getHunkPatch(prologue, hunk));
                          onHunkAction?.();
                        }}
                        className="flex items-center gap-1 rounded border border-rose-600/40 bg-rose-600/10 px-2 py-1 text-[10px] text-rose-200 transition hover:bg-rose-600/20"
                      >
                        <Minus className="h-3 w-3" />
                        {t("common.discard")}
                      </button>
                    </>
                  )}
                  {scope === "staged" && (
                    <button
                      type="button"
                      onClick={async () => {
                        await unstageHunk(filePath, getHunkPatch(prologue, hunk));
                        onHunkAction?.();
                      }}
                      className="flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-200 transition hover:bg-amber-500/20"
                    >
                      <Minus className="h-3 w-3" />
                      {t("common.unstage")}
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="divide-y divide-slate-800">
              {hunk.lines.map((line, lineIndex) => (
                <DiffLineRow
                  key={`${hunkIndex}-${lineIndex}-${line.sign}-${line.content}`}
                  line={line}
                />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
};

export default DiffViewer;
