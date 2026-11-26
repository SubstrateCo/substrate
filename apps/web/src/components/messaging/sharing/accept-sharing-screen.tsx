import { useQuery } from "@tanstack/react-query";
import { Link, linkOptions, useRouter } from "@tanstack/react-router";

import { useState, type ReactNode } from "react";

import type { SharingAcceptance, SharingInvitation } from "@/api/messaging/sharing";
import { ApiError } from "@/api/result";
import { AuthFrame } from "@/components/auth/auth-frame";
import { AuthNavLink } from "@/components/auth/auth-link";
import { SignOutButton } from "@/components/auth/sign-out/sign-out-button";
import { ErrorState } from "@/components/feedback/error-state";
import { FormMessage } from "@/components/feedback/form-message";
import { LoadingState } from "@/components/feedback/loading-state";
import { PendingButton } from "@/components/feedback/pending-button";
import { SharingAcceptanceForm } from "@/components/messaging/sharing/sharing-acceptance-form";
import { Button } from "@/components/ui/button";
import { useExpiryTime } from "@/hooks/use-expiry-time";
import { isDesktop } from "@/lib/desktop/auth";
import { sharingInvitationOptions } from "@/queries/messaging/sharing";
import {
  useAcceptSharingInvitation,
  useActivateSharingOrganization,
  useDeclineSharingInvitation,
} from "@/queries/messaging/sharing-mutations";
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

type AcceptedWorkspace = { organizationId: string; conversationId: string | null };

function useSharingActivation() {
  const activate = useActivateSharingOrganization();
  const router = useRouter();
  const activateShared = (result: AcceptedWorkspace) => {
    const conversationId = result.conversationId ?? undefined;
    // Setup complete shows the now-active workspace, so it needs only the conversation.
    const destination = isDesktop()
      ? linkOptions({
          to: "/messages",
          search: { workspaceId: result.organizationId, conversationId },
        })
      : linkOptions({ to: "/setup/complete", search: { conversationId } });
    activate.mutate({
      organizationId: result.organizationId,
      destination: router.buildLocation(destination).href,
    });
  };
  return { activate, activateShared };
}

export function AcceptSharingScreen({ invitationId }: { invitationId: string }) {
  const invite = useQuery(sharingInvitationOptions(invitationId));
  const organizations = useQuery(organizationsQueryOptions());
  const [selected, setSelected] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const now = useExpiryTime(invite.data ? [invite.data.expiresAt] : undefined);
  const organizationId = invite.data?.targetOrganizationId ?? selected;
  const { activate, activateShared } = useSharingActivation();
  const accept = useAcceptSharingInvitation(invitationId, organizationId);
  const decline = useDeclineSharingInvitation(invitationId);
  const path = `/accept-sharing/${invitationId}`;
  const declined = decline.isSuccess;
  const { available, accepted, missing, waitingForApproval, formOwnsError } = invitationState({
    invitation: invite.data,
    result: accept.data,
    now,
    declined,
    loading: invite.isPending,
    error: invite.error,
  });
  const mutationError = accept.error ?? decline.error ?? activate.error;
  const retry = () => void invite.refetch();
  return (
    <AuthFrame
      title={missing ? "This invitation isn’t available" : "External collaboration invitation"}
      description={
        missing
          ? "It may have expired or been sent to another email. Sign in with the invited email, or ask the sender for a new invitation."
          : "Join from your own workspace. You won’t become a member of the inviting workspace."
      }
      actions={
        <>
          <AuthNavLink to="/organizations">Workspaces</AuthNavLink>
          <SignOutButton destination={path} />
        </>
      }
    >
      <InvitationLoadNotice loading={invite.isPending} error={invite.error} onRetry={retry} />
      {organizations.error && (
        <ErrorState
          variant="compact"
          title="Couldn’t load workspaces"
          onRetry={() => void organizations.refetch()}
        />
      )}
      <InvitationOutcome
        declined={declined}
        accepted={accepted}
        waitingForApproval={waitingForApproval}
        canRespond={available}
        found={!!invite.data}
        opening={activate.isPending}
        onOpen={activateShared}
        onCheckApproval={retry}
      >
        {invite.data && (
          <SharingAcceptanceForm
            invitation={invite.data}
            organizations={organizations.data ?? []}
            organizationId={organizationId}
            confirmed={confirmed}
            busy={accept.isPending || decline.isPending || activate.isPending}
            error={mutationError}
            onOrganization={setSelected}
            onConfirmed={setConfirmed}
            onAccept={() =>
              accept.mutate(undefined, {
                onSuccess: (result) => {
                  if (result.status === "accepted") activateShared(result);
                },
              })
            }
            onDecline={() => decline.mutate()}
          />
        )}
      </InvitationOutcome>
      {!formOwnsError && <FormMessage error={mutationError} />}
    </AuthFrame>
  );
}

