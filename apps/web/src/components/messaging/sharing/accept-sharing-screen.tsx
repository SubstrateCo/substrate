import { useMutation, useQuery } from "@tanstack/react-query";

import { useState, type ReactNode } from "react";

import { acceptSharingInvitation, declineSharingInvitation } from "@/api/messaging/sharing";
import { ApiError } from "@/api/result";
import { AuthFrame } from "@/components/auth/auth-frame";
import { AuthNavLink } from "@/components/auth/auth-link";
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
import { RefreshCw } from "lucide-react";

/** A 4xx other than a timeout or rate limit will not change on retry. */
function isPermanentFailure(error: Error | null) {
  return (
    error instanceof ApiError &&
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 408 &&
    error.status !== 429
  );
}

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
  const missing =
    !invite.isPending &&
    !accepted &&
    !decline.isSuccess &&
    ((!!invite.error && isPermanentFailure(invite.error)) ||
      (!!invite.data && !available && accept.data?.status !== "approval-required"));
  const unavailableNotice = (
    <Button asChild className="w-full" size="lg">
      <a href="/onboarding">Go to your workspaces</a>
    </Button>
  );
  let content: ReactNode;
  if (decline.isSuccess)
    content = <FormMessage message="Invitation declined. No access was granted." />;
  else if (accepted) {
    const result = accepted;
    content = (
      <>
        <FormMessage message="Invitation accepted. Your access is saved." />
        <PendingButton
          className="w-full"
          size="lg"
          pending={activate.isPending}
          pendingLabel="Opening."
          onClick={() => activate.mutate(result)}
        >
          Continue setup
        </PendingButton>
      </>
    );
  } else if (accept.data?.status === "approval-required")
    content = (
      <>
        <p role="status" className="text-sm">
          Approval requested. An owner or admin of your organization must approve this connection in
          External collaboration settings. No access has been granted yet.
        </p>
        <Button variant="outline" onClick={() => void invite.refetch()}>
          <RefreshCw aria-hidden="true" />
          Check approval
        </Button>
      </>
    );
  else if (invite.data && available)
    content = (
      <SharingAcceptanceForm
        invitation={invite.data}
        organizations={organizations.data ?? []}
        organizationId={organizationId}
        confirmed={confirmed}
        busy={busy}
        error={accept.error ?? decline.error ?? activate.error}
        onOrganization={setSelected}
        onConfirmed={setConfirmed}
        onAccept={() => accept.mutate()}
        onDecline={() => decline.mutate()}
      />
    );
  else if (invite.data) content = unavailableNotice;
  return (
    <AuthFrame
      title={missing ? "This invitation isn’t available" : "External collaboration invitation"}
      description={
        missing
          ? "It may have expired or been sent to another email. Sign in with the invited email, or ask the sender for a new invitation."
          : "Join from your own organization. You won’t become a member of the inviting workspace."
      }
      actions={
        <>
          <AuthNavLink href="/onboarding">Workspaces</AuthNavLink>
          <SignOutButton destination={path} />
        </>
      }
    >
      {invite.isPending && <LoadingState label="Loading invitation." rows={2} />}
      {invite.error &&
        (isPermanentFailure(invite.error) ? (
          unavailableNotice
        ) : (
          <ErrorState
            compact
            title="Couldn’t load invitation"
            description="We couldn’t check this invitation. Please try again."
            onRetry={() => void invite.refetch()}
          />
        ))}
      {organizations.error && (
        <ErrorState
          compact
          title="Couldn’t load organizations"
          onRetry={() => void organizations.refetch()}
        />
      )}
      {content}
      {!(invite.data && available && !accepted && !decline.isSuccess) && (
        <FormMessage error={accept.error ?? decline.error ?? activate.error} />
      )}
    </AuthFrame>
  );
}
