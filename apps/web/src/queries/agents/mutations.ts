import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  deleteAgent,
  saveAgent,
  saveAgentTriggers,
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
