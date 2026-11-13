import { useInfiniteQuery } from "@tanstack/react-query";

import { useState } from "react";

import {
  WorkspaceSearch as WorkspaceSearchView,
  type SearchKind,
} from "@/components/context/search/workspace-search-view";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { useSearchDebounce } from "@/hooks/use-search-debounce";
import { recordLink, contactLink, messageLink, workLink } from "@/lib/navigation/record-links";
import { resourceState } from "@/lib/resource-state";
import { searchPagesOptions, useJoinSearchConversation } from "@/queries/context/search";
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
  const search = useSearchDebounce(query, JSON.stringify([organizationId, kind]));
  const join = useJoinSearchConversation({ organizationId, query: search.query, kind });
  const pages = searchPagesOptions({ organizationId, query: search.query, kind });
  const results = useInfiniteQuery({ ...pages, enabled: !search.pending });
  return (
    <WorkspaceSearchView
      query={query}
      kind={kind}
      results={(search.pending ? [] : (resourceState(results).data?.pages.flat() ?? [])).map(
        (item) => {
          if (item.kind === "account" || item.kind === "contact" || item.kind === "deal") {
            const section = { account: "accounts", contact: "contacts", deal: "deals" } as const;
            return { ...item, link: recordLink(organizationId, section[item.kind], item.id) };
          }
          if (item.kind === "contact_interaction")
            return { ...item, link: contactLink(organizationId, item.contactEntityId) };
          return {
            ...item,
            link: item.conversationId
              ? messageLink(
                  organizationId,
                  item.conversationId,
                  item.kind === "message" ? item.id : undefined,
                )
              : workLink(
                  organizationId,
                  item.projectEntityId!,
                  item.kind === "task" ? item.id : undefined,
                ),
          };
        },
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
