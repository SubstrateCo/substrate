import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import { searchContext } from "@/api/context/search";

export type SearchInput = Parameters<typeof searchContext>[0]["data"];
export const searchOptions = (input: SearchInput) =>
  queryOptions({
    queryKey: [...queryKeys.context(input.organizationId), "search", input],
    queryFn: ({ signal }) => searchContext({ data: input, signal }),
    retry: false,
  });

export const searchPagesOptions = (input: Omit<SearchInput, "after" | "limit">) =>
  infiniteQueryOptions({
    queryKey: [...queryKeys.context(input.organizationId), "search-pages", input],
    // SAFETY: The first page has no cursor; later pages use result IDs.
    initialPageParam: undefined as string | undefined,
    queryFn: ({ signal, pageParam }) =>
      searchContext({ data: { ...input, after: pageParam, limit: 30 }, signal }),
    getNextPageParam: (lastPage) => (lastPage.length === 30 ? lastPage.at(-1)?.id : undefined),
    retry: false,
  });
