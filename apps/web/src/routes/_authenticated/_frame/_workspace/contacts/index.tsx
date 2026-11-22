import { createFileRoute, redirect } from "@tanstack/react-router";

import { ContactsWorkspace } from "@/components/contacts/contacts-workspace";
import { z } from "zod";

export const Route = createFileRoute("/_authenticated/_frame/_workspace/contacts/")({
  component: ContactsRoute,
  validateSearch: z.object({ recordId: z.uuid().optional() }),
  beforeLoad: ({ search }) => {
    if (!search.recordId)
      throw redirect({ to: "/dashboard", search: { workspaceId: search.workspaceId } });
  },
});

function ContactsRoute() {
  const { organizationId } = Route.useRouteContext();
  const { recordId } = Route.useSearch();
  return (
    <ContactsWorkspace key={organizationId} organizationId={organizationId} recordId={recordId!} />
  );
}
