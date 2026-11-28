import type { HarnessKind } from "@substrate/contracts/harness-runtime";

import { queryOptions, skipToken } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import { desktopLocalConfiguration } from "@/lib/desktop/agents/local-configuration";

export function localAgentConfiguration(
  userId: string,
  organizationId: string,
  agentId: string | undefined,
  harness: HarnessKind,
  homedHere: boolean,
) {
  if (!homedHere) return undefined;
  const controller = desktopLocalConfiguration(harness, agentId);
  if (!controller || !agentId) return undefined;
  return {
    controller,
    queryKey: queryKeys.localAgentConfiguration(userId, organizationId, agentId, harness),
  };
}

export type LocalAgentConfiguration = NonNullable<ReturnType<typeof localAgentConfiguration>>;

export const localConfigurationOptions = (
  userId: string,
  local: LocalAgentConfiguration | undefined,
) =>
  queryOptions({
    queryKey: local?.queryKey ?? queryKeys.localAgentConfigurations(userId),
    queryFn: local ? () => local.controller.scan() : skipToken,
  });
