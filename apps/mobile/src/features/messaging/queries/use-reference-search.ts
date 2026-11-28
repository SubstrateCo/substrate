import { appEnabled, type AppId } from "@substrate/contracts/apps";
import type { ReferenceKind, ReferenceTab } from "@substrate/contracts/messaging/references";

import { useQuery } from "@tanstack/react-query";

import { useEffect, useState } from "react";

import { searchContext, type SearchInput } from "../api/context";
import { messagingKeys } from "../keys";
import { useMessagingScope } from "../scope";
import { api } from "@/api/client";
import { readResult } from "@/api/result";

const mixedLimit = 5;
const debounceMs = 200;

export function useDebounced<T>(value: T) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), debounceMs);
    return () => clearTimeout(timer);
  }, [value]);
  return { value: debounced, pending: debounced !== value };
}

export function useMessagingApps(organizationId: string) {
  const scope = useMessagingScope(organizationId);
  const apps = useQuery({
    queryKey: messagingKeys.apps(scope),
    queryFn: ({ signal }) =>
      readResult(
        api.organizations.apps.$get(
          { query: { organizationId: scope.organizationId } },
          { init: { signal } },
        ),
      ),
    staleTime: 30_000,
    retry: false,
  });
  return {
    ready: apps.isSuccess,
    loading: apps.isPending,
    error: apps.error,
    retry: () => void apps.refetch(),
    enabled: (app: AppId) => !!apps.data && appEnabled(apps.data.enabledApps, app),
  };
}

export function referenceTabs(trigger: "@" | "#", tasks: boolean): ReferenceTab[] {
  if (trigger === "#") return ["channel", "thread"];
  return tasks ? ["all", "person", "agent", "task", "project"] : ["all", "person", "agent"];
}

export function useReferenceSearch({
  organizationId,
  conversationId,
  query,
  tab,
  tasks,
  enabled,
}: {
  organizationId: string;
  conversationId: string;
  query: string;
  tab: ReferenceTab;
  tasks: boolean;
  enabled: boolean;
}) {
  const scope = useMessagingScope(organizationId);
  const debounced = useDebounced(query);
  const mixed: Extract<ReferenceKind, "person" | "agent" | "task" | "project">[] = tasks
    ? ["person", "agent", "task", "project"]
    : ["person", "agent"];
  const input: SearchInput = {
    organizationId,
    conversationId,
    query: debounced.value,
    ...(tab === "all" ? { kinds: mixed, limit: mixedLimit } : { kind: tab }),
  };
  const result = useQuery({
    queryKey: messagingKeys.search(scope, input),
    queryFn: ({ signal }) => searchContext(input, signal),
    enabled: enabled && !debounced.pending,
    retry: false,
  });
  const rows = (result.data ?? []).flatMap((row) => {
    const kind = tab === "all" ? mixed.find((item) => item === row.kind) : tab;
    return kind ? [{ ...row, kind }] : [];
  });
  return {
    rows: debounced.pending ? [] : rows,
    loading: debounced.pending || result.isPending,
    error: debounced.pending ? null : result.error,
    retry: () => void result.refetch(),
  };
}
