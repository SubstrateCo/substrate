import { Link, useNavigate } from "@tanstack/react-router";

import type { ReactNode } from "react";

import { useOrganizationApps } from "./organization-apps-context";
import { useWorkspaceScope } from "./workspace-scope-context";
import { ContactDetail } from "@/components/contacts/contact-detail";
import { InteractionDetail } from "@/components/interactions/interaction-detail";
import { PageSheet } from "@/components/layout/page-sheet";
import { PageSheetSuspendedContext } from "@/components/layout/page-sheet-context";
import { interactionPersonLink } from "@/lib/navigation/record-links";

type SheetRecord = { kind: "interaction"; id: string } | { kind: "contact"; id: string };

const sheetLabels = { interaction: "Interaction", contact: "Contact" } as const;

/** The interaction wins: one opened from a contact keeps `contactId` to return to it. */
function sheetRecord(contactId?: string, interactionId?: string): SheetRecord | null {
  if (interactionId) return { kind: "interaction", id: interactionId };
  if (contactId) return { kind: "contact", id: contactId };
  return null;
}

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
  const navigate = useNavigate();
  const record = sheetRecord(contactId, interactionId);
  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <PageSheetSuspendedContext.Provider value={!!record}>
        {children}
      </PageSheetSuspendedContext.Provider>
      <PageSheet
        open={!!record}
        label={sheetLabels[record?.kind ?? "contact"]}
        onOpenChange={(next) => {
          if (!next)
            void navigate({
              to: ".",
              search: (previous) =>
                record?.kind === "interaction"
                  ? { ...previous, interactionId: undefined }
                  : { ...previous, contactId: undefined },
            });
        }}
      >
        {record && <RecordSheetContent record={record} />}
      </PageSheet>
    </div>
  );
}

function RecordSheetContent({ record }: { record: SheetRecord }) {
  if (record.kind === "contact") return <ContactDetail key={record.id} entityId={record.id} />;
  return (
    <InteractionDetail
      key={record.id}
      entityId={record.id}
      renderContact={(contact) => <ContactNameLink contact={contact} />}
    />
  );
}

/** With CRM, the contact opens in this sheet; without it, on the person's interactions page. */
function ContactNameLink({ contact }: { contact: { entityId: string; name: string } }) {
  const { organizationId } = useWorkspaceScope();
  const crmEnabled = useOrganizationApps().enabled("crm");
  const className = "min-w-0 truncate underline-offset-4 hover:underline";
  if (!crmEnabled)
    return (
      <Link {...interactionPersonLink(organizationId, contact.entityId)} className={className}>
        {contact.name}
      </Link>
    );
  return (
    <Link
      to="."
      search={(previous) => ({
        ...previous,
        contactId: contact.entityId,
        interactionId: undefined,
      })}
      className={className}
    >
      {contact.name}
    </Link>
  );
}
