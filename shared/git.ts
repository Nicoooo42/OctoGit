export type BranchType = "local" | "remote";

export interface BranchInfo {
  name: string;
  fullName: string;
  type: BranchType;
  current: boolean;
  latestCommit?: string;
  author?: string;
  updatedAt?: string;
  color: string;
}

export interface CommitNode {
  hash: string;
  parents: string[];
  message: string;
  author: string;
  date: string;
  branches: string[];
  lane: number;
  color: string;
}

export interface CommitLink {
  source: string;
  target: string;
  color: string;
}

export interface CommitGraphData {
  nodes: CommitNode[];
  links: CommitLink[];
}

export interface CommitDetails {
  hash: string;
  message: string;
  author: string;
  date: string;
  files: Array<{ path: string; status: string }>;
}

export interface RepoSummary {
  path: string;
  name: string;
}

export interface RecentRepository {
  path: string;
  name: string;
  lastOpened: number;
}

export type BackendSuccess<T> = {
  success: true;
  data: T;
};

export type BackendFailure = {
  success: false;
  error: string;
};

export type BackendResponse<T> = BackendSuccess<T> | BackendFailure;
