import { useState } from "react";

import { InvitationReviewView, type InvitationOutcome } from "./invitation-review-view";
import { authClient } from "@/api/auth-client";
import { useSharingDecision, useSharingInvitation } from "@/features/messaging/queries/use-sharing";
import { PickerSheet } from "@/features/records/ui/sheet";
import { ErrorState, LoadingRows } from "@/features/records/ui/states";

export function InvitationReview({
  organizationId,
  invitationId,
  onOpenConversation,
}: {
  organizationId: string;
  invitationId: string;
  onOpenConversation: (conversationId: string) => void;
}) {
  const invitation = useSharingInvitation(organizationId, invitationId);
  const organizations = authClient.useListOrganizations();
  const { accept, decline } = useSharingDecision(organizationId, invitationId);
  const [chosen, setChosen] = useState<string>();
  const [choosing, setChoosing] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [openedAt] = useState(Date.now);
  const [switching, setSwitching] = useState<{ pending: boolean; error?: unknown }>({
    pending: false,
  });

  if (invitation.isPending) return <LoadingRows rows={3} label="Loading invitation" />;
  if (invitation.error)
    return (
      <ErrorState
        error={invitation.error}
        noun="this invitation"
        onRetry={() => void invitation.refetch()}
      />
    );
  const data = invitation.data;
  const choices = (organizations.data ?? []).filter((org) => org.id !== data.hostOrganizationId);
  const target =
    data.targetOrganizationId ?? chosen ?? (choices.length === 1 ? choices[0]!.id : "");
  const available = data.status === "pending" && new Date(data.expiresAt).getTime() > openedAt;

  let outcome: InvitationOutcome = { kind: "pending" };
  if (decline.isSuccess) outcome = { kind: "declined" };
  else if (accept.data?.status === "approval-required") outcome = { kind: "approval-required" };
  else if (accept.data?.status === "accepted")
    outcome = {
      kind: "accepted",
      organizationId: accept.data.organizationId,
      conversationId: accept.data.conversationId,
      here: accept.data.organizationId === organizationId,
    };
  else if (data.status === "accepted" && data.targetOrganizationId)
    outcome = {
      kind: "accepted",
      organizationId: data.targetOrganizationId,
      conversationId: data.conversationId,
      here: data.targetOrganizationId === organizationId,
    };

  const open = async () => {
    if (outcome.kind !== "accepted") return;
    if (outcome.here) {
      if (outcome.conversationId) onOpenConversation(outcome.conversationId);
      return;
    }
    // Switching resets private state, and the shell reopens in the accepted workspace.
    setSwitching({ pending: true });
    const response = await authClient.organization.setActive({
      organizationId: outcome.organizationId,
    });
    setSwitching({
      pending: false,
      error: response.error
        ? new Error(response.error.message ?? "Couldn't switch workspace.")
        : undefined,
    });
  };

  return (
    <>
      <InvitationReviewView
        invitation={data}
        organizations={organizations.data ?? []}
        organizationId={target}
        confirmed={confirmed}
        available={available}
        busy={accept.isPending || decline.isPending || switching.pending}
        error={accept.error ?? decline.error ?? switching.error ?? organizations.error}
        outcome={outcome}
        onChooseOrganization={() => setChoosing(true)}
        onConfirmed={setConfirmed}
        onAccept={() => accept.mutate(target)}
        onDecline={() => decline.mutate()}
        onOpen={() => void open()}
        onCheckApproval={() => void invitation.refetch()}
      />
      {choosing ? (
        <PickerSheet
          title="Your workspace"
          choices={choices.map((org) => ({ value: org.id, label: org.name }))}
          value={target}
          onSelect={setChosen}
          onClose={() => setChoosing(false)}
        />
      ) : null}
    </>
  );
}
