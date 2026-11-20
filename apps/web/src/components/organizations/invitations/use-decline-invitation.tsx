import { useState } from "react";

import { DeclineInvitationDialog } from "./decline-invitation-dialog";
import { useDeclineInvitation } from "@/queries/organizations/user-invitation-mutations";

type DeclineTarget = { id: string; organizationName?: string };

/** Asks before the user declines an invitation. Render `dialog` once beside the list. */
export function useDeclineInvitationConfirm({ onDeclined }: { onDeclined?: () => void } = {}) {
  const decline = useDeclineInvitation();
  const [target, setTarget] = useState<DeclineTarget | null>(null);
  const close = () => {
    setTarget(null);
    decline.reset();
  };
  const dialog = target && (
    <DeclineInvitationDialog
      organizationName={target.organizationName}
      pending={decline.isPending}
      error={decline.error}
      onConfirm={() =>
        decline.mutate(target.id, {
          onSuccess: () => {
            setTarget(null);
            onDeclined?.();
          },
        })
      }
      onClose={close}
    />
  );
  return { request: setTarget, dialog, pendingId: decline.isPending ? target?.id : undefined };
}
