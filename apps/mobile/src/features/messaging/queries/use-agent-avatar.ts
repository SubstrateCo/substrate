import type { SetAgentAvatarInput } from "@substrate/contracts/agents";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { setAgentAvatar, type listAgents } from "../api/context";
import { messagingKeys } from "../keys";
import { useMessagingScope } from "../scope";
import { useRefreshMessaging } from "./use-refresh-messaging";

type AgentCatalog = Awaited<ReturnType<typeof listAgents>>;

const withAvatar = (catalog: AgentCatalog | undefined, { id, avatar }: SetAgentAvatarInput) =>
  catalog && {
    ...catalog,
    agents: catalog.agents.map((agent) => (agent.id === id ? { ...agent, avatar } : agent)),
  };

export function useSetAgentAvatar(organizationId: string) {
  const scope = useMessagingScope(organizationId);
  const client = useQueryClient();
  const refresh = useRefreshMessaging(organizationId);
  const key = messagingKeys.agents(scope);
  return useMutation({
    mutationFn: (input: SetAgentAvatarInput) => setAgentAvatar(input),
    onMutate: async (input) => {
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<AgentCatalog>(key);
      client.setQueryData<AgentCatalog>(key, (catalog) => withAvatar(catalog, input));
      return { previous };
    },
    onError: (_error, _input, context) => client.setQueryData(key, context?.previous),
    onSuccess: (agent) => {
      client.setQueryData<AgentCatalog>(key, (catalog) => withAvatar(catalog, agent));
      return refresh();
    },
  });
}
