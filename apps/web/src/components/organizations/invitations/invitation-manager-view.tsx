import { FormMessage } from "../../auth/form-message";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../ui/card";
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

export function InvitationManager({
  invitations,
  loading = false,
  sending = false,
  canceling = false,
  error,
  message,
  loadError,
  onRetry,
  onInvite,
  onCancel,
}: {
  invitations?: InvitationListItem[];
  loading?: boolean;
  sending?: boolean;
  canceling?: boolean;
  error?: Error | null;
  message?: string;
  loadError?: Error | null;
  onRetry: () => void;
  onInvite: (email: string, role: InvitationRole, resend?: boolean) => void;
  onCancel: (id: string) => void;
}) {
  const busy = sending || canceling;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Invite your team</CardTitle>
        <CardDescription>Only workspace owners can send and manage invitations.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <InvitationForm sending={sending} disabled={busy} onInvite={onInvite} />
          <FormMessage
            error={error}
            errorDescription="We couldn’t update this invitation. Check the email and try again."
            message={message}
          />
          <section className="min-h-48 space-y-3">
            <h3 className="text-sm font-medium">Invitations</h3>
            {canceling && (
              <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner aria-hidden="true" role="presentation" />
                Canceling invitation…
              </div>
            )}
            <InvitationTable
              invitations={invitations}
              loading={loading}
              error={loadError}
              busy={busy}
              onRetry={onRetry}
              onInvite={onInvite}
              onCancel={onCancel}
            />
          </section>
        </div>
      </CardContent>
    </Card>
  );
}
