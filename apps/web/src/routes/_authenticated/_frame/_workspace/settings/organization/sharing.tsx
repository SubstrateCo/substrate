import { createFileRoute } from "@tanstack/react-router";

import { SharingSettings } from "@/components/messaging/sharing/sharing-settings";

export const Route = createFileRoute(
  "/_authenticated/_frame/_workspace/settings/organization/sharing",
)({
  component: Section,
});

function Section() {
  const { organizationSettings } = Route.useRouteContext();
  return <SharingSettings organizationId={organizationSettings.organizationId} />;
}
