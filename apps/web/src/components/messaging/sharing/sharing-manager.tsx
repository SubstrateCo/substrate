import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useState } from "react";

import {
  disconnectSharing,
  inviteSharing,
  removeSharing,
  resendSharing,
  revokeSharing,
  type SharingDetails,
} from "@/api/messaging/sharing";
import { FormMessage } from "@/components/auth/form-message";
import { formText } from "@/components/auth/form-values";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { PendingButton } from "@/components/feedback/pending-button";
import { isAccessFailure } from "@/components/feedback/request-failure";
import { NativeField, NativeForm } from "@/components/forms/native-form";
import { SharingDetailsView } from "@/components/messaging/sharing/sharing-details-view";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import { useExpiryTime } from "@/hooks/use-expiry-time";
import { queryKeys } from "@/queries/keys";
import { sharingOptions } from "@/queries/messaging/sharing";

type Action =
  | { kind: "invite"; email: string }
  | { kind: "resend" | "revoke" | "disconnect" | "remove"; id: string };

type Confirmation = { kind: "revoke" | "disconnect" | "remove"; id: string; name: string };

const confirmCopy = {
  disconnect: {
    title: (name: string) => `Disconnect ${name}?`,
    description:
      "Everyone from this organization loses access to messages, search, and agent sources here. Its pending invitations are revoked. Their earlier messages stay. A new invitation is needed to reconnect.",
    confirm: "Remove access",
    pending: "Removing…",
  },
  remove: {
    title: (name: string) => `Remove ${name}?`,
    description:
      "They lose access to messages, search, and agent sources here. Their earlier messages stay. A new invitation is needed to add them again.",
    confirm: "Remove access",
    pending: "Removing…",
  },
  revoke: {
    title: (name: string) => `Revoke the invitation to ${name}?`,
    description: "The link in their email stops working. You can invite them again later.",
    confirm: "Revoke invitation",
    pending: "Revoking…",
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
  const now = useExpiryTime(details.data?.invitations.map((invite) => invite.expiresAt));
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation>();
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
  const data = details.data;
  const copy = confirmation && confirmCopy[confirmation.kind];
  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <DialogContent
          size="lg"
          onCloseAutoFocus={(event) => {
            if (!onRestoreFocus) return;
            event.preventDefault();
            onRestoreFocus();
          }}
        >
          {/* Consent only enables Send. A missing or incomplete address gets inline copy. */}
          <NativeForm
            pending={action.isPending}
            className=""
            onSubmit={(form) => {
              if (!confirmed) return;
              action.mutate(
                { kind: "invite", email: formText(form, "email") },
                {
                  onSuccess: () => {
                    setEmail("");
                    setConfirmed(false);
                  },
                },
              );
            }}
          >
            <DialogHeader>
              <DialogTitle>External collaboration</DialogTitle>
              <DialogDescription>
                Work with people from other organizations. They see this conversation only, never
                your workspace or its private records.
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
              {details.isPending && <LoadingState label="Loading sharing…" rows={2} />}
              {details.error && (
                <ErrorState
                  title="Sharing unavailable"
                  description="Only the people who manage this conversation, and organization admins, can manage sharing."
                  // Missing permission does not change by asking again.
                  onRetry={
                    isAccessFailure(details.error) ? undefined : () => void details.refetch()
                  }
                />
              )}
              {data && (
                <>
                  <div className="grid gap-4">
                    <NativeField
                      id="sharing-email"
                      name="email"
                      type="email"
                      label="Invite by email"
                      required
                      missingMessage="Enter an email address."
                      placeholder="name@partner.com"
                      autoComplete="off"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      disabled={action.isPending}
                      description={inviteHint(data)}
                    />
                    <Field orientation="horizontal">
                      <Checkbox
                        id="sharing-history"
                        checked={confirmed}
                        onCheckedChange={(value) => setConfirmed(value === true)}
                        disabled={action.isPending}
                      />
                      <FieldLabel htmlFor="sharing-history">
                        Let invited people read the full conversation history, including earlier
                        messages
                      </FieldLabel>
                    </Field>
                  </div>
                  <Separator />
                  <SharingDetailsView
                    details={data}
                    organizationId={organizationId}
                    now={now}
                    pending={action.isPending}
                    onDisconnect={(id) =>
                      setConfirmation({
                        kind: "disconnect",
                        id,
                        name:
                          data.connections.find((connection) => connection.organizationId === id)
                            ?.name ?? "this organization",
                      })
                    }
                    onRemove={(id) =>
                      setConfirmation({
                        kind: "remove",
                        id,
                        name:
                          data.participants.find((person) => person.actorId === id)?.name ??
                          "this person",
                      })
                    }
                    onResend={(id) => action.mutate({ kind: "resend", id })}
                    onRevoke={(id) =>
                      setConfirmation({
                        kind: "revoke",
                        id,
                        name:
                          data.invitations.find((invite) => invite.id === id)?.email ??
                          "this person",
                      })
                    }
                  />
                </>
              )}
              {!confirmation && (
                <FormMessage
                  error={action.error}
                  errorDescription="We couldn’t update sharing. Try again."
                />
              )}
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              {data && (
                <PendingButton
                  type="submit"
                  pending={action.isPending && action.variables.kind === "invite"}
                  pendingLabel="Sending…"
                  disabled={!confirmed}
                >
                  Send invitation
                </PendingButton>
              )}
            </DialogFooter>
          </NativeForm>
        </DialogContent>
      </Dialog>
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
          onConfirm={() => action.mutate({ kind: confirmation.kind, id: confirmation.id })}
        />
      )}
    </>
  );
}
