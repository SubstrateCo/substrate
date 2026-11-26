import {
  pendingInvitationStatus,
  sharingEventLabels,
} from "@substrate/contracts/messaging/sharing";

import type { ReactNode } from "react";
import { View } from "react-native";

import { SheetSection } from "../shared/panel-sheet";
import { PersonAvatar } from "../shared/person-avatar";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import type { SharingDetails } from "@/features/messaging/types";
import { cn } from "@/lib/utils";
import { Building2, Mail, RotateCcw, UserMinus, X } from "lucide-react-native";

function Row({
  leading,
  title,
  status,
  warning,
  actions,
}: {
  leading: ReactNode;
  title: string;
  status: string;
  warning?: boolean;
  actions?: ReactNode;
}) {
  return (
    <View className="min-h-12 flex-row items-center gap-3">
      {leading}
      <View className="min-w-0 flex-1">
        <Text className="text-[15px]" numberOfLines={1}>
          {title}
        </Text>
        <Text
          className={cn("text-xs", warning ? "text-destructive" : "text-muted-foreground")}
          numberOfLines={2}
        >
          {status}
        </Text>
      </View>
      {actions}
    </View>
  );
}

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
  onDisconnect: (id: string, name: string) => void;
  onRemove: (id: string, name: string) => void;
  onResend: (id: string) => void;
  onRevoke: (id: string, email: string) => void;
}) {
  const orgName = (id: string) =>
    details.connections.find((connection) => connection.organizationId === id)?.name;
  const invitations = details.invitations.filter((invite) => invite.status === "pending");
  if (
    ![details.connections, details.participants, invitations, details.events].some(
      (rows) => rows.length,
    )
  )
    return (
      <Text className="text-sm text-muted-foreground">
        No one outside your organization has access yet.
      </Text>
    );
  return (
    <View className="gap-5">
      {details.connections.length ? (
        <SheetSection title="Organizations">
          {details.connections.map((connection) => (
            <Row
              key={connection.organizationId}
              leading={<Icon as={Building2} className="size-4 text-muted-foreground" />}
              title={connection.name}
              status={connection.disconnectedAt ? "Disconnected" : "Connected"}
              actions={
                !connection.disconnectedAt ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onPress={() => onDisconnect(connection.organizationId, connection.name)}
                  >
                    <Text className="text-destructive">Disconnect</Text>
                  </Button>
                ) : null
              }
            />
          ))}
        </SheetSection>
      ) : null}
      {details.participants.length ? (
        <SheetSection title="People">
          {details.participants.map((person) => {
            const from = orgName(person.organizationId) ?? "External";
            return (
              <Row
                key={person.actorId}
                leading={<PersonAvatar name={person.name} image={person.image} size="sm" />}
                title={person.name}
                status={
                  person.consentedAt ? from : `${from} · Must accept again to read new messages`
                }
                warning={!person.consentedAt}
                actions={
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={pending}
                    onPress={() => onRemove(person.actorId, person.name)}
                    accessibilityLabel={`Remove ${person.name}`}
                  >
                    <Icon as={UserMinus} className="size-4 text-destructive" />
                  </Button>
                }
              />
            );
          })}
        </SheetSection>
      ) : null}
      {invitations.length ? (
        <SheetSection title="Invitations">
          {invitations.map((invite) => {
            const status = pendingInvitationStatus(invite, now);
            return (
              <Row
                key={invite.id}
                leading={<Icon as={Mail} className="size-4 text-muted-foreground" />}
                title={invite.email}
                status={status.text}
                warning={status.warning}
                actions={
                  <>
                    {invite.senderOrganizationId === organizationId ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={pending}
                        onPress={() => onResend(invite.id)}
                        accessibilityLabel={`Resend invitation to ${invite.email}`}
                      >
                        <Icon as={RotateCcw} className="size-4 text-foreground" />
                      </Button>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={pending}
                      onPress={() => onRevoke(invite.id, invite.email)}
                      accessibilityLabel={`Revoke invitation to ${invite.email}`}
                    >
                      <Icon as={X} className="size-4 text-destructive" />
                    </Button>
                  </>
                }
              />
            );
          })}
        </SheetSection>
      ) : null}
      {details.events.length ? (
        <SheetSection title="Activity">
          {details.events.map((event) => (
            <Text key={event.id} className="py-1 text-sm" numberOfLines={2}>
              <Text className="text-sm font-medium">{event.userName}</Text>
              <Text className="text-sm text-muted-foreground">{` ${sharingEventLabels[event.action]} · ${new Date(event.createdAt).toLocaleDateString()}`}</Text>
            </Text>
          ))}
        </SheetSection>
      ) : null}
    </View>
  );
}
