import type { HarnessAuthMethod, HarnessModelCatalog } from "@substrate/contracts/harness-runtime";

/** What the model picker shows for the runtime it is browsing. */
export type ModelCatalogState =
  | { kind: "desktop-required" }
  | { kind: "sign-in"; methods: HarnessAuthMethod[] }
  | { kind: "unavailable" }
  | { kind: "error"; error: Error }
  | { kind: "loading" }
  | { kind: "ready" };

/**
 * Only the desktop app reads model catalogs. A catalog that says the runtime needs a sign-in or
 * is not installed wins over a failed refresh, because it is what the runtime last answered.
 */
export function modelCatalogState({
  desktop,
  catalog,
  loading,
  error,
}: {
  desktop: boolean;
  catalog: HarnessModelCatalog | undefined;
  loading: boolean;
  error: Error | null;
}): ModelCatalogState {
  if (!desktop) return { kind: "desktop-required" };
  if (catalog?.status === "sign-in")
    return { kind: "sign-in", methods: catalog.auth?.methods ?? [] };
  if (catalog?.status === "unavailable") return { kind: "unavailable" };
  if (error) return { kind: "error", error };
  if (loading) return { kind: "loading" };
  return { kind: "ready" };
}
