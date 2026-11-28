import { createFileRoute } from "@tanstack/react-router";

import { InteractionsWorkspace } from "@/components/interactions/interactions-workspace";
import { z } from "zod";

export const Route = createFileRoute("/_authenticated/_frame/_workspace/interactions/")({
  validateSearch: z.object({
    section: z
      .enum(["dashboard", "timeline", "people", "accounts", "person", "account"])
      .optional()
      .default("dashboard"),
    days: z.enum(["7", "30", "all"]).optional().default("30"),
    /** The dashboard opens on the signed-in user's own interactions. */
    loggedBy: z.enum(["me", "anyone"]).optional().default("me"),
    profileId: z.uuid().optional(),
    recordId: z.uuid().optional(),
    tab: z.enum(["activity", "map"]).optional(),
  }),
  component: InteractionsRoute,
});

function InteractionsRoute() {
  const { section, days, loggedBy, profileId, recordId, tab } = Route.useSearch();
  return (
    <InteractionsWorkspace
      section={section}
      days={days}
      loggedBy={loggedBy}
      profileId={profileId}
      recordId={recordId}
      tab={tab}
    />
  );
}
