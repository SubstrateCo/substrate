import type { ReactNode } from "react";
import { AuthFrame } from "../auth/auth-frame";
import { FormMessage } from "../auth/form-message";
import { LoadingState } from "../feedback/loading-state";
import { ErrorState } from "../feedback/error-state";
import { ContentNotice } from "../feedback/content-notice";
import { PendingButton } from "../feedback/pending-button";

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
  signOut,
  workspacesHref,
}: {
  invitation?: { organizationName: string; role: string; email: string };
  loading?: boolean;
  pending?: boolean;
  error?: Error | null;
  failed?: boolean;
  unavailable?: boolean;
  onRetry?: () => void;
  available: boolean;
  onAccept: () => void;
  signOut: ReactNode;
  workspacesHref: string;
}) {
  return (
    <AuthFrame title="Join your team" description="Accept your invitation to enter the workspace.">
      <div className="min-h-44 space-y-4">
        {loading && <LoadingState label="Loading invitation…" rows={2} />}
        {!loading && failed && !unavailable && (
          <ErrorState
            title="Couldn’t load invitation"
            description="We couldn’t check this invitation. Please try again."
            onRetry={onRetry}
          />
        )}
        {!loading && unavailable && (
          <ContentNotice
            title="Invitation unavailable"
            description="This invitation may have expired, been canceled, or belong to another email. Sign in with the invited email or ask the owner for a new invitation."
          />
        )}
        {!failed && (
          <FormMessage
            error={error}
            errorDescription="We couldn’t accept this invitation. Please try again."
          />
        )}
        {!loading && !failed && !unavailable && invitation && (
          <div className="space-y-4">
            <p>
              Join <strong>{invitation.organizationName}</strong> as{" "}
              <strong>{invitation.role}</strong>.
            </p>
            <p className="text-sm text-muted-foreground">Invited email: {invitation.email}</p>
            {!available ? (
              <ContentNotice
                title="Invitation unavailable"
                description="This invitation is no longer available. Ask the owner for a new invitation."
              />
            ) : (
              <PendingButton
                className="w-full"
                pending={pending}
                pendingLabel="Joining…"
                onClick={onAccept}
              >
                Accept invitation
              </PendingButton>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center justify-between">
        <a className="text-sm underline" href={workspacesHref}>
          Your workspaces
        </a>
        {signOut}
      </div>
    </AuthFrame>
  );
}
