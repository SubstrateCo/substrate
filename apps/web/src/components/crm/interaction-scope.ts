import type { CrmTimelineMode } from "@substrate/contracts/crm/input";

import type { FilterValue } from "@/components/filters";

export type InteractionScopeFieldId = "scope";

const modes: readonly CrmTimelineMode[] = ["linked", "participants"];

export function interactionScopeValue(mode: CrmTimelineMode): FilterValue<InteractionScopeFieldId> {
  return { scope: { operator: "is", values: [mode] } };
}

export function interactionScopeMode(
  value: FilterValue<InteractionScopeFieldId>,
  current: CrmTimelineMode,
): CrmTimelineMode {
  return modes.find((mode) => mode === value.scope?.values[0]) ?? current;
}
