import type { SaveSkillInput } from "@substrate/contracts/agents";
import type { HarnessKind } from "@substrate/contracts/harness";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { desktopLocalConfiguration } from "@/lib/desktop/agents/local-configuration";
import { queryKeys } from "@/queries/keys";

export function useAgentConfigurationMutations(
  userId: string,
  organizationId: string | null | undefined,
  agentId: string | undefined,
  harness: HarnessKind,
) {
  const client = useQueryClient();
  const key = queryKeys.localAgentConfiguration(
    userId,
    organizationId ?? "",
    agentId ?? "",
    harness,
  );
  const controller = () => {
    const configuration = desktopLocalConfiguration(harness, agentId);
    if (!configuration || !organizationId)
      throw new Error("Select a workspace in the desktop app.");
    return configuration;
  };
  const onSuccess = () => client.invalidateQueries({ queryKey: key });
  const save = useMutation({
    mutationFn: (input: SaveSkillInput) => controller().saveSkill(input),
    onSuccess,
  });
  const remove = useMutation({
    mutationFn: (id: string) => controller().deleteSkill(id),
    onSuccess,
  });
  const reset = useMutation({
    mutationFn: () => controller().resetDefaults(),
    onSuccess,
  });
  return { save, remove, reset };
}
