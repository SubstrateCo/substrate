import type { SetAgentAvatarInput } from "@substrate/contracts/agents";

import type { Json } from "./conversations";
import { api } from "@/api/client";
import { readResult } from "@/api/result";

const init = (signal?: AbortSignal) => ({ init: { signal } });

export type SearchInput = Json<typeof api.context.search.$post>;

export const getMessagePage = (
  json: { organizationId: string; messageIds: string[] },
  signal?: AbortSignal,
) => readResult(api.context["message-page"].$post({ json }, init(signal)));
export const searchContext = (json: SearchInput, signal?: AbortSignal) =>
  readResult(api.context.search.$post({ json }, init(signal)));
export const getMessageTarget = (
  query: { organizationId: string; conversationId: string; messageId: string },
  signal?: AbortSignal,
) => readResult(api.context["message-target"].$get({ query }, init(signal)));
export const attachWork = (json: { organizationId: string; messageId: string; entityId: string }) =>
  readResult(api.context.links.$post({ json }));
export const detachWork = (json: { organizationId: string; messageId: string; entityId: string }) =>
  readResult(api.context.links.$delete({ json }));
export const getOrganizationPeople = (query: { organizationId: string }, signal?: AbortSignal) =>
  readResult(api.organizations.people.$get({ query }, init(signal)));
export const listAgents = (signal?: AbortSignal) =>
  readResult(api.agents.list.$post({}, init(signal)));
export const setAgentAvatar = (json: SetAgentAvatarInput) =>
  readResult(api.agents.actors.avatar.$post({ json }));
