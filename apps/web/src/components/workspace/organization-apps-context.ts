import type { AppId } from "@substrate/contracts/apps";

import { createContext, useContext } from "react";

export const AppsContext = createContext<{
  enabled: (app: AppId) => boolean;
  entityEnabled: (type: string) => boolean;
  ready: boolean;
  error: Error | null;
  retry: () => void;
}>({
  enabled: () => false,
  entityEnabled: () => false,
  ready: false,
  error: null,
  retry: () => {},
});

export const useOrganizationApps = () => useContext(AppsContext);
