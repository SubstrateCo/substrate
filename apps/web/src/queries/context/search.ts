import { queryOptions } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import { searchContext } from "@/api/context/search";

export type SearchInput = Parameters<typeof searchContext>[0]["data"];
export const searchOptions = (input: SearchInput) =>
  queryOptions({
    queryKey: [...queryKeys.context(input.organizationId), "search", input],
    queryFn: ({ signal }) => searchContext({ data: input, signal }),
    retry: false,
  });
