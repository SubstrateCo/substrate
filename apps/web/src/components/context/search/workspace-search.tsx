import { useInfiniteQuery } from "@tanstack/react-query";

import { useState } from "react";

import {
  WorkspaceSearch as WorkspaceSearchView,
  type SearchKind,
} from "@/components/context/search/workspace-search-view";
import { useSearchDebounce } from "@/hooks/use-search-debounce";
import { messageHref, workHref } from "@/lib/navigation/record-links";
import { searchPagesOptions } from "@/queries/context/search";
import { useConversationManagement } from "@/queries/messaging/management";
import { toast } from "sonner";

export function WorkspaceSearch({
  organizationId,
  initialKind = "all",
  query,
}: {
  organizationId: string;
  initialKind?: SearchKind;
  query: string;
}) {
  const [kind, setKind] = useState<SearchKind>(initialKind);
  const { join } = useConversationManagement(organizationId);
  const search = useSearchDebounce(query, JSON.stringify([organizationId, kind]));
  const results = useInfiniteQuery({
    ...searchPagesOptions({ organizationId, query: search.query, kind }),
    enabled: !search.pending,
  });
  return (
    <WorkspaceSearchView
      query={query}
      kind={kind}
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
      joiningId={join.isPending ? join.variables : undefined}
      onJoin={(conversationId) =>
        join.mutate(conversationId, {
          // The joined row and the sidebar update together.
          onSuccess: () => void results.refetch(),
          onError: (error) => toast.error(error.message),
        })
      }
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
