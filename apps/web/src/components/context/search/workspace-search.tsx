import { useInfiniteQuery } from "@tanstack/react-query";

import { useState } from "react";

import {
  WorkspaceSearch as WorkspaceSearchView,
  type SearchKind,
} from "@/components/context/search/workspace-search-view";
import { useSearchDebounce } from "@/hooks/use-search-debounce";
import { messageHref, workHref } from "@/lib/navigation/record-links";
import { searchPagesOptions } from "@/queries/context/search";

export function WorkspaceSearch({
  organizationId,
  query,
  onQueryChange,
  onFocusInput,
}: {
  organizationId: string;
  query: string;
  onQueryChange: (query: string) => void;
  onFocusInput: () => void;
}) {
  const [kind, setKind] = useState<SearchKind>("all");
  const [relatedToEntityId, setRelatedToEntityId] = useState<string>();
  const search = useSearchDebounce(
    query,
    JSON.stringify([organizationId, kind, relatedToEntityId]),
  );
  const results = useInfiniteQuery({
    ...searchPagesOptions({ organizationId, query: search.query, kind, relatedToEntityId }),
    enabled: !search.pending,
  });
  return (
    <WorkspaceSearchView
      query={query}
      onFocusInput={onFocusInput}
      kind={kind}
      related={!!relatedToEntityId}
      results={(search.pending ? [] : (results.data?.pages.flat() ?? [])).map((item) => ({
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
      loading={search.pending || results.isPending}
      error={search.pending ? null : results.error}
      hasMore={!search.pending && results.hasNextPage}
      loadingMore={results.isFetchingNextPage}
      onKindChange={(value) => {
        setKind(value);
      }}
      onRelated={(id) => {
        setRelatedToEntityId(id);
        onQueryChange("");
        setKind("all");
      }}
      onClearRelated={() => {
        setRelatedToEntityId(undefined);
      }}
      onMore={() => {
        if (!search.pending && !results.isFetching) void results.fetchNextPage();
      }}
      onRetry={() => {
        if (!search.pending)
          void (results.isFetchNextPageError ? results.fetchNextPage() : results.refetch());
      }}
    />
  );
}
