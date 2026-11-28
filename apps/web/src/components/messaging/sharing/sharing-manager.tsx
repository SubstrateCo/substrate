import type { SharingConfirmation as Confirmation } from "@substrate/contracts/messaging/sharing";

import { useQuery } from "@tanstack/react-query";

import { useRef } from "react";

import { SharingInvitationForm } from "./sharing-invitation-form";
import type { SharingDetails } from "@/api/messaging/sharing";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { ErrorState } from "@/components/feedback/error-state";
import { StaleNotice } from "@/components/feedback/stale-notice";
import { useStateDialog } from "@/components/feedback/use-state-dialog";
import {
  SharingDetailsLoading,
  SharingDetailsView,
} from "@/components/messaging/sharing/sharing-details-view";
import { useExpiryTime } from "@/hooks/use-expiry-time";
import { resourceState, type ResourceStatus } from "@/lib/resource-state";
import { sharingOptions } from "@/queries/messaging/sharing";
import { useSharingAction } from "@/queries/messaging/sharing-mutations";
import { toast } from "sonner";

const confirmCopy = {
  disconnect: {
    title: (name: string) => `Disconnect ${name}?`,
    description:
      "Everyone from this organization loses access to messages, search, and agent sources here. Its pending invitations are revoked. Their earlier messages stay. A new invitation is needed to reconnect.",
    confirm: "Remove access",
    done: (name: string) => `${name} no longer has access.`,
  },
  remove: {
    title: (name: string) => `Remove ${name}?`,
    description:
      "They lose access to messages, search, and agent sources here. Their earlier messages stay. A new invitation is needed to add them again.",
    confirm: "Remove access",
    done: (name: string) => `${name} no longer has access.`,
  },
  revoke: {
    title: (name: string) => `Revoke the invitation to ${name}?`,
    description: "The link in their email stops working. You can invite them again later.",
    confirm: "Revoke invitation",
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
  name,
  onClose,
  onRestoreFocus,
}: {
  organizationId: string;
  conversationId: string;
  name: string | undefined;
  onClose: () => void;
  onRestoreFocus?: () => void;
}) {
  const details = useQuery(sharingOptions(organizationId, conversationId));
  const load = resourceState(details);
  const blocked = load.status === "unavailable";
  const data = load.data;
  const now = useExpiryTime(data?.invitations.map((invite) => invite.expiresAt));
  const confirmFallback = useRef<HTMLElement>(null);
  const {
    value: confirmation,
    open: confirm,
    close: closeConfirmation,
    restoreFocus: restoreConfirmFocus,
  } = useStateDialog<Confirmation>(confirmFallback);
  const action = useSharingAction(organizationId, conversationId);
  if (blocked && confirmation) closeConfirmation();
  const retry = () => void details.refetch();
  return (
    <>
      <SharingInvitationForm
        key={blocked ? "unavailable" : "available"}
        title={`External collaboration for ${name ?? "a conversation you can’t open"}`}
        available={!!data}
        hint={data ? inviteHint(data) : undefined}
        inputRef={confirmFallback}
        pending={action.isPending}
        onClose={onClose}
        onRestoreFocus={onRestoreFocus}
        onInvite={(email, onSuccess) => action.mutate({ kind: "invite", email }, { onSuccess })}
        error={action.variables?.kind === "invite" ? action.error : undefined}
      >
        <SharingLoadNotice status={load.status} onRetry={retry} />
        {data && (
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
                  data.participants.find((person) => person.actorId === id)?.name ?? "this person",
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
        )}
      </SharingInvitationForm>
      {!blocked && confirmation && (
        <SharingConfirmation
          confirmation={confirmation}
          pending={action.isPending}
          error={action.error}
          onClose={closeConfirmation}
          onRestoreFocus={restoreConfirmFocus}
          onConfirm={() =>
            action.mutate(
              { kind: confirmation.kind, id: confirmation.id },
              {
                onSuccess: () => {
                  closeConfirmation();
                  toast.success(confirmCopy[confirmation.kind].done(confirmation.name));
                },
              },
            )
          }
        />
      )}
    </>
  );
}

function SharingLoadNotice({ status, onRetry }: { status: ResourceStatus; onRetry: () => void }) {
  if (status === "loading") return <SharingDetailsLoading />;
  if (status === "ready") return null;
  if (status === "stale")
    return (
      <StaleNotice title="This list is from earlier and may be out of date." onRetry={onRetry} />
    );
  if (status === "unavailable")
    return (
      <ErrorState
        title="Sharing unavailable"
        description="Only the people who manage this conversation, and organization admins, can manage sharing."
      />
    );
  return (
    <ErrorState
      title="Sharing unavailable"
      description="We couldn’t load sharing. Check your connection and try again."
      onRetry={onRetry}
    />
  );
}

function SharingConfirmation({
  confirmation,
  pending,
  error,
  onClose,
  onRestoreFocus,
  onConfirm,
}: {
  confirmation: Confirmation;
  pending: boolean;
  error: Error | null;
  onClose: () => void;
  onRestoreFocus: () => void;
  onConfirm: () => void;
}) {
  const copy = confirmCopy[confirmation.kind];
  return (
    <ConfirmDialog
      title={copy.title(confirmation.name)}
      description={copy.description}
      confirmLabel={copy.confirm}
      destructive
      pending={pending}
      error={error}
      errorDescription="We couldn’t change access. Try again."
      onClose={onClose}
      onRestoreFocus={onRestoreFocus}
      onConfirm={onConfirm}
    />
  );
}
