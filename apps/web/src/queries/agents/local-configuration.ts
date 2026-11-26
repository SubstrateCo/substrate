import type { HarnessKind } from "@substrate/contracts/harness-runtime";

import { queryOptions, skipToken } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import { desktopLocalConfiguration } from "@/lib/desktop/agents/local-configuration";

/**
 * One saved agent's files on this desktop. Skills and MCP servers stay on the agent's home
 * desktop, so only the desktop app that is its home can read them; elsewhere this is `undefined`.
 */
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

/** Reads the agent's files. Without a local configuration the query stays idle. */
export const localConfigurationOptions = (
  userId: string,
  local: LocalAgentConfiguration | undefined,
) =>
  queryOptions({
    queryKey: local?.queryKey ?? queryKeys.localAgentConfigurations(userId),
    queryFn: local ? () => local.controller.scan() : skipToken,
  });
