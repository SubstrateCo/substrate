import type { SaveSkillInput } from "@substrate/contracts/agents";
import type {
  HarnessLocalConfiguration,
  HarnessMcpServer,
} from "@substrate/contracts/harness-runtime";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { LocalAgentConfiguration } from "./local-configuration";
import type { LocalConfigurationController } from "@/lib/desktop/agents/local-configuration-controller";

type ScannedConfiguration = Pick<HarnessLocalConfiguration, "skills" | "mcpServers">;

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
  /** Shows the server change at once, then reads the stored list again. */
  const updateServers = (change: (servers: HarnessMcpServer[]) => HarnessMcpServer[]) => {
    if (!local) return;
    client.setQueryData<ScannedConfiguration>(local.queryKey, (current) =>
      current ? { ...current, mcpServers: change(current.mcpServers) } : current,
    );
    return client.invalidateQueries({ queryKey: local.queryKey });
  };
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
  const saveServer = useMutation<void, Error, HarnessMcpServer>({
    mutationFn: run((controller, server: HarnessMcpServer) => controller.saveMcpServer(server)),
    onSuccess: (_result, server) =>
      updateServers((servers) =>
        servers.some((entry) => entry.id === server.id)
          ? servers.map((entry) => (entry.id === server.id ? server : entry))
          : [...servers, server],
      ),
  });
  const removeServer = useMutation<void, Error, string>({
    mutationFn: run((controller, id: string) => controller.deleteMcpServer(id)),
    onSuccess: (_result, id) =>
      updateServers((servers) => servers.filter((entry) => entry.id !== id)),
  });
  const chooseWorkspace = useMutation<void, Error, void>({
    mutationFn: run((controller) => controller.chooseWorkspace()),
    onSuccess,
  });
  const clearWorkspace = useMutation<void, Error, void>({
    mutationFn: run((controller) => controller.clearWorkspace()),
    onSuccess,
  });
  return { save, remove, reset, saveServer, removeServer, chooseWorkspace, clearWorkspace };
}
