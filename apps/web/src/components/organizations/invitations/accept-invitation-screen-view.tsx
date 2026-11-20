import type { ReactNode } from "react";

import { AuthFrame } from "../../auth/auth-frame";
import { AuthNavLink } from "../../auth/auth-link";
import { ErrorState } from "../../feedback/error-state";
import { LoadingState } from "../../feedback/loading-state";
import { PendingButton } from "../../feedback/pending-button";
import { Button } from "../../ui/button";
import { FormMessage } from "@/components/feedback/form-message";
import { initials } from "@/lib/people/initials";

/** "admin,member" -> "Admin, Member". */
function roleLabel(role: string) {
  return role
    .split(",")
    .map((value) => value.trim())
    .map((value) => value.charAt(0).toUpperCase() + value.slice(1))
    .join(", ");
}

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
  workspacesHref,
}: {
  invitation?: { organizationName: string; role: string; email: string; inviterEmail?: string };
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
  workspacesHref: string;
}) {
  const missing = !loading && (unavailable || (!!invitation && !available));
  const ready = !loading && !failed && !missing && invitation;
  let title = "Join your team";
  let description = "Accept your invitation to open the workspace.";
  if (ready) {
    title = `Join ${ready.organizationName}`;
    description = "You were invited to this workspace. Accept to open it.";
  } else if (missing) {
    title = "This invitation isn’t available";
    description =
      "It may have expired, been canceled, or been sent to another email. Sign in with the invited email, or ask the owner for a new invitation.";
  }
  return (
    <AuthFrame
      title={title}
      description={description}
      actions={
        <>
          <AuthNavLink href={workspacesHref}>Workspaces</AuthNavLink>
          {signOut}
        </>
      }
    >
      {loading && <LoadingState label="Loading invitation." rows={2} />}
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
          <a href={workspacesHref}>Go to your workspaces</a>
        </Button>
      )}
      {ready && (
        <>
          <div className="flex items-center gap-3 rounded-lg border p-3 wrap-anywhere">
            <span
              aria-hidden="true"
              className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent text-xs font-semibold text-accent-foreground"
            >
              {initials(ready.organizationName)}
            </span>
            <dl className="min-w-0 text-sm">
              <dt className="sr-only">Workspace</dt>
              <dd className="font-medium">{ready.organizationName}</dd>
              <dt className="sr-only">Role</dt>
              <dd className="text-muted-foreground">Joining as {roleLabel(ready.role)}</dd>
            </dl>
          </div>
          <p className="text-sm wrap-anywhere text-muted-foreground">
            Invited email: {ready.email}
          </p>
          {ready.inviterEmail && (
            <p className="text-sm wrap-anywhere text-muted-foreground">
              Invited by: {ready.inviterEmail}
            </p>
          )}
          <>
            <FormMessage
              error={error}
              errorDescription="We couldn’t accept this invitation. Please try again."
            />
            <PendingButton
              className="w-full"
              size="lg"
              pending={pending}
              pendingLabel="Joining."
              disabled={declining}
              onClick={onAccept}
            >
              Accept invitation
            </PendingButton>
            <Button
              type="button"
              variant="ghost"
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
