import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Archive, Copy, GitBranch, GitCommit, GitMerge } from "lucide-react";
import * as d3 from "d3";
import { useRepoContext } from "../context/RepoContext";
import type { CommitGraphData, CommitLink, CommitNode } from "../types/git";
import InputModal from "./InputModal";
import ConfirmModal from "./ConfirmModal";

type ContextMenuState = {
  x: number;
  y: number;
  commit: CommitNode;
};

const ROW_HEIGHT = 40;
const LANE_WIDTH = 20;
const NODE_RADIUS = 5;
const MARGIN = { top: 20, right: 40, bottom: 20, left: 20 };

const CONTEXT_MENU_WIDTH = 220;
const CONTEXT_MENU_HEIGHT = 192;
const CONTEXT_MENU_MARGIN = 8;

const BUFFER_ROWS = 20;

const CommitGraph: React.FC = () => {
  const { graph, selectedCommit, selectCommit, createBranch, checkout, cherryPick, rebase, stashPop } = useRepoContext();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [visibleRange, setVisibleRange] = useState<{ start: number; end: number }>({ start: 0, end: 0 });
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [branchModalOpen, setBranchModalOpen] = useState(false);
  const [branchModalCommit, setBranchModalCommit] = useState<CommitNode | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  useEffect(() => {
    const handleGlobalClick = () => closeContextMenu();
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeContextMenu();
      }
    };

    window.addEventListener("click", handleGlobalClick);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("click", handleGlobalClick);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [closeContextMenu]);

  useEffect(() => {
    closeContextMenu();
  }, [graph, closeContextMenu]);

  const layout = useMemo(() => {
    if (!graph) {
      return { width: 800, height: 600, laneCount: 3 };
    }
    const laneCount = Math.max(1, ...graph.nodes.map((node) => node.lane)) + 1;
    const height = graph.nodes.length * ROW_HEIGHT + MARGIN.top + MARGIN.bottom;
    const width = laneCount * LANE_WIDTH + MARGIN.left + MARGIN.right;

    return { laneCount, height, width };
  }, [graph]);

  const handleCreateBranchFromCommit = useCallback(
    (commit: CommitNode) => {
      setBranchModalCommit(commit);
      setBranchModalOpen(true);
      closeContextMenu();
    },
    [closeContextMenu]
  );

  const handleBranchModalConfirm = useCallback(
    async (name: string, shouldCheckout: boolean = false) => {
      if (!branchModalCommit) return;
      setBranchModalOpen(false);
      setBranchModalCommit(null);
      await createBranch(name, branchModalCommit.hash);
      if (shouldCheckout) {
        await checkout(name);
      }
    },
    [branchModalCommit, createBranch, checkout]
  );

  const handleBranchModalCancel = useCallback(() => {
    setBranchModalOpen(false);
    setBranchModalCommit(null);
  }, []);

  const handleCherryPick = useCallback(
    (commit: CommitNode) => {
      setConfirmModal({
        isOpen: true,
        title: "Cherry-pick",
        message: `Cherry-pick du commit ${commit.hash.substring(0, 7)} sur la branche courante ?`,
        onConfirm: async () => {
          setConfirmModal(null);
          await cherryPick(commit.hash);
        },
      });
      closeContextMenu();
    },
    [cherryPick, closeContextMenu]
  );

  const handleRebase = useCallback(
    (commit: CommitNode) => {
      setConfirmModal({
        isOpen: true,
        title: "Rebase",
        message: `Rebaser la branche courante sur ${commit.hash.substring(0, 7)} ?`,
        onConfirm: async () => {
          setConfirmModal(null);
          await rebase(commit.hash);
        },
      });
      closeContextMenu();
    },
    [closeContextMenu, rebase]
  );

  const handleCopyHash = useCallback(
    async (commit: CommitNode) => {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(commit.hash);
        } else {
          const textArea = document.createElement("textarea");
          textArea.value = commit.hash;
          textArea.style.position = "fixed";
          textArea.style.opacity = "0";
          document.body.appendChild(textArea);
          textArea.focus();
          textArea.select();
          document.execCommand("copy");
          document.body.removeChild(textArea);
        }
      } finally {
        closeContextMenu();
      }
    },
    [closeContextMenu]
  );

  const handleApplyStash = useCallback(
    async () => {
      const shouldApply = window.confirm("Appliquer le stash ?");
      closeContextMenu();
      if (!shouldApply) {
        return;
      }
      await stashPop();
    },
    [closeContextMenu, stashPop]
  );

  const updateVisibleRange = useCallback(() => {
    const container = containerRef.current;
    if (!container || !graph) {
      return;
    }

    const { scrollTop, clientHeight } = container;
    const totalNodes = graph.nodes.length;
    const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER_ROWS);
    const end = Math.min(totalNodes, Math.ceil((scrollTop + clientHeight) / ROW_HEIGHT) + BUFFER_ROWS);

    setVisibleRange((prev) => {
      if (prev.start === start && prev.end === end) {
        return prev;
      }
      return { start, end };
    });
  }, [graph]);

  const containerCallbackRef = useCallback(
    (node: HTMLDivElement | null) => {
      containerRef.current = node;
      if (node) {
        requestAnimationFrame(() => {
          updateVisibleRange();
        });
      }
    },
    [updateVisibleRange]
  );

  useEffect(() => {
    if (!graph) {
      setVisibleRange({ start: 0, end: 0 });
      return;
    }

    const container = containerRef.current;
    if (!container) {
      return;
    }

    // Reset scroll position when changing repository / graph
    container.scrollTop = 0;
    const { clientHeight } = container;
    const initialEnd = Math.min(
      graph.nodes.length,
      Math.ceil(clientHeight / ROW_HEIGHT) + BUFFER_ROWS
    );
    setVisibleRange({ start: 0, end: initialEnd });
  }, [graph]);

  const handleScroll = useCallback(() => {
    closeContextMenu();
    updateVisibleRange();
  }, [closeContextMenu, updateVisibleRange]);

  useEffect(() => {
    if (!graph || !svgRef.current) {
      if (svgRef.current) {
        d3.select(svgRef.current).selectAll("*").remove();
      }
      return;
    }

    if (visibleRange.end <= visibleRange.start) {
      return;
    }

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    svg
      .attr("width", layout.width)
      .attr("height", layout.height)
      .style("minWidth", `${layout.width}px`)
      .style("minHeight", `${layout.height}px`);

    const g = svg.append("g").attr("transform", `translate(${MARGIN.left}, ${MARGIN.top})`);
    const nodeIndexMap = new Map<string, number>(graph.nodes.map((node, index) => [node.hash, index]));
    const nodesSubset = graph.nodes.slice(visibleRange.start, visibleRange.end);
    const linksSubset = graph.links.filter((link) => {
      const sourceIndex = nodeIndexMap.get(link.source);
      const targetIndex = nodeIndexMap.get(link.target);
      if (sourceIndex === undefined || targetIndex === undefined) {
        return false;
      }
      const minIndex = Math.min(sourceIndex, targetIndex);
      const maxIndex = Math.max(sourceIndex, targetIndex);
      return maxIndex >= visibleRange.start && minIndex <= visibleRange.end;
    });

    const linkGroup = g.append("g").attr("fill", "none").attr("stroke-linecap", "round");

    linkGroup
      .selectAll<SVGPathElement, CommitLink>("path")
      .data(linksSubset, (link: CommitLink) => `${link.source}-${link.target}`)
      .join("path")
      .attr("stroke", (link: CommitLink) => link.color)
      .attr("stroke-width", 1.5)
      .attr("opacity", 0.8)
      .attr("d", (link: CommitLink) => {
        const sourceIndex = nodeIndexMap.get(link.source);
        const targetIndex = nodeIndexMap.get(link.target);
        if (sourceIndex === undefined || targetIndex === undefined) {
          return "";
        }

        const sourceNode = graph.nodes[sourceIndex];
        const targetNode = graph.nodes[targetIndex];
        const x1 = sourceNode.lane * LANE_WIDTH;
        const y1 = sourceIndex * ROW_HEIGHT;
        const x2 = targetNode.lane * LANE_WIDTH;
        const y2 = targetIndex * ROW_HEIGHT;

        // Lignes droites verticales si même lane
        if (sourceNode.lane === targetNode.lane) {
          return `M${x1},${y1} L${x2},${y2}`;
        }

        // Courbes douces pour les changements de lane
        const midY = (y1 + y2) / 2;
        return `M${x1},${y1} C${x1},${midY} ${x2},${midY} ${x2},${y2}`;
      });

    const nodeGroup = g.append("g");

    const nodeEnter = nodeGroup
      .selectAll<SVGGElement, CommitNode>("g.commit-node")
      .data(nodesSubset, (node: CommitNode) => node.hash)
      .join("g")
      .attr("class", "commit-node")
      .attr("transform", (node: CommitNode) => {
        const actualIndex = nodeIndexMap.get(node.hash) ?? 0;
        const x = node.lane * LANE_WIDTH;
        const y = actualIndex * ROW_HEIGHT;
        return `translate(${x}, ${y})`;
      })
      .style("cursor", "pointer")
      .on("click", (_event: MouseEvent, node: CommitNode) => {
        closeContextMenu();
        void selectCommit(node.hash);
      })
      .on("contextmenu", (event: PointerEvent, node: CommitNode) => {
        event.preventDefault();
        event.stopPropagation();
        const container = containerRef.current;
        if (!container) {
          return;
        }
        const rect = container.getBoundingClientRect();
        let x = event.clientX - rect.left;
        let y = event.clientY - rect.top;

        const maxX = container.clientWidth - CONTEXT_MENU_WIDTH - CONTEXT_MENU_MARGIN;
        const maxY = container.clientHeight - CONTEXT_MENU_HEIGHT - CONTEXT_MENU_MARGIN;

        x = Math.max(CONTEXT_MENU_MARGIN, Math.min(x, maxX));
        y = Math.max(CONTEXT_MENU_MARGIN, Math.min(y, maxY));

        setContextMenu({ x, y, commit: node });
        void selectCommit(node.hash);
      });

    nodeEnter
      .append("circle")
      .attr("r", NODE_RADIUS)
      .attr("cx", 0)
      .attr("cy", 0)
      .attr("fill", (node: CommitNode) => node.color)
      .attr("stroke", (node: CommitNode) => (node.hash === selectedCommit ? "#ffffff" : "#0f172a"))
      .attr("stroke-width", (node: CommitNode) => (node.hash === selectedCommit ? 2 : 1.5))
      .attr("opacity", 0)
      .transition()
      .duration(200)
      .ease(d3.easeCubic)
      .attr("opacity", 1);

    // Halo de sélection
    nodeEnter
      .append("circle")
      .attr("r", NODE_RADIUS + 3)
      .attr("cx", 0)
      .attr("cy", 0)
      .attr("fill", "transparent")
      .attr("stroke", (node: CommitNode) => (node.hash === selectedCommit ? node.color : "transparent"))
      .attr("stroke-width", 1)
      .attr("opacity", (node: CommitNode) => (node.hash === selectedCommit ? 0.3 : 0));

    const textGroup = nodeEnter.append("g").attr("transform", `translate(${NODE_RADIUS + 12}, 0)`);

    textGroup
      .filter((node: CommitNode) => node.branches.length > 0)
      .append("text")
      .attr("class", "commit-branches")
      .attr("fill", "#94a3b8")
      .attr("font-size", 11)
      .attr("font-weight", 500)
      .attr("y", -12)
      .attr("dominant-baseline", "baseline")
      .text((node: CommitNode) => node.branches.join(", "));

    const messageText = textGroup
      .append("text")
      .attr("class", "commit-message")
      .attr("fill", "#e2e8f0")
      .attr("font-size", 13)
      .attr("font-weight", (node: CommitNode) => (node.hash === selectedCommit ? 600 : 400))
      .attr("y", (node: CommitNode) => (node.branches.length > 0 ? 4 : 0))
      .attr("dominant-baseline", (node: CommitNode) => (node.branches.length > 0 ? "hanging" : "middle"))
      .text((node: CommitNode) => node.message);

    messageText
      .append("title")
      .text((node: CommitNode) => `${node.hash}\n${node.author}\n${new Date(node.date).toLocaleString("fr-FR")}`);
  }, [closeContextMenu, graph, layout.height, layout.width, selectCommit, selectedCommit, visibleRange]);

  if (!graph) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-slate-900 text-slate-500">
        <p>Ouvrez un dépôt pour visualiser l'historique des commits.</p>
      </div>
    );
  }

  return (
    <div
      ref={containerCallbackRef}
      className="relative flex-1 overflow-auto bg-slate-900"
      onScroll={handleScroll}
      onContextMenu={(event) => {
        if (!event.defaultPrevented) {
          closeContextMenu();
        }
      }}
      style={{ width: '100%', height: '100%' }}
    >
      <svg 
        ref={svgRef} 
        role="img" 
        aria-label="Graphe des commits"
        style={{ display: 'block' }}
      />
      {contextMenu && (
        <div
          role="menu"
          className="absolute z-20 w-56 rounded-xl border border-slate-700 bg-slate-800/95 p-2 text-sm text-slate-100 shadow-xl backdrop-blur"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <div className="mb-2 rounded-lg bg-slate-800/80 px-3 py-2">
            <p className="text-xs uppercase tracking-wide text-slate-400">Commit</p>
            <p className="truncate text-sm font-medium text-slate-100">{contextMenu.commit.message}</p>
            <p className="text-xs text-slate-500">{contextMenu.commit.hash.substring(0, 12)}</p>
          </div>
          <div className="flex flex-col gap-1">
            <button
              type="button"
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-left transition hover:bg-slate-700/60 focus:outline-none focus:ring-2 focus:ring-cyan-500/60"
              onClick={(event) => {
                event.stopPropagation();
                void handleCreateBranchFromCommit(contextMenu.commit);
              }}
            >
              <GitBranch className="h-4 w-4 text-slate-300" />
              <span>Créer une branche depuis ce commit…</span>
            </button>
            <button
              type="button"
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-left transition hover:bg-slate-700/60 focus:outline-none focus:ring-2 focus:ring-cyan-500/60"
              onClick={(event) => {
                event.stopPropagation();
                void handleCherryPick(contextMenu.commit);
              }}
            >
              <GitCommit className="h-4 w-4 text-slate-300" />
              <span>Cherry-pick sur la branche courante</span>
            </button>
            <button
              type="button"
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-left transition hover:bg-slate-700/60 focus:outline-none focus:ring-2 focus:ring-cyan-500/60"
              onClick={(event) => {
                event.stopPropagation();
                void handleRebase(contextMenu.commit);
              }}
            >
              <GitMerge className="h-4 w-4 text-slate-300" />
              <span>Rebaser la branche courante ici</span>
            </button>
            <button
              type="button"
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-left transition hover:bg-slate-700/60 focus:outline-none focus:ring-2 focus:ring-cyan-500/60"
              onClick={(event) => {
                event.stopPropagation();
                void handleCopyHash(contextMenu.commit);
              }}
            >
              <Copy className="h-4 w-4 text-slate-300" />
              <span>Copier le hash</span>
            </button>
            <button
              type="button"
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-left transition hover:bg-slate-700/60 focus:outline-none focus:ring-2 focus:ring-cyan-500/60"
              onClick={(event) => {
                event.stopPropagation();
                void handleApplyStash();
              }}
            >
              <Archive className="h-4 w-4 text-slate-300" />
              <span>Apply Stash</span>
            </button>
          </div>
        </div>
      )}
      <InputModal
        isOpen={branchModalOpen}
        title="Créer une branche"
        placeholder="Nom de la nouvelle branche"
        defaultValue={branchModalCommit ? `branch-${branchModalCommit.hash.substring(0, 7)}` : ""}
        checkboxLabel="Basculer sur la nouvelle branche"
        onConfirm={handleBranchModalConfirm}
        onCancel={handleBranchModalCancel}
      />
      <ConfirmModal
        isOpen={confirmModal?.isOpen ?? false}
        title={confirmModal?.title ?? ""}
        message={confirmModal?.message ?? ""}
        onConfirm={confirmModal?.onConfirm ?? (() => {})}
        onCancel={() => setConfirmModal(null)}
      />
    </div>
  );
};

export default CommitGraph;
