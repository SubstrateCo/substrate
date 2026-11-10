import { useMutation, useQuery } from "@tanstack/react-query";

import { useState, type ReactNode } from "react";

import { acceptSharingInvitation, declineSharingInvitation } from "@/api/messaging/sharing";
import { AuthFrame } from "@/components/auth/auth-frame";
import { FormMessage } from "@/components/auth/form-message";
import { SignOutButton } from "@/components/auth/sign-out/sign-out-button";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { PendingButton } from "@/components/feedback/pending-button";
import { SharingAcceptanceForm } from "@/components/messaging/sharing/sharing-acceptance-form";
import { Button } from "@/components/ui/button";
import { useExpiryTime } from "@/hooks/use-expiry-time";
import { activateOrganization } from "@/lib/auth/organization";
import { isDesktop } from "@/lib/desktop/auth";
import { sharingInvitationOptions } from "@/queries/messaging/sharing";
import { organizationsQueryOptions } from "@/queries/organizations/options";

export function AcceptSharingScreen({ invitationId }: { invitationId: string }) {
  const invite = useQuery(sharingInvitationOptions(invitationId));
  const organizations = useQuery(organizationsQueryOptions());
  const [selected, setSelected] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const now = useExpiryTime(invite.data ? [invite.data.expiresAt] : undefined);
  const organizationId = invite.data?.targetOrganizationId ?? selected;
  const activate = useMutation({
    mutationFn: (result: { organizationId: string; conversationId: string | null }) => {
      const search = new URLSearchParams({ workspaceId: result.organizationId });
      if (result.conversationId) search.set("conversationId", result.conversationId);
      const destination = isDesktop() ? `/dashboard?${search}` : `/setup/complete?${search}`;
      return activateOrganization(result.organizationId, destination);
    },
  });
  const accept = useMutation({
    mutationFn: () =>
      acceptSharingInvitation({ data: { invitationId, organizationId, shareHistory: true } }),
    onSuccess: (result) => {
      if (result.status === "accepted") activate.mutate(result);
    },
  });
  const decline = useMutation({
    mutationFn: () => declineSharingInvitation({ data: { invitationId } }),
  });
  const path = `/accept-sharing/${invitationId}`;
  const available =
    invite.data?.status === "pending" && new Date(invite.data.expiresAt).getTime() > now;
  const busy = accept.isPending || decline.isPending || activate.isPending;
  let accepted = accept.data?.status === "accepted" ? accept.data : undefined;
  if (!accepted && invite.data?.status === "accepted" && invite.data.targetOrganizationId)
    accepted = {
      status: "accepted",
      organizationId: invite.data.targetOrganizationId,
      conversationId: invite.data.conversationId,
    };
  let content: ReactNode;
  if (decline.isSuccess) content = <p role="status">Invitation declined. No access was granted.</p>;
  else if (accepted) {
    const result = accepted;
    content = (
      <div className="space-y-3">
        <p>Invitation accepted. Your access is saved.</p>
        <PendingButton
          pending={activate.isPending}
          pendingLabel="Opening…"
          onClick={() => activate.mutate(result)}
        >
          Continue setup
        </PendingButton>
      </div>
    );
  } else if (accept.data?.status === "approval-required")
    content = (
      <div className="space-y-3">
        <p role="status">
          Approval requested. An owner or admin of your organization must approve this connection in
          External collaboration settings. No access has been granted yet.
        </p>
        <Button onClick={() => void invite.refetch()}>Check approval</Button>
      </div>
    );
  else if (invite.data && available)
    content = (
      <SharingAcceptanceForm
        invitation={invite.data}
        organizations={organizations.data ?? []}
        organizationId={organizationId}
        confirmed={confirmed}
        busy={busy}
        onOrganization={setSelected}
        onConfirmed={setConfirmed}
        onAccept={() => accept.mutate()}
        onDecline={() => decline.mutate()}
      />
    );
  else if (invite.data)
    content = (
      <p role="status">
        This invitation is no longer available. Ask the sender for a new invitation.
      </p>
    );
  return (
    <AuthFrame
      title="External collaboration invitation"
      description="Join from your own organization. You will not become a member of the inviting workspace."
    >
      {invite.isPending && <LoadingState label="Loading invitation…" rows={2} />}
      {invite.error && (
        <ErrorState
          title="Invitation unavailable"
          description="Sign in with the invited email, or ask the sender for a new invitation."
          onRetry={() => void invite.refetch()}
        />
      )}
      {organizations.error && (
        <ErrorState
          compact
          title="Couldn’t load organizations"
          onRetry={() => void organizations.refetch()}
        />
      )}
      {content}
      <FormMessage error={accept.error ?? decline.error ?? activate.error} />
      <div className="flex flex-wrap justify-between gap-3">
        <a className="text-sm underline" href="/onboarding">
          Your workspaces
        </a>
        <SignOutButton destination={path} />
      </div>
    </AuthFrame>
  );
}
