import type { AgentRunSettings as AgentRunSettingsData } from "@substrate/contracts/agents";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { AgentRunSettingsView } from "./agent-run-settings-view";
import { saveAgentTriggers, setAgentHomeDevice } from "@/api/agents/requests";
import { triggersInput } from "@/lib/agents/triggers";
import { isDesktop } from "@/lib/desktop/auth";
import { queryKeys } from "@/queries/keys";
import { toast } from "sonner";

export function AgentRunSettings({
  userId,
  name,
  settings,
}: {
  userId: string;
  name: string;
  settings: AgentRunSettingsData;
}) {
  const client = useQueryClient();
  const invalidate = () => client.invalidateQueries({ queryKey: queryKeys.agents(userId) });
  const home = useMutation({
    mutationFn: () => setAgentHomeDevice(settings.agentId),
    onSuccess: async () => {
      toast.success(`${name} now runs on this device.`);
      await invalidate();
    },
  });
  const triggers = useMutation({
    mutationFn: saveAgentTriggers,
    // The settings footer shows the save.
    onSuccess: invalidate,
  });
  return (
    <AgentRunSettingsView
      name={name}
      settings={settings}
      canRunHere={isDesktop()}
      moving={home.isPending}
      saving={triggers.isPending}
      error={home.error ?? triggers.error}
      onRunHere={() => home.mutate()}
      onSave={(next) => triggers.mutate(triggersInput(settings.agentId, next))}
    />
  );
}
