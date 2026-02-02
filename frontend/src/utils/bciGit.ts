import type { BackendResponse } from "../types/git";

export type BciGitApi = NonNullable<typeof window.BciGit>;

/**
 * Returns the bridged API or throws so callers can fail fast rather than
 * silently skipping features when Electron preload is unavailable.
 */
export const getBciGit = (): BciGitApi => {
  if (!window.BciGit) {
    throw new Error("API non disponible");
  }

  return window.BciGit;
};

/**
 * Returns the bridged API if it exists. Useful for passive reads where we can
 * safely abort when the preload script is not yet ready.
 */
export const tryGetBciGit = (): BciGitApi | null => window.BciGit ?? null;

export const isSuccess = <T>(response: BackendResponse<T>): response is BackendResponse<T> & { success: true; data: T } => response.success;
