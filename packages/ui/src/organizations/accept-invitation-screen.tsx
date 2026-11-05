import type { ReactNode } from "react";
import { AuthFrame } from "../auth/auth-frame";
import { FormMessage } from "../auth/form-message";
import { Button } from "../primitives/button";

export function AcceptInvitationScreen({
  invitation,
  loading = false,
  pending = false,
  error,
  failed = false,
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
  available: boolean;
  onAccept: () => void;
  signOut: ReactNode;
  workspacesHref: string;
}) {
  return (
    <AuthFrame title="Join your team" description="Accept your invitation to enter the workspace.">
      <div className="min-h-44 space-y-4">
        {loading && (
          <div role="status" className="space-y-4">
            <span className="sr-only">Loading invitation…</span>
            <div
              aria-hidden="true"
              className="h-6 w-3/4 rounded-lg bg-muted motion-safe:animate-pulse"
            />
            <div
              aria-hidden="true"
              className="h-4 w-full rounded-lg bg-muted motion-safe:animate-pulse"
            />
            <div aria-hidden="true" className="h-8 rounded-lg bg-muted motion-safe:animate-pulse" />
          </div>
        )}
        <FormMessage error={error} />
        {failed && (
          <p className="text-sm text-muted-foreground">
            The invitation may have expired, been canceled, or belong to another email address. Sign
            in with the invited email or ask the owner for a new invitation.
          </p>
        )}
        {!loading && !failed && invitation && (
          <div className="space-y-4">
            <p>
              Join <strong>{invitation.organizationName}</strong> as{" "}
              <strong>{invitation.role}</strong>.
            </p>
            <p className="text-sm text-muted-foreground">Invited email: {invitation.email}</p>
            {!available ? (
              <FormMessage message="This invitation is no longer available. Ask the owner for a new invitation." />
            ) : (
              <Button className="w-full" disabled={pending} onClick={onAccept}>
                {pending ? "Joining…" : "Accept invitation"}
              </Button>
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
