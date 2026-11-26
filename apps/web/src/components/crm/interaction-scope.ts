import type { CrmTimelineMode } from "@substrate/contracts/crm/input";

import type { FilterValue } from "@/components/filters";

export type InteractionScopeFieldId = "scope";

const modes: readonly CrmTimelineMode[] = ["linked", "participants"];

/** The timeline mode as the required Scope clause. */
export function interactionScopeValue(mode: CrmTimelineMode): FilterValue<InteractionScopeFieldId> {
  return { scope: { operator: "is", values: [mode] } };
}

/** The mode a filter-bar value chooses. Scope is required, so a missing or unknown value keeps `current`. */
export function interactionScopeMode(
  value: FilterValue<InteractionScopeFieldId>,
  current: CrmTimelineMode,
): CrmTimelineMode {
  return modes.find((mode) => mode === value.scope?.values[0]) ?? current;
}
