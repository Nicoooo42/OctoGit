import type { CommitGraphData, CommitNode } from "../../types/git";

// Selection-related helpers extracted from the CommitGraph component to keep it readable.

export type NodeIndexMap = Map<string, number>;

export type SelectionMeta = {
  sanitizedSelection: string[];
  includesHead: boolean;
  isContiguous: boolean;
  baseHash: string | null;
};

export const createNodeIndexMap = (graph: CommitGraphData | null): NodeIndexMap => {
  if (!graph) {
    return new Map();
  }
  return new Map(graph.nodes.map((node, index) => [node.hash, index]));
};

export const sortSelection = (hashes: string[], nodeIndexMap: NodeIndexMap): string[] => {
  const unique = Array.from(new Set(hashes));
  unique.sort((a, b) => {
    const indexA = nodeIndexMap.get(a) ?? Number.POSITIVE_INFINITY;
    const indexB = nodeIndexMap.get(b) ?? Number.POSITIVE_INFINITY;
    return indexA - indexB;
  });
  return unique;
};

export const buildRangeSelection = (
  graph: CommitGraphData | null,
  nodeIndexMap: NodeIndexMap,
  fromHash: string,
  toHash: string
): string[] => {
  if (!graph) {
    return [];
  }

  const fromIndex = nodeIndexMap.get(fromHash);
  const toIndex = nodeIndexMap.get(toHash);

  if (fromIndex === undefined || toIndex === undefined) {
    return sortSelection([toHash], nodeIndexMap);
  }

  const start = Math.min(fromIndex, toIndex);
  const end = Math.max(fromIndex, toIndex);
  return sortSelection(
    graph.nodes.slice(start, end + 1).map((node) => node.hash),
    nodeIndexMap
  );
};

export const computeSelectionMeta = ({
  graph,
  sanitizedSelection,
  headCommitHash,
  nodeIndexMap
}: {
  graph: CommitGraphData | null;
  sanitizedSelection: string[];
  headCommitHash: string | null;
  nodeIndexMap: NodeIndexMap;
}): SelectionMeta => {
  if (!graph || sanitizedSelection.length === 0) {
    return { sanitizedSelection: [], includesHead: false, isContiguous: false, baseHash: null };
  }

  const includesHead = headCommitHash ? sanitizedSelection[0] === headCommitHash : false;
  const selectedSet = new Set(sanitizedSelection);
  let isContiguous = includesHead;
  let current = headCommitHash;
  let baseHash: string | null = null;

  if (includesHead && current) {
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
        baseHash = null;
        break;
      }

      current = firstParent;
      baseHash = firstParent;
    }

    if (selectedSet.size > 0) {
      isContiguous = false;
    }
  } else {
    isContiguous = false;
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
};

export const findBaseNode = (
  graph: CommitGraphData | null,
  nodeIndexMap: NodeIndexMap,
  baseHash: string | null
): CommitNode | null => {
  if (!graph || !baseHash) {
    return null;
  }
  const index = nodeIndexMap.get(baseHash);
  return index !== undefined ? graph.nodes[index] : null;
};

export const getSelectionIssue = (
  meta: SelectionMeta,
  hasWorkingDirectorySelected: boolean
): string | null => {
  if (hasWorkingDirectorySelected && meta.sanitizedSelection.length === 0) {
    return "Le répertoire de travail ne peut pas être inclus dans cette opération.";
  }

  if (meta.sanitizedSelection.length === 0) {
    return "Sélectionnez les commits à réécrire en commençant par HEAD.";
  }

  if (!meta.includesHead) {
    return "La sélection doit inclure le commit HEAD (le plus récent).";
  }

  if (!meta.isContiguous) {
    return "Les commits doivent suivre la même branche (first-parent) sans trou.";
  }

  if (!meta.baseHash) {
    return "Impossible de modifier le tout premier commit du dépôt.";
  }

  return null;
};
