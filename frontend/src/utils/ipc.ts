import type { BackendResponse } from "../types/git";

export async function unwrap<T>(promise: Promise<BackendResponse<T>>): Promise<T> {
  const result = await promise;
  if (!result.success) {
    throw new Error(result.error ?? "Une erreur inconnue est survenue");
  }

  return result.data;
}
