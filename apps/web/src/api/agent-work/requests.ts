import type {
  AgentNeedsYou,
  AgentRequestView,
  AgentStatusView,
  conversationRequestsInput,
  decideProposalInput,
  ownerScopeInput,
  respondRequestInput,
} from "@startup-os/contracts/agent-work";

import { api, type ApiInput } from "../client";
import { readResult } from "../result";
import type { z } from "zod";

// The owner's routes. The server scopes every read to the caller's own agents and to what the
// caller can see now; hidden places carry no names.
const routes = api["agent-work"];

export const listConversationRequests = ({
  data,
  signal,
}: ApiInput<z.input<typeof conversationRequestsInput>>): Promise<AgentRequestView[]> =>
  readResult(routes.requests.$get({ query: data }, { init: { signal } }));

export const getNeedsYou = ({
  data,
  signal,
}: ApiInput<z.input<typeof ownerScopeInput>>): Promise<AgentNeedsYou> =>
  readResult(routes["needs-you"].$get({ query: data }, { init: { signal } }));

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
