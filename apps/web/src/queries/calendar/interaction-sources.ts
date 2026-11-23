import type { InteractionSourceEvent } from "@substrate/contracts/calendar";

import { useQuery } from "@tanstack/react-query";

import { interactionSourcesOptions } from "./options";

const none: Record<string, InteractionSourceEvent> = {};

/**
 * The meetings behind a list's calendar interactions, read in one request. Interactions from other
 * origins, or from meetings the viewer cannot read, have no entry.
 */
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
