import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Archive, Copy, GitBranch, GitCommit, GitMerge, Scissors, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import * as d3 from "d3";
import { useRepoContext } from "../context/RepoContext";
import type { CommitLink, CommitNode } from "../types/git";
import InputModal from "./InputModal";
import ConfirmModal from "./ConfirmModal";
import {
  buildRangeSelection as buildSelectionRange,
  computeSelectionMeta,
  createNodeIndexMap,
  findBaseNode,
  getSelectionIssue,
  sortSelection
} from "./commitGraph/selection";

type ContextMenuState = {
  x: number;
  y: number;
  commit: CommitNode;
};

const ROW_HEIGHT = 36;
const LANE_WIDTH = 18;
const NODE_RADIUS = 6;
const BRANCH_COLUMN_WIDTH = 200;
const MESSAGE_COLUMN_GAP = 20; // Reduced gap since we have a column now
const MESSAGE_COLUMN_WIDTH = 260; // Min width
const MARGIN = { top: 20, right: 20, bottom: 20, left: 20 };

const BRANCH_PALETTE = [
  { base: "#4a9eff", border: "#2d7dd2", glow: "rgba(74,158,255,0.6)" },
  { base: "#b968d9", border: "#8e4db3", glow: "rgba(185,104,217,0.6)" },
  { base: "#d968b9", border: "#b34d8e", glow: "rgba(217,104,185,0.6)" },
  { base: "#68d9d9", border: "#4db3b3", glow: "rgba(104,217,217,0.6)" },
  { base: "#ff6b6b", border: "#d24d4d", glow: "rgba(255,107,107,0.6)" },
  { base: "#ffb347", border: "#d98a2d", glow: "rgba(255,179,71,0.6)" },
  { base: "#ffd93d", border: "#d9b32d", glow: "rgba(255,217,61,0.6)" },
  { base: "#6bcf7f", border: "#4db35e", glow: "rgba(107,207,127,0.6)" }
];

const toRgba = (color: string, alpha: number) => {
  const parsed = d3.color(color);
  if (!parsed) {
    return color;
  }
  const rgb = d3.rgb(parsed);
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
};

const brighten = (color: string, amount: number) => d3.rgb(color).brighter(amount).formatHex();
const darken = (color: string, amount: number) => d3.rgb(color).darker(amount).formatHex();

const CONTEXT_MENU_WIDTH = 220;
const CONTEXT_MENU_HEIGHT = 192;
const CONTEXT_MENU_MARGIN = 8;

const BUFFER_ROWS = 20;

