import { isAccessFailure } from "@/api/access-failure";

export type ResourceStatus = "loading" | "unavailable" | "error" | "stale" | "ready";
export type ResourceState<T> = {
  status: ResourceStatus;
  data: T | undefined;
  error: Error | null;
};

export function resourceState<T>(query: {
  data: T | undefined;
  error?: Error | null;
  isPending?: boolean;
}): ResourceState<T> {
  const error = query.error ?? null;
  if (isAccessFailure(error)) return { status: "unavailable", data: undefined, error };
  if (error)
    return { status: query.data === undefined ? "error" : "stale", data: query.data, error };
  if (query.data === undefined) return { status: "loading", data: undefined, error };
  return { status: "ready", data: query.data, error };
}

export type ListPhase<T> =
  | { status: "loading" }
  | { status: "error"; error: Error }
  | { status: "empty" }
  | { status: "ready"; items: T[] }
  | { status: "stale"; items: T[]; error: Error };

export function listPhase<T>({
  items,
  loading = false,
  error,
}: {
  items: T[] | undefined;
  loading?: boolean;
  error?: Error | null;
}): ListPhase<T> {
  if (error && isAccessFailure(error)) return { status: "error", error };
  if (items?.length) return error ? { status: "stale", items, error } : { status: "ready", items };
  if (error) return { status: "error", error };
  if (loading || !items) return { status: "loading" };
  return { status: "empty" };
}
