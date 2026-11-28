import type { InteractionSourceEvent } from "@substrate/contracts/calendar";

import { useQuery } from "@tanstack/react-query";

import { interactionSourcesOptions } from "./options";

const none: Record<string, InteractionSourceEvent> = {};

export function useInteractionSources(
  organizationId: string,
  rows: readonly { entityId: string; origin: string }[],
  enabled: boolean,
) {
  const ids = rows.flatMap((row) => (row.origin === "calendar_event" ? [row.entityId] : []));
  const query = useQuery({
    ...interactionSourcesOptions(organizationId, ids),
    enabled: enabled && ids.length > 0,
  });
  return query.data ?? none;
}
