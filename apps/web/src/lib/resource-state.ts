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
