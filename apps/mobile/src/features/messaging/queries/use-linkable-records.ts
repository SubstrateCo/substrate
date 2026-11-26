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

/** Record kinds the workspace has enabled, in picker order. */
export function useLinkableKinds(organizationId: string) {
  const apps = useMessagingApps(organizationId);
  return {
    ...apps,
    kinds: contextEntityTypes.filter((kind) =>
      requiredAppsForEntityType(kind).every((app) => apps.enabled(app)),
    ),
  };
}

/**
 * Records of one kind the viewer can edit, because linking changes the record. The server checks
 * edit access again when it links.
 */
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

/**
 * Links records to a message, one request per record. Each settles on its own, so a failure keeps
 * the earlier links. Records list their messages too, so every workspace view refreshes.
 */
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
