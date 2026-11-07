import { queryOptions } from "@tanstack/react-query";

import { getSession } from "@/api/auth/session";
import { queryKeys } from "@/queries/keys";

export const sessionQueryOptions = () =>
  queryOptions({
    queryKey: queryKeys.session,
    queryFn: ({ signal }) => getSession(signal),
    staleTime: 0,
    retry: false,
  });
