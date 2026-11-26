import type {
  InteractionKind,
  InteractionTimeline,
} from "@substrate/contracts/context/interactions";

import { interactionKinds } from "./interaction-types";
import { withClause, type FilterValue } from "@/components/filters";

/** The activity period in the URL: the last 7 or 30 days, or all time. */
export type InteractionDays = "7" | "30" | "all";
export type InteractionOrigin = NonNullable<InteractionTimeline["origin"]>;
export type InteractionScope = NonNullable<InteractionTimeline["scope"]>;
export type InteractionFilterId = "period" | "type" | "origin" | "frequency" | "scope";

/** The filters one surface shows. A field the surface does not show stays unset. */
export type InteractionFilters = {
  days: InteractionDays;
  kind?: InteractionKind;
  origin?: InteractionOrigin;
  /** Only records with two or more interactions. */
  repeat?: boolean;
  scope?: InteractionScope;
};

export const interactionDays = ["7", "30", "all"] as const;
export const interactionOriginValues = ["manual", "message_publication", "calendar_event"] as const;
export const interactionScopes = ["related", "linked"] as const;

function choice<T extends string>(
  value: FilterValue<InteractionFilterId>,
  id: InteractionFilterId,
  allowed: readonly T[],
) {
  const chosen = value[id]?.values[0];
  return allowed.find((candidate) => candidate === chosen);
}

/** The filters as filter-bar clauses. Unset optional filters have none. */
export function interactionFilterValue(
  filters: InteractionFilters,
): FilterValue<InteractionFilterId> {
  const is = (chosen: string | undefined) =>
    chosen ? { operator: "is" as const, values: [chosen] } : undefined;
  let value = withClause<InteractionFilterId>({}, "period", is(filters.days));
  value = withClause(value, "type", is(filters.kind));
  value = withClause(value, "origin", is(filters.origin));
  value = withClause(value, "frequency", is(filters.repeat ? "repeat" : undefined));
  return withClause(value, "scope", is(filters.scope));
}

/**
 * The filters read from filter-bar clauses. Values the data layer does not support are dropped.
 * The period and scope are required, so a missing one keeps the `current` choice.
 */
export function interactionFiltersFrom(
  value: FilterValue<InteractionFilterId>,
  current: InteractionFilters,
): InteractionFilters {
  return {
    days: choice(value, "period", interactionDays) ?? current.days,
    kind: choice(value, "type", interactionKinds),
    origin: choice(value, "origin", interactionOriginValues),
    repeat: value.frequency?.values[0] === "repeat",
    scope: choice(value, "scope", interactionScopes) ?? current.scope,
  };
}
