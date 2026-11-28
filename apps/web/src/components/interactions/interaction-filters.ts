import type {
  InteractionKind,
  InteractionDirectory,
  InteractionTimeline,
} from "@substrate/contracts/context/interactions";

import { interactionKinds } from "./interaction-types";
import { withClause, type FilterValue } from "@/components/filters";

export type InteractionDays = "7" | "30" | "all";
export type InteractionOrigin = NonNullable<InteractionTimeline["origin"]>;
export type InteractionScope = NonNullable<InteractionTimeline["scope"]>;
export type InteractionLoggedBy = "me" | "anyone";
export type InteractionFilterId =
  | "period"
  | "loggedBy"
  | "type"
  | "origin"
  | "frequency"
  | "scope"
  | "sourceCalendar"
  | "count";

export type InteractionFilters = {
  days: InteractionDays;
  loggedBy?: InteractionLoggedBy;
  kind?: InteractionKind;
  origin?: InteractionOrigin;
  repeat?: boolean;
  scope?: InteractionScope;
  sourceCalendarEntityId?: string;
  countOperator?: InteractionDirectory["countOperator"];
  count?: number;
  countUntil?: number;
};

const interactionDays = ["7", "30", "all"] as const;
const interactionLoggedBy = ["me", "anyone"] as const;
const interactionOriginValues = ["manual", "message_publication", "calendar_event"] as const;
const interactionScopes = ["related", "linked"] as const;
const countOperators = ["less than", "equal to", "greater than", "between"] as const;

function choice<T extends string>(
  value: FilterValue<InteractionFilterId>,
  id: InteractionFilterId,
  allowed: readonly T[],
) {
  const chosen = value[id]?.values[0];
  return allowed.find((candidate) => candidate === chosen);
}

export function interactionFilterValue(
  filters: InteractionFilters,
): FilterValue<InteractionFilterId> {
  const is = (chosen: string | undefined) =>
    chosen ? { operator: "is" as const, values: [chosen] } : undefined;
  let value = withClause<InteractionFilterId>({}, "period", is(filters.days));
  value = withClause(value, "loggedBy", is(filters.loggedBy));
  value = withClause(value, "type", is(filters.kind));
  value = withClause(value, "origin", is(filters.origin));
  value = withClause(value, "frequency", is(filters.repeat ? "repeat" : undefined));
  value = withClause(value, "sourceCalendar", is(filters.sourceCalendarEntityId));
  value = withClause(
    value,
    "count",
    filters.countOperator && filters.count !== undefined
      ? {
          operator: filters.countOperator,
          values: [
            String(filters.count),
            ...(filters.countUntil !== undefined ? [String(filters.countUntil)] : []),
          ],
        }
      : undefined,
  );
  return withClause(value, "scope", is(filters.scope));
}

export function interactionFiltersFrom(
  value: FilterValue<InteractionFilterId>,
  current: InteractionFilters,
): InteractionFilters {
  return {
    days: choice(value, "period", interactionDays) ?? current.days,
    loggedBy: choice(value, "loggedBy", interactionLoggedBy) ?? current.loggedBy,
    kind: choice(value, "type", interactionKinds),
    origin: choice(value, "origin", interactionOriginValues),
    repeat: value.frequency?.values[0] === "repeat",
    scope: choice(value, "scope", interactionScopes) ?? current.scope,
    sourceCalendarEntityId: value.sourceCalendar?.values[0],
    countOperator: countOperators.find((operator) => operator === value.count?.operator),
    count: value.count ? Number(value.count.values[0]) : undefined,
    countUntil: value.count?.operator === "between" ? Number(value.count.values[1]) : undefined,
  };
}
