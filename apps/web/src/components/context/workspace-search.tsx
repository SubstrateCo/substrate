import { useQuery } from "@tanstack/react-query";

import { useState } from "react";

import { messageHref, workHref } from "@/lib/context-links";
import { searchOptions } from "@/queries/context/options";
import {
  WorkspaceSearch as WorkspaceSearchView,
  type SearchKind,
} from "@/ui/context/workspace-search";

export function WorkspaceSearch({
  organizationId,
  onClose,
  query: externalQuery,
  onQueryChange,
  onFocusInput,
}: {
  organizationId: string;
  onClose: () => void;
  query?: string;
  onQueryChange?: (query: string) => void;
  onFocusInput?: () => void;
}) {
  const [localQuery, setLocalQuery] = useState("");
  const query = externalQuery ?? localQuery;
  const setQuery = onQueryChange ?? setLocalQuery;
  const [kind, setKind] = useState<SearchKind>("all");
  const [after, setAfter] = useState<string>();
  const [relatedToEntityId, setRelatedToEntityId] = useState<string>();
  const results = useQuery(
    searchOptions({ organizationId, query, kind, after, relatedToEntityId, limit: 30 }),
  );
  return (
    <WorkspaceSearchView
      query={query}
      hideInput={externalQuery !== undefined}
      onFocusInput={onFocusInput}
      kind={kind}
      related={!!relatedToEntityId}
      results={(results.data ?? []).map((item) => ({
        ...item,
        href: item.conversationId
          ? messageHref(
              organizationId,
              item.conversationId,
              item.kind === "message" ? item.id : undefined,
            )
          : workHref(
              organizationId,
              item.projectEntityId!,
              item.kind === "task" ? item.id : undefined,
            ),
      }))}
      loading={results.isPending}
      error={results.error}
      hasMore={results.data?.length === 30}
      hasPrevious={!!after}
      onQueryChange={(value) => {
        setQuery(value);
        setAfter(undefined);
      }}
      onKindChange={(value) => {
        setKind(value);
        setAfter(undefined);
      }}
      onRelated={(id) => {
        setRelatedToEntityId(id);
        setQuery("");
        setKind("all");
        setAfter(undefined);
      }}
      onClearRelated={() => {
        setRelatedToEntityId(undefined);
        setAfter(undefined);
      }}
      onMore={() => setAfter(results.data?.at(-1)?.id)}
      onFirst={() => setAfter(undefined)}
      onRetry={() => void results.refetch()}
      onClose={onClose}
    />
  );
}
