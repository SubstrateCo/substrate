import type { HarnessAuthMethod, HarnessModelCatalog } from "@substrate/contracts/harness-runtime";

export type ModelCatalogState =
  | { kind: "desktop-required" }
  | { kind: "sign-in"; methods: HarnessAuthMethod[] }
  | { kind: "unavailable" }
  | { kind: "error"; error: Error }
  | { kind: "loading" }
  | { kind: "ready" };

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
