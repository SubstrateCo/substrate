import { queryOptions } from "@tanstack/react-query";

import { getDesktopRelease } from "@/api/desktop/release";
import { queryKeys } from "@/queries/keys";

export const desktopReleaseQueryOptions = () =>
  queryOptions({
    queryKey: queryKeys.desktopRelease,
    queryFn: ({ signal }) => getDesktopRelease(signal),
    staleTime: 60_000,
  });
