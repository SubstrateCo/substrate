import { createFileRoute } from "@tanstack/react-router";

import { ManagedConversations } from "@/components/organizations/settings/managed-conversations";

export const Route = createFileRoute(
  "/_authenticated/_frame/_workspace/settings/organization/conversations",
)({
  component: Section,
});

function Section() {
  const { organizationSettings } = Route.useRouteContext();
  return <ManagedConversations organizationId={organizationSettings.organizationId} />;
}
