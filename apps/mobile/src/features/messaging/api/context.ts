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
/** A linked message and its thread root, if the viewer can read it. */
export const getMessageTarget = (
  query: { organizationId: string; conversationId: string; messageId: string },
  signal?: AbortSignal,
) => readResult(api.context["message-target"].$get({ query }, init(signal)));
/** Links an existing record to a message. The server needs edit access to the record. */
export const attachWork = (json: { organizationId: string; messageId: string; entityId: string }) =>
  readResult(api.context.links.$post({ json }));
/** Unlinks a record from a message. Mentions and records created from it stay. */
export const detachWork = (json: { organizationId: string; messageId: string; entityId: string }) =>
  readResult(api.context.links.$delete({ json }));
export const getOrganizationPeople = (query: { organizationId: string }, signal?: AbortSignal) =>
  readResult(api.organizations.people.$get({ query }, init(signal)));
export const listAgents = (signal?: AbortSignal) =>
  readResult(api.agents.list.$post({}, init(signal)));
/** Sets the owner's body and colour choices for an agent. Null keeps the generated choice. */
export const setAgentAvatar = (json: SetAgentAvatarInput) =>
  readResult(api.agents.actors.avatar.$post({ json }));
