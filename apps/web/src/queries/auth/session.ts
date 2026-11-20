import { queryOptions } from "@tanstack/react-query";

import { getSession } from "@/api/auth/session";
import { queryKeys } from "@/queries/keys";

export const sessionQueryOptions = (load: typeof getSession = getSession) =>
  queryOptions({
    queryKey: queryKeys.session,
    queryFn: ({ signal }) => load(signal),
    staleTime: 0,
    retry: false,
  });
