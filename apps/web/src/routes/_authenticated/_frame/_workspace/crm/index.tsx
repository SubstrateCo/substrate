import { createFileRoute } from "@tanstack/react-router";

import { CrmWorkspace } from "@/components/crm/crm-workspace";
import { z } from "zod";

export const Route = createFileRoute("/_authenticated/_frame/_workspace/crm/")({
  component: CrmRoute,
  validateSearch: z.object({
    section: z.enum(["accounts", "deals", "settings"]).optional(),
    recordId: z.uuid().optional(),
  }),
});

function CrmRoute() {
  const { organizationId } = Route.useRouteContext();
  const { section, recordId } = Route.useSearch();
  return (
    <CrmWorkspace
      key={organizationId}
      organizationId={organizationId}
      section={section ?? "deals"}
      recordId={recordId}
    />
  );
}
