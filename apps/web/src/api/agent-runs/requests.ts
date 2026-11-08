import type {
  agentRunInput,
  conversationRunsInput,
  respondRequestInput,
} from "@startup-os/contracts/agent-runs";

import { api, type ApiInput } from "../client";
import { readResult } from "../result";
import type { z } from "zod";

export const listConversationRuns = ({
  data,
  signal,
}: ApiInput<z.input<typeof conversationRunsInput>>) =>
  readResult(api["agent-runs"].conversation.$get({ query: data }, { init: { signal } }));
export const getAgentRun = ({ data, signal }: ApiInput<z.input<typeof agentRunInput>>) =>
  readResult(api["agent-runs"].run.$get({ query: data }, { init: { signal } }));
export const cancelAgentRun = ({ data, signal }: ApiInput<z.input<typeof agentRunInput>>) =>
  readResult(api["agent-runs"].cancel.$post({ json: data }, { init: { signal } }));
export const respondToAgentRequest = ({
  data,
  signal,
}: ApiInput<z.input<typeof respondRequestInput>>) =>
  readResult(api["agent-runs"].respond.$post({ json: data }, { init: { signal } }));
