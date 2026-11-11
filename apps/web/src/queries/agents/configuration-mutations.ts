import type { SaveSkillInput } from "@substrate/contracts/agents";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { LocalAgentConfiguration } from "./local-configuration";
import type { LocalConfigurationController } from "@/lib/desktop/agents/local-configuration-controller";

export function useAgentConfigurationMutations(local: LocalAgentConfiguration | undefined) {
  const client = useQueryClient();
  const run =
    <T, R>(action: (controller: LocalConfigurationController, input: T) => Promise<R>) =>
    (input: T) => {
      if (!local) throw new Error("Select a workspace in the desktop app.");
      return action(local.controller, input);
    };
  // Mutations succeed only with a local configuration.
  const onSuccess = () => local && client.invalidateQueries({ queryKey: local.queryKey });
  const save = useMutation({
    mutationFn: run((controller, input: SaveSkillInput) => controller.saveSkill(input)),
    onSuccess,
  });
  const remove = useMutation({
    mutationFn: run((controller, id: string) => controller.deleteSkill(id)),
    onSuccess,
  });
  const reset = useMutation({
    mutationFn: run((controller) => controller.resetDefaults()),
    onSuccess,
  });
  return { save, remove, reset };
}
