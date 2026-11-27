import type { OrganizationRole } from "@substrate/contracts/auth/permissions";

import { useState } from "react";

import { ConfirmDialog } from "../../feedback/confirm-dialog";
import { InvitationForm, type InvitationRoleOption } from "./invitation-form";
import { InvitationTable } from "./invitation-table";
import { FormMessage } from "@/components/feedback/form-message";
import { GroupTitle, SettingsCard } from "@/components/layout/settings-section";
import { Heading } from "@/components/ui/heading";
import { Spinner } from "@/components/ui/spinner";

export type InvitationListItem = {
  id: string;
  email: string;
  role: OrganizationRole;
  status: string;
  expired: boolean;
  expiresAt: Date | string;
};

const inviteDescription = "Invite people by email. They join with the role you pick.";

/**
 * `framed` shows the form in a settings card with sent invitations below it.
 * Otherwise, setup shows only the form with its own heading.
 */
export function InvitationManager({
  roles,
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
  onCopyLink,
}: {
  /** The roles the viewer may invite with. */
  roles: readonly InvitationRoleOption[];
  invitations?: InvitationListItem[];
  loading?: boolean;
  sending?: boolean;
  canceling?: boolean;
  error?: Error | null;
  loadError?: Error | null;
  framed?: boolean;
  onRetry: () => void;
  onInvite: (email: string, role: OrganizationRole, resend?: boolean) => void;
  onCancel: (id: string) => void;
  /** Copies an invitation's link to the clipboard. Rejects when it could not. */
  onCopyLink: (id: string) => Promise<void>;
}) {
  const busy = sending || canceling;
  const [confirming, setConfirming] = useState<InvitationListItem>();
  const form = (
    <div className="@container">
      <InvitationForm roles={roles} sending={sending} disabled={busy} onInvite={onInvite} />
      <FormMessage
        error={error}
        errorDescription="We couldn’t update this invitation. Check the email and try again."
      />
    </div>
  );
  // The table brings its own border, so the list is never framed in a second card.
  const sent = (
    <section aria-labelledby="sent-invitations-title" className="space-y-3">
      <GroupTitle id="sent-invitations-title" title="Sent invitations" />
      {canceling && (
        <div role="status" className="flex items-center text-muted-foreground">
          <Spinner aria-hidden="true" role="presentation" />
          <span className="sr-only">Canceling invitation</span>
        </div>
      )}
      <InvitationTable
        invitations={invitations}
        loading={loading}
        error={loadError}
        busy={busy}
        onRetry={onRetry}
        onInvite={onInvite}
        onCopyLink={onCopyLink}
        onCancel={(id) => setConfirming(invitations?.find((invitation) => invitation.id === id))}
      />
      {confirming && (
        <ConfirmDialog
          destructive
          title="Cancel this invitation?"
          description={`${confirming.email} won’t be able to join with this invitation. You can invite them again later.`}
          cancelLabel="Keep invitation"
          confirmLabel="Cancel invitation"
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
    <section className="space-y-4" aria-labelledby="invite-team-title">
      <header className="space-y-1">
        <Heading level={2} id="invite-team-title">
          Invite your team
        </Heading>
        <p className="text-sm text-muted-foreground">{inviteDescription}</p>
      </header>
      {form}
    </section>
  );
}
