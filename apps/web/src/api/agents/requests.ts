import type { SaveAgentTriggersInput, SetAgentAvatarInput } from "@substrate/contracts/agents";
import type { SaveAgentInput } from "@substrate/contracts/agents";

import { api } from "../client";
import { readResult } from "../result";

export const listAgents = (signal?: AbortSignal) =>
  readResult(api.agents.list.$post({}, { init: { signal } }));
export const saveAgent = (json: SaveAgentInput) =>
  readResult(api.agents.actors.save.$post({ json }));
export const deleteAgent = (id: string) =>
  readResult(api.agents.actors.delete.$post({ json: { id } }));
export const saveAgentTriggers = (json: SaveAgentTriggersInput) =>
  readResult(api.agents.actors.triggers.$post({ json }));
export const setAgentAvatar = (json: SetAgentAvatarInput) =>
  readResult(api.agents.actors.avatar.$post({ json }));
export const setAgentHomeDevice = (id: string) =>
  readResult(api.agents.actors.home.$post({ json: { id } }));
