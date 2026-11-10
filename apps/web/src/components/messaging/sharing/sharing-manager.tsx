import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useState } from "react";

import {
  disconnectSharing,
  inviteSharing,
  removeSharing,
  resendSharing,
  revokeSharing,
} from "@/api/messaging/sharing";
import { FormMessage } from "@/components/auth/form-message";
import { formText } from "@/components/auth/form-values";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { PendingButton } from "@/components/feedback/pending-button";
import { SharingDetailsView } from "@/components/messaging/sharing/sharing-details-view";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useExpiryTime } from "@/hooks/use-expiry-time";
import { queryKeys } from "@/queries/keys";
import { sharingOptions } from "@/queries/messaging/sharing";

type Action =
  | { kind: "invite"; email: string }
  | { kind: "resend" | "revoke" | "disconnect" | "remove"; id: string };

export function SharingManager({
  organizationId,
  conversationId,
  onClose,
}: {
  organizationId: string;
  conversationId: string;
  onClose: () => void;
}) {
  const details = useQuery(sharingOptions(organizationId, conversationId));
  const now = useExpiryTime(details.data?.invitations.map((invite) => invite.expiresAt));
  const queryClient = useQueryClient();
  const [confirmed, setConfirmed] = useState(false);
  const [confirmation, setConfirmation] = useState<Action>();
  const action = useMutation({
    mutationFn: async (input: Action) => {
      const base = { organizationId, conversationId };
      switch (input.kind) {
        case "invite":
          return inviteSharing({ data: { ...base, email: input.email, shareHistory: true } });
        case "resend":
          return resendSharing({ data: { organizationId, invitationId: input.id } });
        case "revoke":
          return revokeSharing({ data: { organizationId, invitationId: input.id } });
        case "disconnect":
          return disconnectSharing({ data: { ...base, partnerOrganizationId: input.id } });
        case "remove":
          return removeSharing({ data: { ...base, actorId: input.id } });
      }
    },
    onSuccess: async (_, input) => {
      setConfirmation(undefined);
      // Every action except remove sends an access hint to this organization, and that hint
      // resets the same queries. Remove reaches only the host organization and the members, so a
      // partner organization's manager may not get one.
      if (input.kind !== "remove") return;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.organization(organizationId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.sharingInvitations }),
      ]);
    },
  });
  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>External collaboration</DialogTitle>
            <DialogDescription>
              Connect organizations without sharing workspace membership or linked private records.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-96 space-y-6 overflow-y-auto pr-1">
            {details.isPending && <LoadingState label="Loading sharing…" rows={2} />}
            {details.error && (
              <ErrorState
                title="Sharing unavailable"
                description="Only authorized conversation managers or organization admins can manage sharing."
                onRetry={() => void details.refetch()}
              />
            )}
            {details.data && (
              <>
                <form
                  className="space-y-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!confirmed || action.isPending) return;
                    action.mutate({
                      kind: "invite",
                      email: formText(new FormData(event.currentTarget), "email"),
                    });
                  }}
                >
                  <p className="text-sm">
                    {details.data.kind === "channel" && details.data.host
                      ? "Invite a partner contact. Their organization must approve before they can read this channel."
                      : "Invite a person by email. They must accept from their own organization before they receive access."}
                  </p>
                  {!details.data.host && (
                    <p className="text-sm">You can invite people from your organization only.</p>
                  )}
                  <Field>
                    <FieldLabel htmlFor="sharing-email">Invitation email</FieldLabel>
                    <Input
                      id="sharing-email"
                      name="email"
                      type="email"
                      required
                      disabled={action.isPending}
                    />
                  </Field>
                  <Field orientation="horizontal">
                    <Checkbox
                      id="sharing-history"
                      checked={confirmed}
                      onCheckedChange={(value) => setConfirmed(value === true)}
                      disabled={action.isPending}
                    />
                    <FieldLabel htmlFor="sharing-history">
                      I approve sharing the full conversation history, including earlier messages,
                      with invited participants.
                    </FieldLabel>
                  </Field>
                  <PendingButton
                    type="submit"
                    pending={action.isPending}
                    pendingLabel="Saving…"
                    disabled={!confirmed}
                  >
                    Send collaboration invitation
                  </PendingButton>
                </form>
                <SharingDetailsView
                  details={details.data}
                  organizationId={organizationId}
                  now={now}
                  pending={action.isPending}
                  onDisconnect={(id) => setConfirmation({ kind: "disconnect", id })}
                  onRemove={(id) => setConfirmation({ kind: "remove", id })}
                  onResend={(id) => action.mutate({ kind: "resend", id })}
                  onRevoke={(id) => action.mutate({ kind: "revoke", id })}
                />
              </>
            )}
            <FormMessage error={action.error} />
          </div>
        </DialogContent>
      </Dialog>
      {confirmation && (
        <ConfirmDialog
          title={
            confirmation.kind === "disconnect"
              ? "Disconnect this organization?"
              : "Remove this participant?"
          }
          description="Access to messages, search, and agent sources will be removed. Disconnecting also revokes all pending invitations for this conversation. Message history and authorship are retained. A new invitation is required to restore access."
          confirmLabel="Remove access"
          pendingLabel="Removing…"
          pending={action.isPending}
          error={action.error}
          onClose={() => setConfirmation(undefined)}
          onConfirm={() => action.mutate(confirmation)}
        />
      )}
    </>
  );
}
