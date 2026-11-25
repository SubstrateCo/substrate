import { Link } from "@tanstack/react-router";

import type { ReactNode } from "react";

import { AuthFrame } from "../../auth/auth-frame";
import { AuthNavLink } from "../../auth/auth-link";
import { ErrorState } from "../../feedback/error-state";
import { PendingButton } from "../../feedback/pending-button";
import { WorkspaceTile } from "../workspace-tile";
import { FormMessage } from "@/components/feedback/form-message";
import { LoadingState } from "@/components/feedback/loading-state";
import { Button } from "@/components/ui/button";
import { roleLabel } from "@/lib/organizations/member-policy";

export function AcceptInvitationScreen({
  invitation,
  loading = false,
  pending = false,
  error,
  failed = false,
  unavailable = false,
  onRetry,
  available,
  onAccept,
  declining = false,
  onDecline,
  declineDialog,
  signOut,
}: {
  invitation?: Invitation;
  loading?: boolean;
  pending?: boolean;
  error?: Error | null;
  failed?: boolean;
  unavailable?: boolean;
  onRetry?: () => void;
  available: boolean;
  onAccept: () => void;
  declining?: boolean;
  onDecline: () => void;
  /** The decline confirmation, while it is open. */
  declineDialog?: ReactNode;
  signOut: ReactNode;
}) {
  const missing = !loading && (unavailable || (!!invitation && !available));
  const ready = !loading && !failed && !missing && invitation;
  const { title, description } = invitationCopy(ready, missing);
  return (
    <AuthFrame
      title={title}
      description={description}
      actions={
        <>
          <AuthNavLink to="/organizations">Workspaces</AuthNavLink>
          {signOut}
        </>
      }
    >
      {loading && <LoadingState label="Loading invitation" rows={2} />}
      {!loading && failed && !unavailable && (
        <ErrorState
          compact
          title="Couldn’t load invitation"
          description="We couldn’t check this invitation. Please try again."
          onRetry={onRetry}
        />
      )}
      {missing && (
        <Button asChild className="w-full" size="lg">
          <Link to="/organizations">Go to your workspaces</Link>
        </Button>
      )}
      {ready && (
        <>
          <InvitationDetails invitation={ready} />
          <>
            <FormMessage
              error={error}
              errorDescription="We couldn’t accept this invitation. Please try again."
            />
            <PendingButton
              className="w-full"
              size="lg"
              pending={pending}
              disabled={declining}
              onClick={onAccept}
            >
              Accept invitation
            </PendingButton>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              size="lg"
              disabled={pending || declining}
              onClick={onDecline}
            >
              Decline invitation
            </Button>
            {declineDialog}
          </>
        </>
      )}
    </AuthFrame>
  );
}

type Invitation = { organizationName: string; role: string; email: string; inviterEmail?: string };

function invitationCopy(ready: Invitation | false | undefined, missing: boolean) {
  if (ready)
    return {
      title: `Join ${ready.organizationName}`,
      description: "You were invited to this workspace. Accept to open it.",
    };
  if (missing)
    return {
      title: "This invitation isn’t available",
      description:
        "It may have expired, been canceled, or been sent to another email. Sign in with the invited email, or ask the owner for a new invitation.",
    };
  return {
    title: "Join your team",
    description: "Accept your invitation to open the workspace.",
  };
}

function InvitationDetails({ invitation }: { invitation: Invitation }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border p-3 wrap-anywhere">
      <WorkspaceTile name={invitation.organizationName} />
      <dl className="min-w-0 space-y-0.5 text-sm">
        <dt className="sr-only">Workspace</dt>
        <dd className="font-medium">{invitation.organizationName}</dd>
        <dt className="sr-only">Role</dt>
        <dd className="text-muted-foreground">Joining as {roleLabel(invitation.role)}</dd>
        <dt className="sr-only">Invited email</dt>
        <dd className="text-muted-foreground">Invited email: {invitation.email}</dd>
        {invitation.inviterEmail && (
          <>
            <dt className="sr-only">Invited by</dt>
            <dd className="text-muted-foreground">Invited by: {invitation.inviterEmail}</dd>
          </>
        )}
      </dl>
    </div>
  );
}
