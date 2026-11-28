import type {
  AgentNeedsYou,
  AgentStatusView,
  decideProposalInput,
  ownerScopeInput,
  respondRequestInput,
} from "@substrate/contracts/agent-work";
import type { ApiInput } from "@substrate/contracts/http-result";

import { api } from "../client";
import { readResult } from "../result";
import type { z } from "zod";

const routes = api["agent-work"];

/**
 * Reads a route whose result holds proposals. Comparing Hono's parsed JSON with the recursive
 * JSON of a stored tool input is too deep for the type checker, so the caller names the result.
 */
const readProposals = <T>(response: Promise<unknown>) =>
  // SAFETY: each caller names the contract type its route returns.
  readResult<T>(response as Promise<never>);

export const getNeedsYou = ({
  data,
  signal,
}: ApiInput<z.input<typeof ownerScopeInput>>): Promise<AgentNeedsYou> =>
  readProposals<AgentNeedsYou>(routes["needs-you"].$get({ query: data }, { init: { signal } }));

export const listAgentStatus = ({
  data,
  signal,
}: ApiInput<z.input<typeof ownerScopeInput>>): Promise<AgentStatusView[]> =>
  readResult(routes.status.$get({ query: data }, { init: { signal } }));

type RequestAction<T> = ApiInput<T & { requestId: string }>;

const decideProposal =
  (decision: "approve" | "decline") =>
  ({
    data: { requestId, ...json },
    signal,
  }: RequestAction<z.input<typeof decideProposalInput>>): Promise<void> =>
    readResult(
      routes.requests[":id"][decision].$post(
        { param: { id: requestId }, json },
        { init: { signal } },
      ),
    ).then(() => undefined);

export const respondToRequest = ({
  data: { requestId, ...json },
  signal,
}: RequestAction<z.input<typeof respondRequestInput>>): Promise<void> =>
  readResult(
    routes.requests[":id"].respond.$post({ param: { id: requestId }, json }, { init: { signal } }),
  ).then(() => undefined);

export const approveProposal = decideProposal("approve");
export const declineProposal = decideProposal("decline");
