import { useState } from "react";

import { FormMessage } from "../../auth/form-message";
import { ConfirmDialog } from "../../feedback/confirm-dialog";
import { GroupTitle, SettingsCard } from "../../layout/settings-section";
import { Spinner } from "../../ui/spinner";
import { InvitationForm } from "./invitation-form";
import { InvitationTable } from "./invitation-table";

export type InvitationRole = "owner" | "admin" | "member";
export type InvitationListItem = {
  id: string;
  email: string;
  role: InvitationRole;
  status: string;
  expired: boolean;
  expiresAt: Date | string;
};

const inviteDescription = "Invite people by email. They join with the role you pick.";

/**
 * The invitation form and the sent invitations. `framed` puts the form in a settings card under
 * a page header; otherwise the section brings its own heading, as in setup.
 */
export function InvitationManager({
  invitations,
  loading = false,
  sending = false,
  canceling = false,
  error,
  loadError,
  framed = false,
  onRetry,
  onInvite,
  onCancel,
}: {
  invitations?: InvitationListItem[];
  loading?: boolean;
  sending?: boolean;
  canceling?: boolean;
  error?: Error | null;
  loadError?: Error | null;
  framed?: boolean;
  onRetry: () => void;
  onInvite: (email: string, role: InvitationRole, resend?: boolean) => void;
  onCancel: (id: string) => void;
}) {
  const busy = sending || canceling;
  const [confirming, setConfirming] = useState<InvitationListItem>();
  const form = (
    <div className="@container">
      <InvitationForm sending={sending} disabled={busy} onInvite={onInvite} />
      <FormMessage
        error={error}
        errorDescription="We couldn't update this invitation. Check the email and try again."
      />
    </div>
  );
  const sent = (
    <section aria-labelledby="sent-invitations-title" className="space-y-3">
      <GroupTitle id="sent-invitations-title" title="Sent invitations" />
      {canceling && (
        <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner aria-hidden="true" role="presentation" />
          Canceling invitation.
        </div>
      )}
      <InvitationTable
        invitations={invitations}
        loading={loading}
        error={loadError}
        busy={busy}
        onRetry={onRetry}
        onInvite={onInvite}
        onCancel={(id) => setConfirming(invitations?.find((invitation) => invitation.id === id))}
      />
      {confirming && (
        <ConfirmDialog
          destructive
          title="Cancel this invitation?"
          description={`${confirming.email} won't be able to join with this invitation. You can invite them again later.`}
          cancelLabel="Keep invitation"
          confirmLabel="Cancel invitation"
          pendingLabel="Canceling"
          pending={canceling}
          onClose={() => setConfirming(undefined)}
          onConfirm={() => {
            onCancel(confirming.id);
            setConfirming(undefined);
          }}
        />
      )}
    </section>
  );
  if (framed)
    return (
      <>
        <SettingsCard title="Invite people" description={inviteDescription}>
          {form}
        </SettingsCard>
        {sent}
      </>
    );
  return (
    <section className="space-y-6" aria-labelledby="invite-team-title">
      <header className="space-y-1">
        <h2 id="invite-team-title" className="text-sm font-semibold">
          Invite your team
        </h2>
        <p className="text-sm text-muted-foreground">{inviteDescription}</p>
      </header>
      {form}
      {sent}
    </section>
  );
}
