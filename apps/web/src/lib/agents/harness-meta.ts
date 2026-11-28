import type { AgentConfiguration } from "@substrate/contracts/agents";
import type { HarnessInspection } from "@substrate/contracts/harness-runtime";

export const harnessOptions: {
  value: AgentConfiguration["harness"];
  label: string;
}[] = [
  { value: "opencode", label: "OpenCode" },
  { value: "claude", label: "Claude Code" },
  { value: "codex", label: "Codex" },
];

export const harnessLabel = (harness: string) =>
  harnessOptions.find((option) => option.value === harness)?.label ?? harness;

export function visibleHarnessOptions(
  inspections: HarnessInspection[] | undefined,
  current: AgentConfiguration["harness"],
) {
  if (!inspections) return harnessOptions;
  return harnessOptions.filter(
    (option) =>
      option.value === current ||
      inspections.some((entry) => entry.harness === option.value && entry.available),
  );
}
