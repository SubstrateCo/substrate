import type { AgentConfiguration } from "@startup-os/contracts/agents";

export const harnessOptions: {
  value: AgentConfiguration["harness"];
  label: string;
}[] = [
  { value: "opencode", label: "OpenCode" },
  { value: "antigravity", label: "Antigravity" },
  { value: "claude", label: "Claude Code" },
  { value: "codex", label: "Codex" },
];
