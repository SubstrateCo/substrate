import { Link } from "@tanstack/react-router";

import type { ReactNode } from "react";

import { AuthFrame } from "../../auth/auth-frame";
import { AuthNavLink } from "../../auth/auth-link";
import { ErrorState } from "../../feedback/error-state";
import { PendingButton } from "../../feedback/pending-button";
import { WorkspaceTile } from "../workspace-tile";
import { FormMessage } from "@/components/feedback/form-message";
import { LoadingState } from "@/components/feedback/loading-state";
import { StaleNotice } from "@/components/feedback/stale-notice";
import { Button } from "@/components/ui/button";
import type { InvitationScreenState } from "@/lib/organizations/invitations";
import { roleLabel } from "@/lib/organizations/member-policy";

export function AcceptInvitationScreen({
  state,
  stale = false,
  pending = false,
  error,
  onRetry,
  onAccept,
  declining = false,
  onDecline,
  declineDialog,
  signOut,
}: {
  state: InvitationScreenState<Invitation>;
  /** A refresh failed: the loaded invitation stays on screen. */
  stale?: boolean;
  pending?: boolean;
  error?: Error | null;
  onRetry?: () => void;
  onAccept: () => void;
  declining?: boolean;
  onDecline: () => void;
  /** The decline confirmation, while it is open. */
  declineDialog?: ReactNode;
  signOut: ReactNode;
}) {
  const { title, description } = invitationCopy(state);
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
      <AcceptInvitationBody
        state={state}
        stale={stale}
        pending={pending}
        error={error}
        onRetry={onRetry}
        onAccept={onAccept}
        declining={declining}
        onDecline={onDecline}
        declineDialog={declineDialog}
      />
    </AuthFrame>
  );
}

function AcceptInvitationBody({
  state,
  stale,
  pending,
  error,
  onRetry,
  onAccept,
  declining,
  onDecline,
  declineDialog,
}: {
  state: InvitationScreenState<Invitation>;
  stale: boolean;
  pending: boolean;
  error?: Error | null;
  onRetry?: () => void;
  onAccept: () => void;
  declining: boolean;
  onDecline: () => void;
  declineDialog?: ReactNode;
}) {
  if (state.kind === "loading") return <LoadingState label="Loading invitation" rows={2} />;
  if (state.kind === "error")
    return (
      <ErrorState
        variant="compact"
        title="Couldn’t load invitation"
        description="We couldn’t check this invitation. Please try again."
        onRetry={onRetry}
      />
    );
  if (state.kind === "missing")
    return (
      <Button asChild className="w-full" size="lg">
        <Link to="/organizations">Go to your workspaces</Link>
      </Button>
    );
  return (
    <>
      {stale && <StaleNotice title="This invitation may be out of date." onRetry={onRetry} />}
      <InvitationDetails invitation={state.invitation} />
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
  );
}

type Invitation = { organizationName: string; role: string; email: string; inviterEmail?: string };

function invitationCopy(state: InvitationScreenState<Invitation>) {
  if (state.kind === "ready")
    return {
      title: `Join ${state.invitation.organizationName}`,
      description: "You were invited to this workspace. Accept to open it.",
    };
  if (state.kind === "missing")
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
