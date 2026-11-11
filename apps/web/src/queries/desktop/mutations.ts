import type { DesktopSettingsAPI } from "@substrate/contracts/desktop/window";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "../keys";

export function useDesktopSettingsUpdate(bridge: DesktopSettingsAPI) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => bridge.setLaunchAtLogin(enabled),
    onSuccess: (next) => client.setQueryData(queryKeys.desktopSettings, next),
  });
}
