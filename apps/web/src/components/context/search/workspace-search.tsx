import { useInfiniteQuery } from "@tanstack/react-query";

import { useState } from "react";

import {
  WorkspaceSearch as WorkspaceSearchView,
  type SearchKind,
} from "@/components/context/search/workspace-search-view";
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
  const results = useInfiniteQuery(
    searchPagesOptions({ organizationId, query, kind, relatedToEntityId }),
  );
  return (
    <WorkspaceSearchView
      query={query}
      onFocusInput={onFocusInput}
      kind={kind}
      related={!!relatedToEntityId}
      results={(results.data?.pages.flat() ?? []).map((item) => ({
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
      hasMore={results.hasNextPage}
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
        if (!results.isFetching) void results.fetchNextPage();
      }}
      onRetry={() =>
        void (results.isFetchNextPageError ? results.fetchNextPage() : results.refetch())
      }
    />
  );
}
