import {
  pendingInvitationStatus,
  sharingEventLabels,
} from "@substrate/contracts/messaging/sharing";

import type { ReactNode } from "react";

import type { SharingDetails } from "@/api/messaging/sharing";
import { SkeletonText } from "@/components/feedback/skeleton-text";
import { RowAction, RowActions } from "@/components/layout/row-actions";
import { PersonAvatar } from "@/components/people/person-avatar";
import { Timestamp } from "@/components/time/timestamp";
import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, Mail, RotateCcw, TriangleAlert, UserMinus, X } from "lucide-react";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-1">
      <Heading level={3} variant="label">
        {title}
      </Heading>
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
    <Item asChild size="xs" className="group/row">
      <li>
        <ItemMedia>{icon}</ItemMedia>
        <ItemContent className="min-w-0">
          <ItemTitle className="max-w-full">{title}</ItemTitle>
          <ItemDescription>
            <span
              className={
                warning ? "flex items-center gap-1 font-medium text-warning-text" : undefined
              }
            >
              {warning && (
                <TriangleAlert aria-hidden="true" className="size-3.5 shrink-0 text-warning" />
              )}
              {status}
            </span>
          </ItemDescription>
        </ItemContent>
        {actions && <ItemActions>{actions}</ItemActions>}
      </li>
    </Item>
  );
}

const iconBox = "flex size-6 shrink-0 items-center justify-center rounded-md bg-muted";

export function SharingDetailsLoading() {
  return (
    <div role="status" aria-label="Loading sharing">
      <ul aria-hidden="true" className="grid gap-0.5">
        {[0, 1].map((index) => (
          <Row
            key={index}
            icon={<Skeleton className="size-6 shrink-0" />}
            title={<SkeletonText width="8rem" />}
            status={<SkeletonText width="6rem" />}
          />
        ))}
      </ul>
    </div>
  );
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
  const organizationName = (id: string) =>
    details.connections.find((connection) => connection.organizationId === id)?.name;
  const invitations = details.invitations.filter((invite) => invite.status === "pending");
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
        <Section title="People">
          {details.participants.map((person) => {
            const from = organizationName(person.organizationId) ?? "External";
            return (
              <Row
                key={person.actorId}
                icon={<PersonAvatar name={person.name} image={person.image} />}
                title={person.name}
                status={
                  person.consentedAt ? from : `${from} · Must accept again to read new messages`
                }
                warning={!person.consentedAt}
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
            const status = pendingInvitationStatus(invite, now);
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
          <Heading level={3} variant="label">
            Activity
          </Heading>
          <ul className="grid gap-1.5">
            {details.events.map((event) => (
              <li key={event.id} className="flex items-baseline gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium">{event.userName}</span>{" "}
                  <span className="text-muted-foreground">{sharingEventLabels[event.action]}</span>
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
