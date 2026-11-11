import type { AgentConfiguration } from "@substrate/contracts/agents";

export const harnessOptions: {
  value: AgentConfiguration["harness"];
  label: string;
}[] = [
  { value: "opencode", label: "OpenCode" },
  { value: "antigravity", label: "Antigravity" },
  { value: "claude", label: "Claude Code" },
  { value: "codex", label: "Codex" },
];

export const harnessLabel = (harness: string) =>
  harnessOptions.find((option) => option.value === harness)?.label ?? harness;
