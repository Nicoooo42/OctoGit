import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Archive, Copy, GitBranch, GitCommit, GitMerge, Scissors, Trash2 } from "lucide-react";
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
    branches
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
    const width = laneCount * LANE_WIDTH + MARGIN.left + MARGIN.right;

    return { laneCount, height, width };
  }, [graph]);

  const nodeIndexMap = useMemo(() => {
    if (!graph) {
      return new Map<string, number>();
    }
    return new Map(graph.nodes.map((node, index) => [node.hash, index]));
  }, [graph]);

  const sortSelection = useCallback(
    (hashes: string[]) => {
      const unique = Array.from(new Set(hashes));
      unique.sort((a, b) => {
        const indexA = nodeIndexMap.get(a) ?? Number.POSITIVE_INFINITY;
        const indexB = nodeIndexMap.get(b) ?? Number.POSITIVE_INFINITY;
        return indexA - indexB;
      });
      return unique;
    },
    [nodeIndexMap]
  );

  const buildRangeSelection = useCallback(
    (fromHash: string, toHash: string) => {
      if (!graph) {
        return [];
      }
      const fromIndex = nodeIndexMap.get(fromHash);
      const toIndex = nodeIndexMap.get(toHash);
      if (fromIndex === undefined || toIndex === undefined) {
        return sortSelection([toHash]);
      }
      const start = Math.min(fromIndex, toIndex);
      const end = Math.max(fromIndex, toIndex);
      const range = graph.nodes.slice(start, end + 1).map((node) => node.hash);
      return sortSelection(range);
    },
    [graph, nodeIndexMap, sortSelection]
  );

  useEffect(() => {
    if (selectedCommits.length === 0) {
      setSelectionAnchor(null);
      return;
    }
    setSelectionAnchor((prev) => prev ?? selectedCommits[0]);
  }, [selectedCommits]);

  const sanitizedSelection = useMemo(
    () => sortSelection(selectedCommits.filter((hash) => hash !== "working-directory")),
    [selectedCommits, sortSelection]
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

  const selectionMeta = useMemo(() => {
    if (!graph || sanitizedSelection.length === 0) {
      return {
        sanitizedSelection: [] as string[],
        includesHead: false,
        isContiguous: false,
        baseHash: null as string | null
      };
    }

    const includesHead = headCommitHash ? sanitizedSelection[0] === headCommitHash : false;
    
    // Pour vérifier la contiguïté, on doit reproduire la logique du backend :
    // partir de HEAD et suivre la chaîne first-parent jusqu'à trouver tous les commits sélectionnés
    const selectedSet = new Set(sanitizedSelection);
    let isContiguous = includesHead;
    let current = headCommitHash;
    let baseHash: string | null = null;

    if (includesHead && current) {
      // On parcourt la chaîne first-parent depuis HEAD
      while (current && selectedSet.has(current)) {
        selectedSet.delete(current);
        
        const currentIndex = nodeIndexMap.get(current);
        if (currentIndex === undefined) {
          isContiguous = false;
          break;
        }
        
        const currentNode = graph.nodes[currentIndex];
        const firstParent = currentNode.parents[0];
        
        if (!firstParent) {
          // On a atteint le commit racine
          baseHash = null;
          break;
        }
        
        current = firstParent;
        baseHash = firstParent;
      }
      
      // S'il reste des commits dans selectedSet, ils ne sont pas dans la chaîne first-parent
      if (selectedSet.size > 0) {
        isContiguous = false;
      }
    } else {
      isContiguous = false;
      // Calculer le baseHash même si pas continu (pour l'affichage)
      const lastHash = sanitizedSelection[sanitizedSelection.length - 1];
      const lastIndex = nodeIndexMap.get(lastHash);
      baseHash = lastIndex !== undefined ? graph.nodes[lastIndex].parents[0] ?? null : null;
    }

    return {
      sanitizedSelection,
      includesHead,
      isContiguous,
      baseHash
    };
  }, [graph, headCommitHash, nodeIndexMap, sanitizedSelection]);

  const actionableSelection = selectionMeta.sanitizedSelection;
  const selectionBaseHash = selectionMeta.baseHash;

  const baseNode = useMemo(() => {
    if (!graph || !selectionMeta.baseHash) {
      return null;
    }
    const index = nodeIndexMap.get(selectionMeta.baseHash);
    return index !== undefined ? graph.nodes[index] : null;
  }, [graph, nodeIndexMap, selectionMeta.baseHash]);

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

  const selectionIssue = useMemo(() => {
    if (hasWorkingDirectorySelected && actionableSelection.length === 0) {
      return "Le répertoire de travail ne peut pas être inclus dans cette opération.";
    }

    if (actionableSelection.length === 0) {
      return "Sélectionnez les commits à réécrire en commençant par HEAD.";
    }

    if (!selectionMeta.includesHead) {
      return "La sélection doit inclure le commit HEAD (le plus récent).";
    }

    if (!selectionMeta.isContiguous) {
      return "Les commits doivent suivre la même branche (first-parent) sans trou.";
    }

    if (!selectionBaseHash) {
      return "Impossible de modifier le tout premier commit du dépôt.";
    }

    return null;
  }, [hasWorkingDirectorySelected, sanitizedSelection.length, selectionMeta]);

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
    
    const container = containerRef.current;
    const containerWidth = container ? container.clientWidth : layout.width;
    const availableWidth = containerWidth - MARGIN.left - MARGIN.right;
  const laneWidth = layout.laneCount > 0 ? availableWidth / layout.laneCount : LANE_WIDTH;
  const laneX = (lane: number) => lane * laneWidth + laneWidth / 2;
    
    svg
      .attr("width", "100%")
      .attr("height", layout.height)
      .style("minWidth", `${containerWidth}px`)
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

    const linkGroup = g.append("g").attr("fill", "none").attr("stroke-linecap", "round");

    linkGroup
      .selectAll<SVGPathElement, CommitLink>("path")
      .data(linksSubset, (link: CommitLink) => `${link.source}-${link.target}`)
      .join("path")
      .attr("stroke", (link: CommitLink) => link.color)
      .attr("stroke-width", (link: CommitLink) => (link.isFirstParent ? 1.6 : 1.2))
      .attr("opacity", (link: CommitLink) => (link.isFirstParent ? 0.85 : 0.7))
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
        const isFirstParent = link.isFirstParent ?? false;

        if (isFirstParent) {
          if (sourceNode.lane === targetNode.lane) {
            return `M${x1},${y1} L${x2},${y2}`;
          }
          const midY = (y1 + y2) / 2;
          return `M${x1},${y1} C${x1},${midY} ${x2},${midY} ${x2},${y2}`;
        }

        // Courbe plus marquée pour illustrer la jonction de merge
        let direction = Math.sign(x2 - x1);
        if (direction === 0) {
          const lastChar = link.target.charCodeAt(link.target.length - 1);
          direction = (lastChar & 1) === 0 ? -1 : 1;
        }
        const lateralOffset = laneWidth * 0.45;
        const controlYOffset = Math.max(ROW_HEIGHT * 0.25, (y2 - y1) * 0.35);
        const controlX1 = x1 + direction * lateralOffset;
        const controlY1 = y1 + controlYOffset;
        const controlX2 = x2 - direction * lateralOffset * 0.25;
        const controlY2 = y2 - controlYOffset * 0.4;

        return `M${x1},${y1} C${controlX1},${controlY1} ${controlX2},${controlY2} ${x2},${y2}`;
      });

    const nodeGroup = g.append("g");

    const nodeEnter = nodeGroup
      .selectAll<SVGGElement, CommitNode>("g.commit-node")
      .data(nodesSubset, (node: CommitNode) => node.hash)
      .join("g")
      .attr("class", "commit-node")
      .attr("transform", (node: CommitNode) => {
        const actualIndex = nodeIndexMap.get(node.hash) ?? 0;
        const x = laneX(node.lane);
        const y = actualIndex * ROW_HEIGHT;
        return `translate(${x}, ${y})`;
      })
      .style("cursor", "pointer")
      .on("click", (event: MouseEvent, node: CommitNode) => {
        event.stopPropagation();
        closeContextMenu();

        const hash = node.hash;
        const timer = clickTimerRef.current;

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
            const nextSelection = range.length > 0 ? range : sortSelection([hash]);
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
              const nextSelection = sortSelection([...selectedCommits, hash]);
              setSelectedCommits(nextSelection);
              setSelectionAnchor(hash);
              void selectCommit(hash, { preserveMultiSelection: true });
            }
            return;
          }

          const nextSelection = sortSelection([hash]);
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
          setSelectedCommits(sortSelection([node.hash]));
          setSelectionAnchor(node.hash);
        }
        void selectCommit(node.hash, { preserveMultiSelection: shouldPreserve });
      });

    nodeEnter
      .append("circle")
      .attr("r", NODE_RADIUS)
      .attr("cx", 0)
      .attr("cy", 0)
      .attr("fill", (node: CommitNode) => node.hash === headCommitHash ? "#06b6d4" : node.color)
      .attr("stroke", (node: CommitNode) => {
        if (node.hash === selectedCommit) {
          return "#ffffff";
        }
        if (selectedCommits.includes(node.hash)) {
          return "#38bdf8";
        }
        if (node.hash === headCommitHash) {
          return "#06b6d4";
        }
        return "#0f172a";
      })
      .attr("stroke-width", (node: CommitNode) => {
        if (node.hash === selectedCommit || selectedCommits.includes(node.hash)) {
          return 2;
        }
        if (node.hash === headCommitHash) {
          return 2;
        }
        return 1.5;
      })
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
      .attr("stroke-width", 1)
      .attr("opacity", (node: CommitNode) => {
        if (node.hash === selectedCommit || selectedCommits.includes(node.hash)) {
          return 0.3;
        }
        if (node.hash === headCommitHash) {
          return 0.2;
        }
        return 0;
      });

    const textGroup = nodeEnter.append("g").attr("transform", `translate(${NODE_RADIUS + 12}, 0)`);

    // Branches with background for current branch
    const branchGroups = textGroup
      .filter((node: CommitNode) => node.branches.length > 0)
      .append("g")
      .attr("class", "branch-labels");

    branchGroups.each(function(node: CommitNode) {
      const group = d3.select(this);
      const currentBranchName = currentBranch?.name;
      const hasCurrentBranch = currentBranchName && node.branches.includes(currentBranchName);
      
      if (hasCurrentBranch) {
        // Background rectangle for current branch
        group.append("rect")
          .attr("x", -3)
          .attr("y", -22)
          .attr("width", currentBranchName.length * 6.5 + 6) // Better width calculation
          .attr("height", 14)
          .attr("fill", "#06b6d4")
          .attr("fill-opacity", 0.15)
          .attr("rx", 3)
          .attr("stroke", "#06b6d4")
          .attr("stroke-width", 0.5)
          .attr("stroke-opacity", 0.3);
      }

      // Branch text
      group.append("text")
        .attr("class", "commit-branches")
        .attr("fill", "#94a3b8")
        .attr("font-size", 11)
        .attr("font-weight", 500)
        .attr("y", hasCurrentBranch ? -15 : -16) // Center in rectangle when highlighted
        .attr("dominant-baseline", hasCurrentBranch ? "middle" : "baseline")
        .html(() => {
          if (!currentBranch) return node.branches.join(", ");
          
          return node.branches.map(branch => {
            if (branch === currentBranch.name) {
              return `<tspan fill="#06b6d4" font-weight="600">${branch}</tspan>`;
            }
            return `<tspan>${branch}</tspan>`;
          }).join(", ");
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
    layout.width,
    nodeIndexMap,
    resolveCheckoutBranch,
    selectCommit,
    selectedCommit,
    selectedCommits,
    selectionAnchor,
    setSelectedCommits,
    setSelectionAnchor,
    sortSelection,
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
      ref={containerCallbackRef}
  className="relative flex-1 overflow-auto bg-slate-900"
      onScroll={handleScroll}
      onContextMenu={(event) => {
        if (!event.defaultPrevented) {
          closeContextMenu();
        }
      }}
      style={{ width: '100%', height: '100%', maxWidth: '100%' }}
    >
      <svg 
        ref={svgRef} 
        role="img" 
        aria-label="Graphe des commits"
        style={{ display: 'block' }}
      />
      {currentBranch && !isMultiSelectActive && (
        <div className="pointer-events-auto absolute left-1/2 top-4 z-10 flex w-[min(300px,92%)] -translate-x-1/2 items-center gap-2 rounded-2xl border border-slate-700/70 bg-slate-900/95 px-4 py-3 text-xs text-slate-200 shadow-2xl backdrop-blur">
          <GitBranch className="h-4 w-4 text-slate-400" />
          <span className="text-slate-300">Branche actuelle :</span>
          <span className="rounded-full bg-cyan-500/20 px-3 py-1 text-[11px] font-semibold text-cyan-300">
            {currentBranch.name}
          </span>
        </div>
      )}
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
