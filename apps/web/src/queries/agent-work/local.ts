import type { TurnEventView } from "@substrate/contracts/agent-work";
import { turnEventsPageSize } from "@substrate/contracts/agent-work/desktop";

import { queryOptions, skipToken } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import { agentWorkBridge, hasAgentWorkBridge } from "./bridge";

// Transcripts and the agents homed here come from the bridge on the agent's home desktop. The
// bridge sends change hints (see sync.ts), so these reads do not poll.

/**
 * Whether local reads can run here: only on a desktop with the bridge, for a signed-in owner.
 * Callers that narrow `enabled` further combine it with this check.
 */
export const localWorkEnabled = (userId: string) => hasAgentWorkBridge() && !!userId;

// The bridge answers from local storage, so a failed read does not retry.
const localRead = (userId: string) => ({ enabled: localWorkEnabled(userId), retry: false });

/** The agents whose home is this desktop, with the server turns it runs for them now. */
export const homedAgentsOptions = (userId: string, organizationId: string) =>
  queryOptions({
    queryKey: queryKeys.agentWorkHomed(userId, organizationId),
    queryFn: () => agentWorkBridge().homedAgents(),
    ...localRead(userId),
  });

/** The attempts of a server turn that ran on this desktop. Empty for turns that ran elsewhere. */
export const turnRunsOptions = (userId: string, organizationId: string, turnId: string) =>
  queryOptions({
    queryKey: queryKeys.agentWorkTurnRuns(userId, organizationId, turnId),
    queryFn: () => agentWorkBridge().turnRuns(turnId),
    ...localRead(userId),
  });

/**
 * Every event of a turn, oldest first. The bridge returns one page per call, and a turn's events
 * are only appended, so a refetch reads the pages after the cached events.
 */
export async function loadTurnEvents(
  read: (after: number) => Promise<TurnEventView[]>,
  cached: TurnEventView[] = [],
  signal?: AbortSignal,
) {
  const events = [...cached];
  for (;;) {
    signal?.throwIfAborted();
    const page = await read(events.at(-1)?.seq ?? 0);
    signal?.throwIfAborted();
    events.push(...page);
    if (page.length < turnEventsPageSize) return events;
  }
}

export const turnEventsOptions = (userId: string, organizationId: string, turnId?: string) =>
  queryOptions({
    queryKey: queryKeys.agentWorkTurnEvents(userId, organizationId, turnId ?? ""),
    queryFn: turnId
      ? ({ client, queryKey, signal }) =>
          loadTurnEvents(
            (after) => agentWorkBridge().turnEvents(turnId, after),
            client.getQueryData<TurnEventView[]>(queryKey),
            signal,
          )
      : skipToken,
    ...localRead(userId),
  });
