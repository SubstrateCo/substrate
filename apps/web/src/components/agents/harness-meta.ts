import type { AgentConfiguration } from "@startup-os/contracts/agents";

export const harnessOptions: {
  value: AgentConfiguration["harness"];
  label: string;
  description: string;
  modelHint: string;
}[] = [
  {
    value: "opencode",
    label: "OpenCode",
    description: "Use your installed OpenCode harness and its native provider sign-in.",
    modelHint: "Optional provider/model ID",
  },
  {
    value: "antigravity",
    label: "Antigravity",
    description: "Use your installed Antigravity harness and its native account sign-in.",
    modelHint: "Optional Antigravity model ID",
  },
  {
    value: "claude",
    label: "Claude Code",
    description: "Use your installed Claude Code harness and its native sign-in.",
    modelHint: "Optional Claude model ID or alias",
  },
  {
    value: "codex",
    label: "Codex",
    description: "Use your installed Codex harness and its native sign-in.",
    modelHint: "Optional Codex model ID",
  },
];
