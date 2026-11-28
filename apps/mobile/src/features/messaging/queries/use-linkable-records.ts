import { requiredAppsForEntityType } from "@substrate/contracts/apps";
import { contextEntityTypes, type ContextEntityType } from "@substrate/contracts/context/input";
import { taskStatusLabels } from "@substrate/contracts/tasks";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { attachWork, searchContext, type SearchInput } from "../api/context";
import { messagingKeys } from "../keys";
import { settleLinks, type LinkableRecord } from "../references/linkable-records";
import { useMessagingScope } from "../scope";
import type { SearchResult } from "../types";
import { useDebounced, useMessagingApps } from "./use-reference-search";
import { refreshRecords } from "@/features/records/invalidation";

function detail(result: SearchResult) {
  return (
    [result.projectName, result.status && taskStatusLabels[result.status]]
      .filter(Boolean)
      .join(" · ") || undefined
  );
}

export function useLinkableKinds(organizationId: string) {
  const apps = useMessagingApps(organizationId);
  return {
    ...apps,
    kinds: contextEntityTypes.filter((kind) =>
      requiredAppsForEntityType(kind).every((app) => apps.enabled(app)),
    ),
  };
}

export function useLinkableRecords({
  organizationId,
  kind,
  query,
  enabled,
}: {
  organizationId: string;
  kind: ContextEntityType;
  query: string;
  enabled: boolean;
}) {
  const scope = useMessagingScope(organizationId);
  const debounced = useDebounced(query);
  const input: SearchInput = { organizationId, query: debounced.value, kind, editable: true };
  const result = useQuery({
    queryKey: messagingKeys.search(scope, input),
    queryFn: ({ signal }) => searchContext(input, signal),
    enabled: enabled && !debounced.pending,
    retry: false,
  });
  const records: LinkableRecord[] = (result.data ?? []).map((row) => ({
    id: row.id,
    kind,
    title: row.title,
    detail: detail(row),
  }));
  return {
    records: debounced.pending ? [] : records,
    loading: debounced.pending || result.isPending,
    error: debounced.pending ? null : result.error,
    retry: () => void result.refetch(),
  };
}

export function useLinkRecords(organizationId: string, messageId: string) {
  const scope = useMessagingScope(organizationId);
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (records: LinkableRecord[]) => {
      const settled = await Promise.allSettled(
        records.map((record) => attachWork({ organizationId, messageId, entityId: record.id })),
      );
      return settleLinks(records, settled);
    },
    onSuccess: ({ linked }) => (linked.length ? refreshRecords(client, scope) : undefined),
  });
}
