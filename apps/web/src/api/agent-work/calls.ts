import type {
  AgentAuditEventView,
  AgentCallStatusView,
  DecideInvocationInput,
} from "@substrate/contracts/agent-work";
import type { AgentCallers, AgentCallerPolicy } from "@substrate/contracts/agents";
import type { ApiInput } from "@substrate/contracts/http-result";

import { api } from "../client";
import { readResult } from "../result";

type AgentScope = { organizationId: string; agentId: string };
const callers = api.agents.actors.callers;
const work = api["agent-work"];

export const getCallers = ({ data, signal }: ApiInput<AgentScope>): Promise<AgentCallers> =>
  readResult(callers.list.$post({ json: data }, { init: { signal } }));
export const saveCallerPolicy = ({
  data,
  signal,
}: ApiInput<AgentScope & { policy: AgentCallerPolicy }>): Promise<void> =>
  readResult(callers.policy.$post({ json: data }, { init: { signal } })).then(() => undefined);
export const removeCaller = ({
  data,
  signal,
}: ApiInput<AgentScope & { callerActorId: string }>): Promise<void> =>
  readResult(callers.remove.$post({ json: data }, { init: { signal } })).then(() => undefined);
export const decideCall = ({
  data: { invocationId, ...json },
  signal,
}: ApiInput<DecideInvocationInput & { invocationId: string }>): Promise<void> =>
  readResult(
    work.invocations[":id"].decide.$post(
      { param: { id: invocationId }, json },
      { init: { signal } },
    ),
  ).then(() => undefined);
export const getCallsLog = ({
  data,
  signal,
}: ApiInput<{ organizationId: string; userAgentId: string }>): Promise<AgentAuditEventView[]> =>
  readResult(work.calls.$get({ query: data }, { init: { signal } }));
export const getMyCalls = ({
  data,
  signal,
}: ApiInput<{ organizationId: string; conversationId: string }>): Promise<AgentCallStatusView[]> =>
  readResult(work.calls.mine.$get({ query: data }, { init: { signal } }));
