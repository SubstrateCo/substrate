import type { ReactNode } from "react";

import { AuthFrame } from "../../auth/auth-frame";
import { AuthNavLink } from "../../auth/auth-link";
import { FormMessage } from "../../auth/form-message";
import { ContentNotice } from "../../feedback/content-notice";
import { ErrorState } from "../../feedback/error-state";
import { LoadingState } from "../../feedback/loading-state";
import { PendingButton } from "../../feedback/pending-button";
import { initials } from "@/lib/people/initials";
import { MailX } from "lucide-react";

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
  const ready = !loading && !failed && !unavailable && invitation;
  return (
    <AuthFrame
      title={ready ? `Join ${ready.organizationName}` : "Join your team"}
      description={
        ready
          ? "You were invited to this workspace. Accept to open it."
          : "Accept your invitation to open the workspace."
      }
      actions={
        <>
          <AuthNavLink href={workspacesHref}>Your workspaces</AuthNavLink>
          {signOut}
        </>
      }
    >
      {loading && <LoadingState label="Loading invitation." rows={2} />}
      {!loading && failed && !unavailable && (
        <ErrorState
          compact
          title="Couldn't load invitation"
          description="We couldn't check this invitation. Please try again."
          onRetry={onRetry}
        />
      )}
      {!loading && unavailable && (
        <ContentNotice
          icon={MailX}
          title="Invitation unavailable"
          description="It may have expired, been canceled, or been sent to another email. Sign in with the invited email, or ask the owner for a new invitation."
        />
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
          {!available ? (
            <ContentNotice
              icon={MailX}
              title="Invitation unavailable"
              description="This invitation is no longer available. Ask the owner for a new invitation."
            />
          ) : (
            <>
              <FormMessage
                error={error}
                errorDescription="We couldn't accept this invitation. Please try again."
              />
              <PendingButton
                className="w-full"
                size="lg"
                pending={pending}
                pendingLabel="Joining."
                onClick={onAccept}
              >
                Accept invitation
              </PendingButton>
            </>
          )}
        </>
      )}
    </AuthFrame>
  );
}
