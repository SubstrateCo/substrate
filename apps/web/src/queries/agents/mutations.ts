import type { AgentCatalog, SetAgentAvatarInput } from "@substrate/contracts/agents";

import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";

import {
  deleteAgent,
  saveAgent,
  saveAgentTriggers,
  setAgentAvatar,
  setAgentHomeDevice,
} from "@/api/agents/requests";
import { queryKeys } from "@/queries/keys";

export function useAgentMutations(userId: string) {
  const client = useQueryClient();
  const onSuccess = () => client.invalidateQueries({ queryKey: queryKeys.agents(userId) });
  const save = useMutation({ mutationFn: saveAgent, onSuccess });
  const remove = useMutation({ mutationFn: deleteAgent, onSuccess });
  return { save, remove };
}

export function useAgentRunSettingsMutations(userId: string, agentId: string) {
  const client = useQueryClient();
  const onSuccess = () => client.invalidateQueries({ queryKey: queryKeys.agents(userId) });
  const home = useMutation({ mutationFn: () => setAgentHomeDevice(agentId), onSuccess });
  const triggers = useMutation({ mutationFn: saveAgentTriggers, onSuccess });
  return { home, triggers };
}

/** The catalog with one agent's avatar replaced. */
function withAgentAvatar(catalog: AgentCatalog | undefined, { id, avatar }: SetAgentAvatarInput) {
  if (!catalog) return catalog;
  return {
    ...catalog,
    agents: catalog.agents.map((agent) => (agent.id === id ? { ...agent, avatar } : agent)),
  };
}

/**
 * Saves an agent's new look. The owner's catalog shows it at once and rolls back on failure.
 * Messages, members, reactions, pickers, tasks, and notifications in every workspace carry the
 * avatar too, so the settle refreshes all cached queries. Looks change rarely.
 */
export function agentAvatarMutationOptions(client: QueryClient, userId: string) {
  const key = queryKeys.agents(userId);
  return {
    // Saves run one at a time, so the last choice is the one the server keeps.
    scope: { id: `agent-avatar:${userId}` },
    mutationFn: setAgentAvatar,
    onMutate: async (input: SetAgentAvatarInput) => {
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<AgentCatalog>(key);
      client.setQueryData<AgentCatalog>(key, (catalog) => withAgentAvatar(catalog, input));
      return { previous };
    },
    onError: (
      _error: Error,
      _input: SetAgentAvatarInput,
      context: { previous?: AgentCatalog } | undefined,
    ) => {
      if (context?.previous) client.setQueryData(key, context.previous);
    },
    onSettled: () => client.invalidateQueries(),
  };
}

export function useAgentAvatarMutation(userId: string) {
  return useMutation(agentAvatarMutationOptions(useQueryClient(), userId));
}
