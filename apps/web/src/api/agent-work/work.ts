import type {
  AgentActivityView,
  AgentConversationWorkView,
  AgentItemCommandResult,
  AgentTurnCommandResult,
  AgentWorkTurnView,
} from "@substrate/contracts/agent-work";
import type { ApiInput } from "@substrate/contracts/http-result";

import { api } from "../client";
import { readResult } from "../result";

const routes = api["agent-work"];

/**
 * Reads a route whose result holds turn usage. Hono's parsed JSON of the harness usage type is
 * too deep for the type checker to compare, so the caller names the result.
 */
const read = <T>(response: Promise<unknown>) =>
  // SAFETY: each caller names the contract type its route returns.
  readResult<T>(response as Promise<never>);

type Scoped<T = object> = ApiInput<T & { organizationId: string }>;

export const getAgentActivity = ({
  data: { agentId, organizationId, cursor },
  signal,
}: Scoped<{ agentId: string; cursor?: string }>): Promise<AgentActivityView> =>
  read<AgentActivityView>(
    routes.agents[":id"].activity.$get(
      // The client leaves an undefined cursor out of the query string.
      { param: { id: agentId }, query: { organizationId, cursor } },
      { init: { signal } },
    ),
  );

export const getConversationWork = ({
  data: { conversationId, organizationId },
  signal,
}: Scoped<{ conversationId: string }>): Promise<AgentConversationWorkView> =>
  read<AgentConversationWorkView>(
    routes.conversations[":id"].work.$get(
      { param: { id: conversationId }, query: { organizationId } },
      { init: { signal } },
    ),
  );

export const getTurn = ({
  data: { turnId, organizationId },
  signal,
}: Scoped<{ turnId: string }>): Promise<AgentWorkTurnView> =>
  read<AgentWorkTurnView>(
    routes.turns[":id"].$get(
      { param: { id: turnId }, query: { organizationId } },
      { init: { signal } },
    ),
  );

export type TurnCommand = "stop" | "retry" | "dismiss" | "start-fresh";
export type ItemCommand = "send-now" | "resend" | "discard";

export const runTurnCommand = ({
  data: { turnId, command, organizationId },
  signal,
}: Scoped<{ turnId: string; command: TurnCommand }>): Promise<AgentTurnCommandResult> =>
  read<AgentTurnCommandResult>(
    routes.turns[":id"][command].$post(
      { param: { id: turnId }, json: { organizationId } },
      { init: { signal } },
    ),
  );

export const runItemCommand = ({
  data: { itemId, command, organizationId },
  signal,
}: Scoped<{ itemId: string; command: ItemCommand }>): Promise<AgentItemCommandResult> =>
  read<AgentItemCommandResult>(
    routes.items[":id"][command].$post(
      { param: { id: itemId }, json: { organizationId } },
      { init: { signal } },
    ),
  );