const CommitGraph: React.FC = () => {
  const { t } = useTranslation();
  const {
    graph,
    loading,
    selectedCommit,
    selectedCommits,
    setSelectedCommits,
    selectCommit,
    createBranch,
    checkout,
    cherryPick,
    rebase,
    squashCommits,
    dropCommits,
    stashPop,
    branches,
    generateBranchNameSuggestions
  } = useRepoContext();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [visibleRange, setVisibleRange] = useState<{ start: number; end: number }>({ start: 0, end: 0 });
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [ignoreNextClick, setIgnoreNextClick] = useState(false);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const [branchModalOpen, setBranchModalOpen] = useState(false);
  const [branchModalCommit, setBranchModalCommit] = useState<CommitNode | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);
  const [selectionAnchor, setSelectionAnchor] = useState<string | null>(null);
  const clickTimerRef = useRef<number | null>(null);
  const lastClickedNodeRef = useRef<CommitNode | null>(null);
  const [squashModalOpen, setSquashModalOpen] = useState(false);

  useEffect(() => {
    return () => {
      if (clickTimerRef.current !== null) {
        window.clearTimeout(clickTimerRef.current);
      }
    };
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
    setIgnoreNextClick(false);
  }, []);

  useEffect(() => {
    const handleGlobalClick = (event: MouseEvent) => {
      if (ignoreNextClick) {
        setIgnoreNextClick(false);
        return;
      }
      if (contextMenuRef.current && contextMenuRef.current.contains(event.target as Node)) {
        return;
      }
      closeContextMenu();
    };
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
  }, [closeContextMenu, ignoreNextClick]);

  useEffect(() => {
    // Ne fermer le context menu que si on n'a pas de modale ouverte
    if (!branchModalOpen && !squashModalOpen && !(confirmModal?.isOpen)) {
      setContextMenu(null);
    }
  }, [graph, branchModalOpen, squashModalOpen, confirmModal]);

  const layout = useMemo(() => {
    if (!graph) {
      return { width: 800, height: 600, laneCount: 3 };
    }
    const laneCount = Math.max(1, ...graph.nodes.map((node) => node.lane)) + 1;
    const height = graph.nodes.length * ROW_HEIGHT + MARGIN.top + MARGIN.bottom;
    const width = BRANCH_COLUMN_WIDTH + laneCount * LANE_WIDTH + MARGIN.left + MARGIN.right + MESSAGE_COLUMN_GAP + MESSAGE_COLUMN_WIDTH;

    return { laneCount, height, width };
  }, [graph]);

  const nodeIndexMap = useMemo(() => createNodeIndexMap(graph), [graph]);

  const laneExtents = useMemo(() => {
    if (!graph) return new Map<number, { min: number; max: number }>();
    const extents = new Map<number, { min: number; max: number }>();
    graph.nodes.forEach((node, index) => {
      const current = extents.get(node.lane);
      if (!current) {
        extents.set(node.lane, { min: index, max: index });
      } else {
        current.min = Math.min(current.min, index);
        current.max = Math.max(current.max, index);
      }
    });
    return extents;
  }, [graph]);

  const sortWithIndex = useCallback(
    (hashes: string[]) => sortSelection(hashes, nodeIndexMap),
    [nodeIndexMap]
  );

  const buildRangeSelection = useCallback(
    (fromHash: string, toHash: string) => buildSelectionRange(graph, nodeIndexMap, fromHash, toHash),
    [graph, nodeIndexMap]
  );

  useEffect(() => {
    if (selectedCommits.length === 0) {
      setSelectionAnchor(null);
      return;
    }
    setSelectionAnchor((prev) => prev ?? selectedCommits[0]);
  }, [selectedCommits]);

  const sanitizedSelection = useMemo(
    () => sortWithIndex(selectedCommits.filter((hash) => hash !== "working-directory")),
    [selectedCommits, sortWithIndex]
  );

  const primarySelectedCommit = useMemo(() => {
    if (selectedCommit && selectedCommits.includes(selectedCommit)) {
      return selectedCommit;
    }
    return selectedCommits[0] ?? null;
  }, [selectedCommit, selectedCommits]);

  const selectedNodes = useMemo(() => {
    if (!graph) {
      return [] as CommitNode[];
    }
    return sanitizedSelection
      .map((hash) => {
        const index = nodeIndexMap.get(hash);
        return index !== undefined ? graph.nodes[index] : null;
      })
      .filter((node): node is CommitNode => Boolean(node));
  }, [graph, nodeIndexMap, sanitizedSelection]);

  const headCommitHash = useMemo(() => {
    if (!graph) {
      return null;
    }
    return graph.head ?? null;
  }, [graph]);

  const currentBranch = useMemo(() => {
    return branches.find(branch => branch.current);
  }, [branches]);

  const resolveCheckoutBranch = useCallback(
    (node: CommitNode): string | null => {
      if (node.hash === "working-directory" || node.branches.length === 0) {
        return null;
      }

      const matchingInfos = branches.filter((branch) => node.branches.includes(branch.name));

      const localNonCurrent = matchingInfos.find((branch) => branch.type === "local" && !branch.current);
      if (localNonCurrent) {
        return localNonCurrent.name;
      }

      const localBranch = matchingInfos.find((branch) => branch.type === "local");
      if (localBranch) {
        return localBranch.name;
      }

      const remoteBranch = matchingInfos.find((branch) => branch.type === "remote");
      if (remoteBranch) {
        return remoteBranch.name;
      }

      const fallback = node.branches.find((branchName) => branchName !== currentBranch?.name);
      return fallback ?? node.branches[0] ?? null;
    },
    [branches, currentBranch]
  );

  const selectionMeta = useMemo(
    () =>
      computeSelectionMeta({
        graph,
        sanitizedSelection,
        headCommitHash,
        nodeIndexMap
      }),
    [graph, sanitizedSelection, headCommitHash, nodeIndexMap]
  );

  const actionableSelection = selectionMeta.sanitizedSelection;
  const selectionBaseHash = selectionMeta.baseHash;

  const baseNode = useMemo(
    () => findBaseNode(graph, nodeIndexMap, selectionMeta.baseHash),
    [graph, nodeIndexMap, selectionMeta.baseHash]
  );

  const hasWorkingDirectorySelected = selectedCommits.includes("working-directory");

  const canSquash =
    selectionMeta.includesHead &&
    selectionMeta.isContiguous &&
    Boolean(selectionBaseHash) &&
    actionableSelection.length >= 2;

  const canDrop =
    selectionMeta.includesHead &&
    selectionMeta.isContiguous &&
    Boolean(selectionBaseHash) &&
    actionableSelection.length >= 1;

  const isMultiSelectActive = useMemo(() => {
    if (sanitizedSelection.length === 0) {
      return false;
    }
    if (!primarySelectedCommit) {
      return sanitizedSelection.length > 1;
    }
    return sanitizedSelection.some((hash) => hash !== primarySelectedCommit);
  }, [primarySelectedCommit, sanitizedSelection]);

  const selectionIssue = useMemo(
    () => getSelectionIssue(selectionMeta, hasWorkingDirectorySelected),
    [selectionMeta, hasWorkingDirectorySelected]
  );

  const squashDefaultMessage = useMemo(() => {
    if (selectedNodes.length === 0) {
      return "";
    }

    if (selectedNodes.length === 1) {
      return selectedNodes[0].message;
    }

    return selectedNodes.map((node) => node.message).join(" / ");
  }, [selectedNodes]);

  const openSquashModal = useCallback(() => {
    setSquashModalOpen(true);
  }, []);

  const closeSquashModal = useCallback(() => {
    setSquashModalOpen(false);
  }, []);

  const handleSquashModalConfirm = useCallback(
    async (message: string) => {
      const trimmed = message.trim();
      const hashes = [...actionableSelection];
      const baseHash = selectionBaseHash;

      setSquashModalOpen(false);

      if (!trimmed || hashes.length < 2 || !baseHash) {
        return;
      }

      setSelectedCommits([baseHash]);
      setSelectionAnchor(baseHash);
      await selectCommit(baseHash);
      await squashCommits(hashes, trimmed);
    },
    [actionableSelection, selectCommit, selectionBaseHash, setSelectedCommits, setSelectionAnchor, squashCommits]
  );

  const handleDropAction = useCallback(() => {
    const hashes = [...actionableSelection];
    const baseHash = selectionBaseHash;

    if (!hashes.length || !baseHash) {
      return;
    }

    const baseLabel = baseHash.substring(0, 7);
    setConfirmModal({
      isOpen: true,
      title:
        hashes.length > 1
          ? `Supprimer ${hashes.length} commits`
          : "Supprimer le commit sélectionné",
      message: `HEAD sera repositionné sur ${baseLabel}. Cette opération est destructive.
Assurez-vous d'avoir une sauvegarde avant de continuer.`,
      onConfirm: async () => {
        setConfirmModal(null);
        setSelectedCommits([baseHash]);
        setSelectionAnchor(baseHash);
        await selectCommit(baseHash);
        await dropCommits(hashes);
      }
    });
  }, [actionableSelection, dropCommits, selectCommit, selectionBaseHash, setConfirmModal, setSelectedCommits, setSelectionAnchor]);

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
    () => {
      closeContextMenu();
      setConfirmModal({
        isOpen: true,
        title: t("confirmations.applyStash.title"),
        message: t("confirmations.applyStash.message"),
        onConfirm: async () => {
          setConfirmModal(null);
          await stashPop();
        }
      });
    },
    [closeContextMenu, stashPop, t]
  );

  // Virtualize the SVG by computing which rows are visible inside the scroll container.
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

  // Re-render the graph slice with d3 whenever the data or virtualization window changes.
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
    
    const container = containerRef.current;
    const containerWidth = container ? container.clientWidth : layout.width;
    const laneWidth = LANE_WIDTH;
    const laneX = (lane: number) => BRANCH_COLUMN_WIDTH + lane * laneWidth + laneWidth / 2;
    const messageColumnX = BRANCH_COLUMN_WIDTH + layout.laneCount * LANE_WIDTH + MESSAGE_COLUMN_GAP;
    
    svg
      .attr("width", "100%")
      .attr("height", layout.height)
      .style("minWidth", `${Math.max(containerWidth, layout.width)}px`)
      .style("minHeight", `${layout.height}px`);

    const g = svg.append("g").attr("transform", `translate(${MARGIN.left}, ${MARGIN.top})`);
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

    const defs = svg.append("defs");
    const paletteColors = BRANCH_PALETTE.map((entry) => entry.base);
    const uniqueColors = new Set<string>([
      ...paletteColors,
      ...nodesSubset.map((node) => node.color),
      ...linksSubset.map((link) => link.color)
    ]);

    const colorIdMap = new Map<string, string>();
    const getColorId = (color: string) => {
      const cached = colorIdMap.get(color);
      if (cached) return cached;
      const normalized = color.replace(/[^a-zA-Z0-9]/g, "");
      const id = `c${normalized}`;
      colorIdMap.set(color, id);
      return id;
    };

    uniqueColors.forEach((color) => {
      const colorId = getColorId(color);
      const light = brighten(color, 0.9);
      const mid = brighten(color, 0.2);
      const dark = darken(color, 0.9);

      const radial = defs
        .append("radialGradient")
        .attr("id", `node-gradient-${colorId}`)
        .attr("cx", "30%")
        .attr("cy", "30%")
        .attr("r", "70%");

      radial.append("stop").attr("offset", "0%").attr("stop-color", light);
      radial.append("stop").attr("offset", "65%").attr("stop-color", mid);
      radial.append("stop").attr("offset", "100%").attr("stop-color", dark);

      const linear = defs
        .append("linearGradient")
        .attr("id", `line-gradient-${colorId}`)
        .attr("x1", "0%")
        .attr("y1", "0%")
        .attr("x2", "0%")
        .attr("y2", "100%");

      linear.append("stop").attr("offset", "0%").attr("stop-color", brighten(color, 0.5));
      linear.append("stop").attr("offset", "100%").attr("stop-color", color);
    });

    const getLineGradient = (color: string) => `url(#line-gradient-${getColorId(color)})`;
    const getNodeGradient = (color: string) => `url(#node-gradient-${getColorId(color)})`;
    const getGlow = (color: string, alpha: number) => toRgba(color, alpha);

    const laneLineGroup = g.append("g").attr("fill", "none");

    laneLineGroup
      .selectAll("line")
      .data(d3.range(layout.laneCount))
      .join("line")
      .attr("x1", (lane) => laneX(lane))
      .attr("x2", (lane) => laneX(lane))
      .attr("y1", (lane) => {
        const extent = laneExtents.get(lane);
        const startIdx = extent ? extent.min : 0;
        return Math.max(visibleRange.start, startIdx) * ROW_HEIGHT;
      })
      .attr("y2", (lane) => {
        const extent = laneExtents.get(lane);
        const endIdx = extent ? extent.max : 0;
        // Extend slightly to cover the node center if connected
        return Math.min(visibleRange.end, endIdx) * ROW_HEIGHT;
      })
      .attr("stroke", (lane) => BRANCH_PALETTE[lane % BRANCH_PALETTE.length].base)
      .attr("stroke-width", 2)
      .attr("opacity", (lane) => {
        const extent = laneExtents.get(lane);
        if (!extent) return 0;
        const start = Math.max(visibleRange.start, extent.min);
        const end = Math.min(visibleRange.end, extent.max);
        // Only show if the line helps connect at least two nodes or spans a gap
        return start < end ? 0.7 : 0;
      })
      .attr("stroke-linecap", "round")
      .attr("stroke-linejoin", "round")
      .style(
        "filter",
        (lane) => `drop-shadow(0 0 6px ${BRANCH_PALETTE[lane % BRANCH_PALETTE.length].glow})`
      );

    const linkGroup = g.append("g").attr("fill", "none").attr("stroke-linecap", "round");

    linkGroup
      .selectAll<SVGPathElement, CommitLink>("path")
      .data(linksSubset, (link: CommitLink) => `${link.source}-${link.target}`)
      .join("path")
      .attr("stroke", (link: CommitLink) => getLineGradient(link.color))
      .attr("stroke-width", 2)
      .attr("opacity", 0.9)
      .attr("stroke-linejoin", "round")
      .style("filter", (link: CommitLink) => `drop-shadow(0 0 4px ${getGlow(link.color, 0.4)})`)
      .attr("d", (link: CommitLink) => {
        const sourceIndex = nodeIndexMap.get(link.source);
        const targetIndex = nodeIndexMap.get(link.target);
        if (sourceIndex === undefined || targetIndex === undefined) {
          return "";
        }

        const sourceNode = graph.nodes[sourceIndex];
        const targetNode = graph.nodes[targetIndex];
        const x1 = laneX(sourceNode.lane);
        const y1 = sourceIndex * ROW_HEIGHT;
        const x2 = laneX(targetNode.lane);
        const y2 = targetIndex * ROW_HEIGHT;

        const dx = x2 - x1;
        const dy = y2 - y1;
        const dirX = Math.sign(dx) || 1;
        const dirY = Math.sign(dy) || 1;

        if (x1 === x2) {
          // Same lane: straight vertical line, tangent to commit circles
          const startY = y1 + dirY * NODE_RADIUS;
          const endY = y2 - dirY * NODE_RADIUS;
          return `M${x1},${startY} L${x2},${endY}`;
        }

        // Different lane: Metro-style orthogonal path
        const startX = x1 + dirX * NODE_RADIUS;
        const startY = y1;
        const endX = x2;
        const endY = y2 - dirY * NODE_RADIUS;

        // Radius for the 90-degree turn
        const safeDistX = Math.abs(endX - startX);
        const safeDistY = Math.abs(endY - startY);
        // We use a fixed radius (12px) but cap it if nodes are too close
        const r = Math.min(12, safeDistX, safeDistY);

        // Turn point
        const cornerX = endX - dirX * r; 
        const turnStartY = startY + dirY * r;

        // M start -> L corner -> Q (control) target_turn -> L target
        return `M${startX},${startY} L${cornerX},${startY} Q${endX},${startY} ${endX},${turnStartY} L${endX},${endY}`;
      })
      .attr("stroke-dasharray", function () {
        const length = (this as SVGPathElement).getTotalLength();
        return `${length} ${length}`;
      })
      .attr("stroke-dashoffset", function () {
        return (this as SVGPathElement).getTotalLength();
      })
      .transition()
      .duration(500)
      .ease(d3.easeCubic)
      .attr("stroke-dashoffset", 0);

    const nodeTransform = (node: CommitNode, scale = 1) => {
      const actualIndex = nodeIndexMap.get(node.hash) ?? 0;
      const x = laneX(node.lane);
      const y = actualIndex * ROW_HEIGHT;
      return `translate(${x}, ${y}) scale(${scale})`;
    };

    const nodeGroup = g.append("g");

    const nodeEnter = nodeGroup
      .selectAll<SVGGElement, CommitNode>("g.commit-node")
      .data(nodesSubset, (node: CommitNode) => node.hash)
      .join("g")
      .attr("class", "commit-node")
      .attr("transform", (node: CommitNode) => nodeTransform(node, 0.8))
      .attr("opacity", 0)
      .style("transition", "transform 0.2s ease, filter 0.2s ease")
      .style("cursor", "pointer")
      .on("mouseenter", function (_event: MouseEvent, node: CommitNode) {
        d3.select(this)
          .raise()
          .transition()
          .duration(200)
          .ease(d3.easeCubic)
          .attr("transform", nodeTransform(node, 1.3));
        d3.select(this)
          .select(".node-outer")
          .style("filter", `drop-shadow(0 0 12px ${getGlow(node.color, 0.7)}) drop-shadow(0 0 4px ${getGlow(node.color, 0.4)})`);
      })
      .on("mouseleave", function (_event: MouseEvent, node: CommitNode) {
        d3.select(this)
          .transition()
          .duration(200)
          .ease(d3.easeCubic)
          .attr("transform", nodeTransform(node, 1));
        d3.select(this)
          .select(".node-outer")
          .style("filter", `drop-shadow(0 0 8px ${getGlow(node.color, 0.6)}) drop-shadow(0 0 2px rgba(0,0,0,0.6))`);
      })
      .on("click", (event: MouseEvent, node: CommitNode) => {
        event.stopPropagation();
        closeContextMenu();

        const hash = node.hash;
        const timer = clickTimerRef.current;

        // Manage double-click manually so we can keep fine-grained control on modifier keys.
        if (lastClickedNodeRef.current?.hash === hash && timer !== null) {
          window.clearTimeout(timer);
          clickTimerRef.current = null;
          lastClickedNodeRef.current = null;

          const targetBranch = resolveCheckoutBranch(node);
          if (targetBranch && targetBranch !== currentBranch?.name) {
            void checkout(targetBranch);
          }
          return;
        }

        // Set up single-click timer
        lastClickedNodeRef.current = node;
        const timeoutId = window.setTimeout(() => {
          clickTimerRef.current = null;
          lastClickedNodeRef.current = null;

          // Handle single-click logic
          const isShift = event.shiftKey;
          const isModKey = event.metaKey || event.ctrlKey;

          if (hash === "working-directory") {
            setSelectedCommits([hash]);
            setSelectionAnchor(hash);
            void selectCommit(hash);
            return;
          }

          if (isShift) {
            const anchor = selectionAnchor ?? selectedCommits[0] ?? hash;
            const range = buildRangeSelection(anchor, hash);
            const nextSelection = range.length > 0 ? range : sortWithIndex([hash]);
            setSelectedCommits(nextSelection);
            setSelectionAnchor(anchor);
            void selectCommit(hash, { preserveMultiSelection: true });
            return;
          }

          if (isModKey) {
            const isAlreadySelected = selectedCommits.includes(hash);
            if (isAlreadySelected) {
              const nextSelection = selectedCommits.filter((selectedHash) => selectedHash !== hash);
              setSelectedCommits(nextSelection);
              if (nextSelection.length > 0) {
                const nextFocus = nextSelection[0];
                setSelectionAnchor(nextFocus);
                void selectCommit(nextFocus, { preserveMultiSelection: true });
              } else {
                setSelectionAnchor(null);
                void selectCommit(null);
              }
            } else {
              const nextSelection = sortWithIndex([...selectedCommits, hash]);
              setSelectedCommits(nextSelection);
              setSelectionAnchor(hash);
              void selectCommit(hash, { preserveMultiSelection: true });
            }
            return;
          }

          const nextSelection = sortWithIndex([hash]);
          setSelectedCommits(nextSelection);
          setSelectionAnchor(hash);
          void selectCommit(hash);
        }, 300);

        clickTimerRef.current = timeoutId;
      })
      .on("contextmenu", (event: PointerEvent, node: CommitNode) => {
        if (event.button !== 2) return;
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

        setIgnoreNextClick(true);
        setContextMenu({ x, y, commit: node });
        const shouldPreserve = selectedCommits.includes(node.hash) && selectedCommits.length > 1;
        if (!shouldPreserve) {
          setSelectedCommits(sortWithIndex([node.hash]));
          setSelectionAnchor(node.hash);
        }
        void selectCommit(node.hash, { preserveMultiSelection: shouldPreserve });
      });

    nodeEnter
      .transition()
      .duration(300)
      .ease(d3.easeCubic)
      .attr("opacity", 1)
      .attr("transform", (node: CommitNode) => nodeTransform(node, 1));

    nodeEnter
      .append("circle")
      .attr("class", "node-outer")
      .attr("r", NODE_RADIUS)
      .attr("cx", 0)
      .attr("cy", 0)
      .attr("fill", (node: CommitNode) => getNodeGradient(node.color))
      .attr("stroke", (node: CommitNode) => darken(node.color, 0.8))
      .attr("stroke-width", 2)
      .style("filter", (node: CommitNode) => `drop-shadow(0 0 8px ${getGlow(node.color, 0.6)}) drop-shadow(0 0 2px rgba(0,0,0,0.6))`);

    nodeEnter
      .append("circle")
      .attr("class", "node-center")
      .attr("r", NODE_RADIUS / 2)
      .attr("cx", 0)
      .attr("cy", 0)
      .attr("fill", (node: CommitNode) => brighten(node.color, 1.6))
      .attr("opacity", 0.9)
      .style("filter", "drop-shadow(0 1px 1px rgba(0,0,0,0.3))");

    nodeEnter
      .append("circle")
      .attr("class", "node-highlight")
      .attr("r", NODE_RADIUS / 2.5)
      .attr("cx", -NODE_RADIUS * 0.25)
      .attr("cy", -NODE_RADIUS * 0.25)
      .attr("fill", "rgba(255,255,255,0.5)")
      .attr("opacity", 0.8);

    // Halo de sélection
    nodeEnter
      .append("circle")
      .attr("r", NODE_RADIUS + 4)
      .attr("cx", 0)
      .attr("cy", 0)
      .attr("fill", "transparent")
      .attr("stroke", (node: CommitNode) => {
        if (node.hash === selectedCommit) {
          return node.color;
        }
        if (selectedCommits.includes(node.hash)) {
          return node.color;
        }
        if (node.hash === headCommitHash) {
          return "#06b6d4";
        }
        return "transparent";
      })
      .attr("stroke-width", 2)
      .attr("opacity", (node: CommitNode) => {
        if (node.hash === selectedCommit || selectedCommits.includes(node.hash)) {
          return 0.3;
        }
        if (node.hash === headCommitHash) {
          return 0.2;
        }
        return 0;
      })
      .style("filter", (node: CommitNode) => `drop-shadow(0 0 6px ${getGlow(node.color, 0.4)})`);

    const iconGroup = nodeEnter
      .append("g")
      .attr("class", "commit-icon")
      .style("pointer-events", "none")
      .style("filter", "drop-shadow(0 1px 1px rgba(0,0,0,0.3))")
      .attr("fill", "#ffffff")
      .attr("stroke", "#ffffff")
      .attr("stroke-width", 1.2);

    iconGroup.each(function (node: CommitNode) {
      const group = d3.select(this);
      const iconSize = 10;
      if (node.parents.length > 1) {
        group
          .append("circle")
          .attr("r", 2.4)
          .attr("cx", -2.5)
          .attr("cy", -2.5);
        group
          .append("circle")
          .attr("r", 2.4)
          .attr("cx", 2.5)
          .attr("cy", 2.5);
        group
          .append("line")
          .attr("x1", -1)
          .attr("y1", -1)
          .attr("x2", 1)
          .attr("y2", 1);
        return;
      }

      if (node.hash === headCommitHash) {
        group
          .append("path")
          .attr("d", `M-${iconSize / 2},-${iconSize / 3} L${iconSize / 3},-${iconSize / 3} L${iconSize / 2},0 L${iconSize / 3},${iconSize / 3} L-${iconSize / 2},${iconSize / 3} Z`);
        return;
      }

      if (node.branches.length > 0) {
        group
          .append("circle")
          .attr("r", 2.2)
          .attr("cx", -3.5)
          .attr("cy", 0);
        group
          .append("line")
          .attr("x1", -1)
          .attr("y1", 0)
          .attr("x2", 2.5)
          .attr("y2", 0);
        group
          .append("circle")
          .attr("r", 2.2)
          .attr("cx", 4)
          .attr("cy", 0);
      }
    });

    const textGroup = nodeEnter.append("g").attr("transform", `translate(${NODE_RADIUS + 14}, 0)`);

    // Branch labels displayed in the left column
    const branchLabelGroup = nodeEnter
      .filter((node: CommitNode) => node.branches.length > 0)
      .append("g")
      .attr("class", "branch-labels")
      .attr("transform", (node: CommitNode) => `translate(${-laneX(node.lane) + 10}, 0)`)
      .style("pointer-events", "none");

    branchLabelGroup.each(function(node: CommitNode) {
      const group = d3.select(this);
      const currentBranchName = currentBranch?.name;
      
      let localYOffset = 0;
      node.branches.forEach((branch, index) => {
        if (index > 0) return; // Only show first branch per commit to avoid overlap in restricted height, or stack them?
        // If we want to support multiple branches per commit, we might need to stack them upwards/downwards or comma separate.
        // For now, let's just pick the first one or distinct ones.
        
        const isCurrent = branch === currentBranchName;
        const labelHeight = 24;
        const fontSize = 11;
        const labelColor = node.color;
        
        // Background
        const textWidth = branch.length * 7;
        const padding = 24;
        const width = textWidth + padding;

        group
          .append("path") // Tag shape
          .attr("d", `M0,${-labelHeight/2} H${width} q3,0 3,3 v${labelHeight-6} q0,3 -3,3 H0 v-${labelHeight} z`)
          .attr("fill", isCurrent ? "#0ea5e9" : "#1e293b")
          .attr("stroke", isCurrent ? "#38bdf8" : labelColor)
          .attr("stroke-width", 1.5);

        // Icon
        group
          .append("circle")
          .attr("cx", 12)
          .attr("cy", 0)
          .attr("r", 3)
          .attr("fill", isCurrent ? "#fff" : labelColor);

        // Text
        group
          .append("text")
          .attr("x", 22)
          .attr("y", 1)
          .attr("dominant-baseline", "middle")
          .attr("fill", isCurrent ? "#fff" : "#cbd5e1")
          .attr("font-size", fontSize)
          .attr("font-weight", 600)
          .text(branch);
      });
    });

    const messageText = textGroup
      .append("text")
      .attr("class", "commit-message")
      .attr("fill", (node: CommitNode) => node.hash === headCommitHash ? "#06b6d4" : "#e2e8f0")
      .attr("font-size", 13)
      .attr("font-weight", (node: CommitNode) => {
        if (node.hash === selectedCommit) {
          return 600;
        }
        if (selectedCommits.includes(node.hash)) {
          return 500;
        }
        if (node.hash === headCommitHash) {
          return 500;
        }
        return 400;
      })
      .attr("y", 0)
      .attr("dominant-baseline", "middle")
      .attr("x", (node: CommitNode) => messageColumnX - laneX(node.lane) - (NODE_RADIUS + 14))
      .text((node: CommitNode) => node.message);

    messageText
      .append("title")
      .text((node: CommitNode) => `${node.hash}\n${node.author}\n${new Date(node.date).toLocaleString("fr-FR")}`);
  }, [
    buildRangeSelection,
    checkout,
    closeContextMenu,
    currentBranch,
    graph,
    headCommitHash,
    layout.height,
    layout.laneCount,
    layout.width,
    nodeIndexMap,
    resolveCheckoutBranch,
    selectCommit,
    selectedCommit,
    selectedCommits,
    selectionAnchor,
    setSelectedCommits,
    setSelectionAnchor,
    sortWithIndex,
    visibleRange
  ]);

  if (!graph) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-slate-900 text-slate-500">
        <p>Ouvrez un dépôt pour visualiser l'historique des commits.</p>
      </div>
    );
  }

  return (
    <div
      className="flex h-full flex-1 flex-col"
      style={{ background: "linear-gradient(180deg, #1a1d23 0%, #1e2127 100%)" }}
    >
      {currentBranch && !isMultiSelectActive && (
        <div className="flex items-center justify-center px-4 pt-4">
          <div className="pointer-events-auto flex w-[min(320px,92%)] items-center gap-2 rounded-2xl border border-slate-700/70 bg-slate-900/95 px-4 py-3 text-xs text-slate-200 shadow-2xl backdrop-blur">
            <GitBranch className="h-4 w-4 text-slate-400" />
            <span className="text-slate-300">Branche actuelle :</span>
            <span className="rounded-full bg-cyan-500/20 px-3 py-1 text-[11px] font-semibold text-cyan-300">
              {currentBranch.name}
            </span>
          </div>
        </div>
      )}

      {/* Header Row */}
      <div className="flex w-full shrink-0 select-none items-center border-b border-slate-800 bg-[#16181d] text-[10px] font-bold uppercase tracking-wider text-slate-500 shadow-sm" style={{ paddingLeft: MARGIN.left }}>
        <div className="flex h-8 items-center" style={{ width: BRANCH_COLUMN_WIDTH }}>
          Branch / Tag
        </div>
        <div className="flex h-8 items-center justify-center" style={{ width: layout.laneCount * LANE_WIDTH + MESSAGE_COLUMN_GAP }}>
          Graph
        </div>
        <div className="flex h-8 flex-1 items-center">
          Commit Message
        </div>
      </div>

      <div
        ref={containerCallbackRef}
        className="relative flex-1 overflow-auto"
        onScroll={handleScroll}
        onContextMenu={(event) => {
          if (!event.defaultPrevented) {
            closeContextMenu();
          }
        }}
        style={{ width: "100%", height: "100%", maxWidth: "100%" }}
      >
        <svg 
          ref={svgRef} 
          role="img" 
          aria-label="Graphe des commits"
          style={{ display: "block" }}
        />
      {isMultiSelectActive && (
        <div className="pointer-events-auto absolute left-1/2 top-16 z-10 flex w-[min(520px,92%)] -translate-x-1/2 flex-col gap-3 rounded-2xl border border-slate-700/70 bg-slate-900/95 px-5 py-4 text-xs text-slate-200 shadow-2xl backdrop-blur">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-800 px-3 py-1 text-[11px] font-semibold text-slate-100">
              {actionableSelection.length} commit{actionableSelection.length > 1 ? "s" : ""} sélectionné{actionableSelection.length > 1 ? "s" : ""}
            </span>
            {baseNode && (
              <span className="text-[11px] text-slate-400">
                Base&nbsp;:
                <code className="ml-2 rounded bg-slate-800 px-2 py-1 text-[11px] text-cyan-300">
                  {baseNode.hash.substring(0, 7)}
                </code>
                <span className="ml-2 inline-block max-w-[260px] truncate text-slate-500">
                  {baseNode.message}
                </span>
              </span>
            )}
          </div>
          {selectedNodes.length > 0 && (
            <div className="flex flex-wrap gap-2 text-[11px] text-slate-400">
              {selectedNodes.slice(0, 3).map((node) => (
                <span key={node.hash} className="rounded-lg bg-slate-800/70 px-2 py-1 text-slate-300">
                  <code className="text-cyan-300">{node.hash.substring(0, 7)}</code>
                  <span className="ml-2">{node.message}</span>
                </span>
              ))}
              {selectedNodes.length > 3 && (
                <span className="text-slate-500">+ {selectedNodes.length - 3} autres…</span>
              )}
            </div>
          )}
          {selectionIssue ? (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-[11px] text-amber-100">
              {selectionIssue}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={openSquashModal}
                disabled={!canSquash || loading}
                className="inline-flex items-center gap-2 rounded-lg bg-cyan-600/90 px-3 py-2 font-medium text-slate-50 transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Scissors className="h-4 w-4" />
                Squasher
              </button>
              <button
                type="button"
                onClick={handleDropAction}
                disabled={!canDrop || loading}
                className="inline-flex items-center gap-2 rounded-lg bg-rose-600/90 px-3 py-2 font-medium text-slate-50 transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                Supprimer
              </button>
              <span className="ml-auto text-[11px] text-slate-500">
                Ctrl/Cmd pour ajouter • Shift pour étendre
              </span>
            </div>
          )}
        </div>
      )}
      {contextMenu && (
        <div
          ref={contextMenuRef}
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
        isOpen={squashModalOpen}
  title={`Squasher ${actionableSelection.length} commit${actionableSelection.length > 1 ? "s" : ""}`}
        placeholder="Message du nouveau commit"
        defaultValue={squashDefaultMessage}
        onConfirm={(value) => {
          void handleSquashModalConfirm(value);
        }}
        onCancel={closeSquashModal}
      />
      <InputModal
        isOpen={branchModalOpen}
        title="Créer une branche"
        placeholder="Nom de la nouvelle branche"
        defaultValue={branchModalCommit ? `branch-${branchModalCommit.hash.substring(0, 7)}` : ""}
        checkboxLabel="Basculer sur la nouvelle branche"
        onConfirm={handleBranchModalConfirm}
        onCancel={handleBranchModalCancel}
        onGenerateSuggestions={generateBranchNameSuggestions}
      />
        <ConfirmModal
          isOpen={confirmModal?.isOpen ?? false}
          title={confirmModal?.title ?? ""}
          message={confirmModal?.message ?? ""}
          onConfirm={confirmModal?.onConfirm ?? (() => {})}
          onCancel={() => setConfirmModal(null)}
        />
      </div>
    </div>
  );
};

export default CommitGraph;
