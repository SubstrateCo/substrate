import { Link, useNavigate } from "@tanstack/react-router";

import type { ReactNode } from "react";

import { useOrganizationApps } from "./organization-apps-context";
import { useWorkspaceScope } from "./workspace-scope-context";
import { ContactDetail } from "@/components/contacts/contact-detail";
import { InteractionDetail } from "@/components/interactions/interaction-detail";
import { PageSheet } from "@/components/layout/page-sheet";
import { PageSheetSuspendedContext } from "@/components/layout/page-sheet-context";
import { interactionPersonLink } from "@/lib/navigation/record-links";

/**
 * A contact or interaction opened over any workspace app. An interaction opened from a contact
 * keeps `contactId`, so closing the interaction returns to the contact.
 */
export function WorkspaceRecordSheet({
  contactId,
  interactionId,
  children,
}: {
  contactId?: string;
  interactionId?: string;
  children: ReactNode;
}) {
  const { organizationId } = useWorkspaceScope();
  const navigate = useNavigate();
  const crmEnabled = useOrganizationApps().enabled("crm");
  const open = !!(contactId || interactionId);
  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <PageSheetSuspendedContext.Provider value={open}>
        {children}
      </PageSheetSuspendedContext.Provider>
      <PageSheet
        open={open}
        label={interactionId ? "Interaction" : "Contact"}
        onOpenChange={(next) => {
          if (!next)
            void navigate({
              to: ".",
              search: (previous) =>
                interactionId
                  ? { ...previous, interactionId: undefined }
                  : { ...previous, contactId: undefined },
            });
        }}
      >
        {interactionId ? (
          <InteractionDetail
            key={interactionId}
            entityId={interactionId}
            renderContact={(contact) =>
              crmEnabled ? (
                <Link
                  to="."
                  search={(previous) => ({
                    ...previous,
                    contactId: contact.entityId,
                    interactionId: undefined,
                  })}
                  className="min-w-0 truncate underline-offset-4 hover:underline"
                >
                  {contact.name}
                </Link>
              ) : (
                <Link
                  {...interactionPersonLink(organizationId, contact.entityId)}
                  className="min-w-0 truncate underline-offset-4 hover:underline"
                >
                  {contact.name}
                </Link>
              )
            }
          />
        ) : (
          contactId && <ContactDetail key={contactId} entityId={contactId} />
        )}
      </PageSheet>
    </div>
  );
}
