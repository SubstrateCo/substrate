import type { ReactNode } from "react";

import type { SharingDetails } from "@/api/messaging/sharing";
import { Tag } from "@/components/feedback/tag";
import { RowAction, RowActions } from "@/components/layout/row-actions";
import { PersonAvatar } from "@/components/people/person-avatar";
import { Timestamp } from "@/components/time/timestamp";
import { Button } from "@/components/ui/button";
import { Building2, Mail, RotateCcw, TriangleAlert, UserMinus, X } from "lucide-react";

type Invitation = SharingDetails["invitations"][number];

const eventLabels: Record<SharingDetails["events"][number]["action"], string> = {
  invited: "sent an invitation",
  "approval-requested": "requested organization approval",
  accepted: "accepted an invitation",
  revoked: "revoked an invitation",
  declined: "declined an invitation",
  disconnected: "disconnected an organization",
  removed: "removed a participant",
};

// Answered invitations show up as people and activity instead.
function pendingStatus(invite: Invitation, now: number) {
  if (new Date(invite.expiresAt).getTime() <= now) return { text: "Expired", warning: true };
  if (invite.deliveryAttempts >= 5 && !invite.deliveredAt)
    return { text: "Email couldn’t be delivered", warning: true };
  return {
    text: invite.deliveredAt ? "Waiting for a reply · email sent" : "Waiting · email queued",
    warning: false,
  };
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  /** One warning for the whole list, so the rows need not repeat it. */
  note?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-1">
      <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      {note && (
        <p className="flex items-start gap-1.5 text-xs font-medium text-warning">
          <TriangleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0" />
          {note}
        </p>
      )}
      <ul className="grid gap-0.5">{children}</ul>
    </section>
  );
}

function Row({
  icon,
  title,
  status,
  warning = false,
  actions,
}: {
  icon: ReactNode;
  title: ReactNode;
  status: ReactNode;
  warning?: boolean;
  actions?: ReactNode;
}) {
  return (
    <li className="group/row flex min-h-11 items-center gap-3 rounded-md py-1.5">
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{title}</span>
        <span
          className={
            warning
              ? "flex items-center gap-1 text-xs font-medium text-warning"
              : "block truncate text-xs text-muted-foreground"
          }
        >
          {warning && <TriangleAlert aria-hidden="true" className="size-3.5 shrink-0" />}
          {status}
        </span>
      </span>
      {actions}
    </li>
  );
}

const iconBox = "flex size-6 shrink-0 items-center justify-center rounded-md bg-muted";

/** Who outside the organization has access, who is invited, and what changed. */
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
  const organizationName = (id: string) =>
    details.connections.find((connection) => connection.organizationId === id)?.name;
  const invitations = details.invitations.filter((invite) => invite.status === "pending");
  const waiting = details.participants.filter((person) => !person.consentedAt).length;
  const sections = [details.connections, details.participants, invitations, details.events];
  if (sections.every((rows) => rows.length === 0))
    return (
      <p className="text-sm text-muted-foreground">
        No one outside your organization has access yet.
      </p>
    );
  return (
    <div className="grid gap-5">
      {details.connections.length > 0 && (
        <Section title="Organizations">
          {details.connections.map((connection) => (
            <Row
              key={connection.organizationId}
              icon={
                <span className={iconBox}>
                  <Building2 aria-hidden="true" className="size-3.5 text-muted-foreground" />
                </span>
              }
              title={connection.name}
              status={connection.disconnectedAt ? "Disconnected" : "Connected"}
              actions={
                !connection.disconnectedAt && (
                  <Button
                    size="sm"
                    variant="destructive-ghost"
                    disabled={pending}
                    onClick={() => onDisconnect(connection.organizationId)}
                  >
                    Disconnect
                  </Button>
                )
              }
            />
          ))}
        </Section>
      )}
      {details.participants.length > 0 && (
        <Section
          title="People"
          note={
            waiting > 0 &&
            `${waiting === 1 ? "1 person needs" : `${waiting} people need`} to accept again before they can read new messages.`
          }
        >
          {details.participants.map((person) => {
            const from = organizationName(person.organizationId);
            return (
              <Row
                key={person.actorId}
                icon={<PersonAvatar name={person.name} />}
                title={
                  <>
                    {person.name}
                    {!person.consentedAt && (
                      <Tag className="ml-2 align-middle">Needs to accept</Tag>
                    )}
                  </>
                }
                status={from ?? "External"}
                actions={
                  <RowActions label={`Actions for ${person.name}`}>
                    <RowAction
                      label={`Remove ${person.name}`}
                      destructive
                      disabled={pending}
                      onClick={() => onRemove(person.actorId)}
                    >
                      <UserMinus />
                    </RowAction>
                  </RowActions>
                }
              />
            );
          })}
        </Section>
      )}
      {invitations.length > 0 && (
        <Section title="Invitations">
          {invitations.map((invite) => {
            const status = pendingStatus(invite, now);
            return (
              <Row
                key={invite.id}
                icon={
                  <span className={iconBox}>
                    <Mail aria-hidden="true" className="size-3.5 text-muted-foreground" />
                  </span>
                }
                title={<span className="wrap-anywhere">{invite.email}</span>}
                status={status.text}
                warning={status.warning}
                actions={
                  <RowActions label={`Actions for ${invite.email}`}>
                    {invite.senderOrganizationId === organizationId && (
                      <RowAction
                        label="Resend invitation"
                        disabled={pending}
                        onClick={() => onResend(invite.id)}
                      >
                        <RotateCcw />
                      </RowAction>
                    )}
                    <RowAction
                      label="Revoke invitation"
                      destructive
                      disabled={pending}
                      onClick={() => onRevoke(invite.id)}
                    >
                      <X />
                    </RowAction>
                  </RowActions>
                }
              />
            );
          })}
        </Section>
      )}
      {details.events.length > 0 && (
        <section className="grid gap-1">
          <h3 className="text-xs font-medium text-muted-foreground">Activity</h3>
          <ul className="grid gap-1.5">
            {details.events.map((event) => (
              <li key={event.id} className="flex items-baseline gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium">{event.userName}</span>{" "}
                  <span className="text-muted-foreground">{eventLabels[event.action]}</span>
                </span>
                <Timestamp
                  value={event.createdAt}
                  format="relative"
                  className="shrink-0 text-xs text-muted-foreground"
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
