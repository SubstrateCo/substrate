import type { DesktopSettingsAPI } from "@substrate/contracts/desktop/window";

import { queryOptions } from "@tanstack/react-query";

import { queryKeys } from "../keys";

export const desktopSettingsQueryOptions = (bridge: DesktopSettingsAPI) =>
  queryOptions({
    queryKey: queryKeys.desktopSettings,
    queryFn: () => bridge.get(),
    staleTime: 0,
    retry: false,
  });
