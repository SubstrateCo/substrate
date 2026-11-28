import { infiniteQueryOptions, queryOptions, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import { useConversationManagement } from "../messaging/management";
import { searchContext } from "@/api/context/search";

export type SearchInput = Parameters<typeof searchContext>[0]["data"];
export const searchOptions = (input: SearchInput) =>
  queryOptions({
    queryKey: [...queryKeys.search(input.organizationId), input],
    queryFn: ({ signal }) => searchContext({ data: input, signal }),
    retry: false,
  });

export const searchPagesOptions = (input: Omit<SearchInput, "after" | "limit">) =>
  infiniteQueryOptions({
    queryKey: [...queryKeys.searchPages(input.organizationId), input],
    // SAFETY: The first page has no cursor; later pages use result IDs.
    initialPageParam: undefined as string | undefined,
    queryFn: ({ signal, pageParam }) =>
      searchContext({ data: { ...input, after: pageParam, limit: 30 }, signal }),
    getNextPageParam: (lastPage) => (lastPage.length === 30 ? lastPage.at(-1)?.id : undefined),
    retry: false,
  });

export function useJoinSearchConversation(input: Omit<SearchInput, "after" | "limit">) {
  const client = useQueryClient();
  const { join } = useConversationManagement(input.organizationId);
  const pages = searchPagesOptions(input);
  return {
    ...join,
    mutate: (conversationId: string, options?: { onError: (error: Error) => void }) =>
      join.mutate(conversationId, {
        ...options,
        onSuccess: () =>
          client.setQueryData(
            pages.queryKey,
            (data) =>
              data && {
                ...data,
                pages: data.pages.map((page) =>
                  page.map((item) =>
                    item.conversationId === conversationId && item.membership
                      ? { ...item, membership: "joined" as const }
                      : item,
                  ),
                ),
              },
          ),
      }),
  };
}
