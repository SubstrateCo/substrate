import type { SharingDetails } from "@/api/messaging/sharing";
import { Button } from "@/components/ui/button";

function invitationLabel(invite: SharingDetails["invitations"][number], now: number) {
  if (invite.status !== "pending") return invite.status;
  if (new Date(invite.expiresAt).getTime() <= now) return "expired";
  if (invite.deliveredAt) return "pending · email sent";
  if (invite.deliveryAttempts >= 5) return "pending · email delivery failed";
  return "pending · email queued";
}

export function SharingDetailsView({
  details,
  organizationId,
  now,
  pending,
  onDisconnect,
  onRemove,
  onResend,
  onRevoke,
}: {
  details: SharingDetails;
  organizationId: string;
  now: number;
  pending: boolean;
  onDisconnect: (id: string) => void;
  onRemove: (id: string) => void;
  onResend: (id: string) => void;
  onRevoke: (id: string) => void;
}) {
  return (
    <>
      <section className="space-y-3">
        <h3 className="font-medium">Connected organizations</h3>
        {!details.connections.length && (
          <p className="text-sm text-muted-foreground">No approved partner organizations yet.</p>
        )}
        {details.connections.map((connection) => (
          <div
            key={connection.organizationId}
            className="flex flex-wrap items-center justify-between gap-3"
          >
            <span className="text-sm">
              {connection.name} · {connection.disconnectedAt ? "disconnected" : "connected"}
            </span>
            {!connection.disconnectedAt && (
              <Button
                variant="destructive"
                disabled={pending}
                onClick={() => onDisconnect(connection.organizationId)}
              >
                Disconnect
              </Button>
            )}
          </div>
        ))}
      </section>
      <section className="space-y-3">
        <h3 className="font-medium">External participants</h3>
        {details.participants.map((person) => (
          <div key={person.actorId} className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm">
              {person.name} · {person.consentedAt ? "approved" : "reapproval required"}
            </span>
            <Button variant="outline" disabled={pending} onClick={() => onRemove(person.actorId)}>
              Remove participant
            </Button>
          </div>
        ))}
      </section>
      <section className="space-y-3">
        <h3 className="font-medium">Invitations</h3>
        {!details.invitations.length && (
          <p className="text-sm text-muted-foreground">No invitations yet.</p>
        )}
        {details.invitations.map((invite) => (
          <div key={invite.id} className="space-y-2">
            <p className="text-sm wrap-anywhere">
              {invite.email} · {invitationLabel(invite, now)}
            </p>
            {invite.status === "pending" && (
              <div className="flex gap-2">
                {invite.senderOrganizationId === organizationId && (
                  <Button variant="outline" disabled={pending} onClick={() => onResend(invite.id)}>
                    Resend
                  </Button>
                )}
                <Button variant="outline" disabled={pending} onClick={() => onRevoke(invite.id)}>
                  Revoke
                </Button>
              </div>
            )}
          </div>
        ))}
      </section>
      <section className="space-y-2">
        <h3 className="font-medium">Sharing activity</h3>
        {details.events.map((event) => (
          <p key={event.id} className="text-sm text-muted-foreground">
            {event.action} · {event.userName} · {new Date(event.createdAt).toLocaleString()}
          </p>
        ))}
      </section>
    </>
  );
}
