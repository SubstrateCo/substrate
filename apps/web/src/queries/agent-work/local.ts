import type { TurnEventView } from "@substrate/contracts/agent-work";
import { turnEventsPageSize } from "@substrate/contracts/agent-work/desktop";

import { queryOptions, skipToken } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import { agentWorkBridge, hasAgentWorkBridge } from "./bridge";

export const localWorkEnabled = (userId: string) => hasAgentWorkBridge() && !!userId;

const localRead = (userId: string) => ({ enabled: localWorkEnabled(userId), retry: false });

export const homedAgentsOptions = (userId: string, organizationId: string) =>
  queryOptions({
    queryKey: queryKeys.agentWorkHomed(userId, organizationId),
    queryFn: () => agentWorkBridge().homedAgents(),
    ...localRead(userId),
  });

export const turnRunsOptions = (userId: string, organizationId: string, turnId: string) =>
  queryOptions({
    queryKey: queryKeys.agentWorkTurnRuns(userId, organizationId, turnId),
    queryFn: () => agentWorkBridge().turnRuns(turnId),
    ...localRead(userId),
  });

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
