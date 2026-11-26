import { useInfiniteQuery } from "@tanstack/react-query";

import { useState } from "react";

import { searchResultItems } from "./search-result-items";
import {
  WorkspaceSearch as WorkspaceSearchView,
  type SearchKind,
} from "@/components/context/search/workspace-search-view";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { useOrganizationApps } from "@/components/workspace/organization-apps";
import { useSearchDebounce } from "@/hooks/use-search-debounce";
import { resourceState } from "@/lib/resource-state";
import { searchPagesOptions, useJoinSearchConversation } from "@/queries/context/search";
import { toast } from "sonner";

export function WorkspaceSearch({
  organizationId,
  initialKind = "all",
  query,
  onClose,
}: {
  organizationId: string;
  initialKind?: SearchKind;
  query: string;
  onClose: () => void;
}) {
  const apps = useOrganizationApps();
  const kinds: SearchKind[] = apps.enabled("tasks")
    ? ["all", "task", "project", "message", "channel"]
    : ["all", "message", "channel"];
  const [selectedKind, setKind] = useState<SearchKind>(initialKind);
  const kind = kinds.includes(selectedKind) ? selectedKind : "all";
  const search = useSearchDebounce(query, JSON.stringify([organizationId, kind]));
  const join = useJoinSearchConversation({ organizationId, query: search.query, kind });
  const pages = searchPagesOptions({ organizationId, query: search.query, kind });
  const results = useInfiniteQuery({ ...pages, enabled: apps.ready && !search.pending });
  return (
    <WorkspaceSearchView
      query={query}
      onClose={onClose}
      kind={kind}
      kinds={kinds}
      results={searchResultItems(
        search.pending ? [] : (resourceState(results).data?.pages.flat() ?? []),
        organizationId,
        { tasks: apps.enabled("tasks"), crm: apps.enabled("crm") },
      )}
      loading={search.pending || results.isPending}
      error={search.pending ? null : results.error}
      hasMore={!search.pending && results.hasNextPage}
      loadingMore={results.isFetchingNextPage}
      onKindChange={setKind}
      joiningId={join.isPending ? join.variables : undefined}
      onJoin={(conversationId) =>
        join.mutate(conversationId, {
          onError: (error) =>
            toast.error(
              actionErrorMessage(error, "We couldn’t join the channel. Please try again."),
            ),
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
