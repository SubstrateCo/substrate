import type { AgentTriggerSetting, SaveAgentTriggersInput } from "@substrate/contracts/agents";

export function triggersInput(
  agentId: string,
  triggers: readonly AgentTriggerSetting[],
): SaveAgentTriggersInput {
  return {
    agentId,
    triggers: triggers.map((trigger) => ({ kind: trigger.kind, enabled: trigger.enabled })),
  };
}

export function homeDeviceLabel(
  device: { name: string; online: boolean; current: boolean } | null,
) {
  if (!device) return "No desktop yet";
  if (device.current) return `${device.name} (this device)`;
  return `${device.name} (${device.online ? "online" : "offline"})`;
}
