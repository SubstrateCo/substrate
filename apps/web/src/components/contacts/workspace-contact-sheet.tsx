import { useNavigate } from "@tanstack/react-router";

import type { ReactNode } from "react";

import { ContactDetail } from "./contact-detail";
import { PageSheet, PageSheetSuspendedContext } from "@/components/layout/page-sheet";

export function WorkspaceContactSheet({
  organizationId,
  contactId,
  children,
}: {
  organizationId: string;
  contactId?: string;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <PageSheetSuspendedContext.Provider value={!!contactId}>
        {children}
      </PageSheetSuspendedContext.Provider>
      <PageSheet
        open={!!contactId}
        label="Contact"
        onOpenChange={(open) => {
          if (!open)
            void navigate({
              to: ".",
              search: (previous) => ({ ...previous, contactId: undefined }),
            });
        }}
      >
        {contactId && (
          <ContactDetail key={contactId} organizationId={organizationId} entityId={contactId} />
        )}
      </PageSheet>
    </div>
  );
}
