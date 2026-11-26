import { createFileRoute } from "@tanstack/react-router";

import { ContactsWorkspace } from "@/components/contacts/contacts-workspace";
import { z } from "zod";

export const Route = createFileRoute("/_authenticated/_frame/_workspace/contacts/")({
  component: ContactsRoute,
  validateSearch: z.object({ recordId: z.uuid().optional() }),
});

function ContactsRoute() {
  const { organizationId } = Route.useRouteContext();
  const { recordId } = Route.useSearch();
  return <ContactsWorkspace organizationId={organizationId} recordId={recordId} />;
}