function invitationState({
  invitation,
  result,
  now,
  declined,
  loading,
  error,
}: {
  invitation: SharingInvitation | undefined;
  result: SharingAcceptance | undefined;
  now: number;
  declined: boolean;
  loading: boolean;
  error: Error | null;
}) {
  const available =
    invitation?.status === "pending" && new Date(invitation.expiresAt).getTime() > now;
  const waitingForApproval = result?.status === "approval-required";
  let accepted: AcceptedWorkspace | undefined;
  if (result?.status === "accepted") accepted = result;
  else if (invitation?.status === "accepted" && invitation.targetOrganizationId)
    accepted = {
      organizationId: invitation.targetOrganizationId,
      conversationId: invitation.conversationId,
    };
  return {
    available,
    accepted,
    waitingForApproval,
    missing:
      !loading &&
      !accepted &&
      !declined &&
      (isPermanentFailure(error) || (!!invitation && !available && !waitingForApproval)),
    formOwnsError: available && !accepted && !declined,
  };
}

function InvitationOutcome({
  declined,
  accepted,
  waitingForApproval,
  canRespond,
  found,
  opening,
  onOpen,
  onCheckApproval,
  children,
}: {
  declined: boolean;
  accepted?: AcceptedWorkspace;
  waitingForApproval: boolean;
  canRespond: boolean;
  found: boolean;
  opening: boolean;
  onOpen: (workspace: AcceptedWorkspace) => void;
  onCheckApproval: () => void;
  children: ReactNode;
}) {
  if (declined) return <FormMessage message="Invitation declined. No access was granted." />;
  if (accepted)
    return (
      <>
        <FormMessage message="Invitation accepted. Your access is saved." />
        <PendingButton
          className="w-full"
          size="lg"
          pending={opening}
          onClick={() => onOpen(accepted)}
        >
          Continue setup
        </PendingButton>
      </>
    );
  if (waitingForApproval)
    return (
      <>
        <p role="status" className="text-sm">
          Approval requested. An owner or admin of your workspace must approve this connection in
          External collaboration settings. No access has been granted yet.
        </p>
        <Button variant="outline" size="lg" className="w-full" onClick={onCheckApproval}>
          <RefreshCw aria-hidden="true" />
          Check approval
        </Button>
      </>
    );
  if (canRespond) return children;
  return found ? <WorkspacesLink /> : null;
}

function InvitationLoadNotice({
  loading,
  error,
  onRetry,
}: {
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
}) {
  return (
    <>
      {loading && <LoadingState label="Loading invitation" rows={2} />}
      {error &&
        (isPermanentFailure(error) ? (
          <WorkspacesLink />
        ) : (
          <ErrorState
            variant="compact"
            title="Couldn’t load invitation"
            description="We couldn’t check this invitation. Please try again."
            onRetry={onRetry}
          />
        ))}
    </>
  );
}

function WorkspacesLink() {
  return (
    <Button asChild className="w-full" size="lg">
      <Link to="/organizations">Go to your workspaces</Link>
    </Button>
  );
}
