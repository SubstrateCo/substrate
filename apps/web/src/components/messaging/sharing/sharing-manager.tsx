import { useQuery } from "@tanstack/react-query";

import { useRef, useState } from "react";

import { SharingInvitationForm } from "./sharing-invitation-form";
import type { SharingDetails } from "@/api/messaging/sharing";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { isAccessFailure } from "@/components/feedback/request-failure";
import { StaleNotice } from "@/components/feedback/stale-notice";
import { useFocusReturn } from "@/components/feedback/use-focus-return";
import { SharingDetailsView } from "@/components/messaging/sharing/sharing-details-view";
import { useExpiryTime } from "@/hooks/use-expiry-time";
import { sharingOptions } from "@/queries/messaging/sharing";
import { useSharingAction } from "@/queries/messaging/sharing-mutations";
import { toast } from "sonner";

type Confirmation = { kind: "revoke" | "disconnect" | "remove"; id: string; name: string };

const confirmCopy = {
  disconnect: {
    title: (name: string) => `Disconnect ${name}?`,
    description:
      "Everyone from this organization loses access to messages, search, and agent sources here. Its pending invitations are revoked. Their earlier messages stay. A new invitation is needed to reconnect.",
    confirm: "Remove access",
    pending: "Removing…",
    done: (name: string) => `${name} no longer has access.`,
  },
  remove: {
    title: (name: string) => `Remove ${name}?`,
    description:
      "They lose access to messages, search, and agent sources here. Their earlier messages stay. A new invitation is needed to add them again.",
    confirm: "Remove access",
    pending: "Removing…",
    done: (name: string) => `${name} no longer has access.`,
  },
  revoke: {
    title: (name: string) => `Revoke the invitation to ${name}?`,
    description: "The link in their email stops working. You can invite them again later.",
    confirm: "Revoke invitation",
    pending: "Revoking…",
    done: (name: string) => `Invitation to ${name} revoked.`,
  },
};

function inviteHint(details: SharingDetails) {
  if (!details.host) return "You can invite people from your own organization only.";
  if (details.kind === "channel")
    return "They accept from their own organization, and its admins must approve before they can read this channel.";
  return "They accept from their own organization before they get access.";
}

export function SharingManager({
  organizationId,
  conversationId,
  onClose,
  onRestoreFocus,
}: {
  organizationId: string;
  conversationId: string;
  onClose: () => void;
  /** Focus the control that opened the dialog, which a menu item no longer is once it closes. */
  onRestoreFocus?: () => void;
}) {
  const details = useQuery(sharingOptions(organizationId, conversationId));
  // Losing access is not a hiccup: nothing cached may stay on screen or stay actionable. A
  // temporary failure keeps the last list, marked as possibly out of date.
  const blocked = isAccessFailure(details.error);
  const data = blocked ? undefined : details.data;
  const now = useExpiryTime(data?.invitations.map((invite) => invite.expiresAt));
  const [confirmation, setConfirmation] = useState<Confirmation>();
  // The confirmation is mounted by state, so it has no trigger of its own: remember the row
  // button, and fall back to the invite field once that row is gone.
  const confirmFallback = useRef<HTMLElement>(null);
  const confirmFocus = useFocusReturn(confirmFallback);
  const confirm = (next: Confirmation) => {
    confirmFocus.remember();
    setConfirmation(next);
  };
  const restoreConfirmFocus = () => {
    confirmFocus.restore();
  };
  const action = useSharingAction(organizationId, conversationId);
  if (blocked && confirmation) setConfirmation(undefined);
  const copy = confirmation && !blocked && confirmCopy[confirmation.kind];
  return (
    <>
      <SharingInvitationForm
        key={blocked ? "unavailable" : "available"}
        available={!!data}
        hint={data ? inviteHint(data) : undefined}
        inputRef={confirmFallback}
        pending={action.isPending}
        onClose={onClose}
        onRestoreFocus={onRestoreFocus}
        onInvite={(email, onSuccess) => action.mutate({ kind: "invite", email }, { onSuccess })}
        error={action.variables?.kind === "invite" ? action.error : undefined}
      >
        {details.isPending && <LoadingState label="Loading sharing…" rows={2} />}
        {details.error && !data && (
          <ErrorState
            title="Sharing unavailable"
            description={
              blocked
                ? "Only the people who manage this conversation, and organization admins, can manage sharing."
                : "We couldn’t load sharing. Check your connection and try again."
            }
            // Missing permission does not change by asking again.
            onRetry={blocked ? undefined : () => void details.refetch()}
          />
        )}
        {details.error && data && (
          <StaleNotice onRetry={() => void details.refetch()}>
            This list is from earlier and may be out of date.
          </StaleNotice>
        )}
        {data && (
          <>
            <SharingDetailsView
              details={data}
              organizationId={organizationId}
              now={now}
              pending={action.isPending}
              onDisconnect={(id) =>
                confirm({
                  kind: "disconnect",
                  id,
                  name:
                    data.connections.find((connection) => connection.organizationId === id)?.name ??
                    "this organization",
                })
              }
              onRemove={(id) =>
                confirm({
                  kind: "remove",
                  id,
                  name:
                    data.participants.find((person) => person.actorId === id)?.name ??
                    "this person",
                })
              }
              onResend={(id) =>
                action.mutate(
                  { kind: "resend", id },
                  {
                    onSuccess: () => toast.success("Invitation email resent."),
                    onError: (error) =>
                      toast.error(
                        actionErrorMessage(error, "We couldn’t resend this invitation. Try again."),
                      ),
                  },
                )
              }
              onRevoke={(id) =>
                confirm({
                  kind: "revoke",
                  id,
                  name: data.invitations.find((invite) => invite.id === id)?.email ?? "this person",
                })
              }
            />
          </>
        )}
      </SharingInvitationForm>
      {confirmation && copy && (
        <ConfirmDialog
          title={copy.title(confirmation.name)}
          description={copy.description}
          confirmLabel={copy.confirm}
          pendingLabel={copy.pending}
          destructive
          pending={action.isPending}
          error={action.error}
          errorDescription="We couldn’t change access. Try again."
          onClose={() => setConfirmation(undefined)}
          onRestoreFocus={restoreConfirmFocus}
          onConfirm={() =>
            action.mutate(
              { kind: confirmation.kind, id: confirmation.id },
              {
                onSuccess: () => {
                  setConfirmation(undefined);
                  toast.success(copy.done(confirmation.name));
                },
              },
            )
          }
        />
      )}
    </>
  );
}
