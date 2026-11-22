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
    profileId: z.uuid().optional(),
    recordId: z.uuid().optional(),
    tab: z.enum(["activity", "map"]).optional(),
  }),
  component: InteractionsRoute,
});

function InteractionsRoute() {
  const { organizationId } = Route.useRouteContext();
  const { section, days, profileId, recordId, tab } = Route.useSearch();
  return (
    <InteractionsWorkspace
      key={organizationId}
      organizationId={organizationId}
      section={section}
      days={days}
      profileId={profileId}
      recordId={recordId}
      tab={tab}
    />
  );
}
