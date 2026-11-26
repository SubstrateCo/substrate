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

/**
 * Harnesses to offer: the detected ones, plus the agent's current harness so its setting stays
 * visible. Before the desktop reports detection, every harness is offered.
 */
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
