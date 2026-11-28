import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import type { SharingInvitation } from "@/features/messaging/types";
import { SwitchField } from "@/features/records/ui/fields";
import { MutationError } from "@/features/records/ui/states";
import { Globe } from "lucide-react-native";

export type InvitationOutcome =
  | { kind: "pending" }
  | { kind: "declined" }
  | { kind: "approval-required" }
  | { kind: "accepted"; organizationId: string; conversationId: string | null; here: boolean };

export function InvitationReviewView({
  invitation,
  organizations,
  organizationId,
  confirmed,
  available,
  busy,
  error,
  outcome,
  onChooseOrganization,
  onConfirmed,
  onAccept,
  onDecline,
  onOpen,
  onCheckApproval,
}: {
  invitation: SharingInvitation;
  organizations: { id: string; name: string }[];
  organizationId: string;
  confirmed: boolean;
  available: boolean;
  busy: boolean;
  error: unknown;
  outcome: InvitationOutcome;
  onChooseOrganization: () => void;
  onConfirmed: (value: boolean) => void;
  onAccept: () => void;
  onDecline: () => void;
  onOpen: () => void;
  onCheckApproval: () => void;
}) {
  const workspace = organizations.find((org) => org.id === organizationId)?.name;
  return (
    <View className="gap-4">
      <View className="flex-row gap-3 rounded-lg border border-border p-3">
        <Icon as={Globe} className="mt-0.5 size-4 text-muted-foreground" />
        <View className="flex-1 gap-1">
          <Text className="text-sm">
            <Text className="text-sm font-medium">{invitation.hostName}</Text> invited you to{" "}
            <Text className="text-sm font-medium">{invitation.name ?? "a conversation"}</Text>.
          </Text>
          <Text className="text-xs text-muted-foreground">{`Invited email: ${invitation.email}`}</Text>
          <Text className="text-xs text-muted-foreground">
            {invitation.purpose === "organization"
              ? "An owner or admin must approve for your workspace. Other members can request approval."
              : "Only you are invited. Other members of your workspace don't get access."}
          </Text>
        </View>
      </View>
      {outcome.kind === "declined" ? (
        <Text className="text-sm" accessibilityRole="alert">
          Invitation declined. No access was granted.
        </Text>
      ) : null}
      {outcome.kind === "approval-required" ? (
        <View className="gap-2">
          <Text className="text-sm" accessibilityRole="alert">
            Approval requested. An owner or admin of your workspace must approve this connection. No
            access has been granted yet.
          </Text>
          <Button variant="outline" onPress={onCheckApproval}>
            <Text>Check approval</Text>
          </Button>
        </View>
      ) : null}
      {outcome.kind === "accepted" ? (
        <View className="gap-2">
          <Text className="text-sm" accessibilityRole="alert">
            {outcome.here
              ? "Invitation accepted."
              : "Invitation accepted in another workspace. Switch to it to open the conversation."}
          </Text>
          <Button onPress={onOpen} disabled={busy}>
            <Text>{outcome.here ? "Open conversation" : "Switch workspace"}</Text>
          </Button>
        </View>
      ) : null}
      {outcome.kind === "pending" && !available ? (
        <Text className="text-sm text-muted-foreground">
          This invitation has expired or was already answered.
        </Text>
      ) : null}
      {outcome.kind === "pending" && available ? (
        <>
          <View className="gap-1.5">
            <Text className="text-sm font-medium">Your workspace</Text>
            <Button
              variant="outline"
              disabled={busy || !!invitation.targetOrganizationId}
              onPress={onChooseOrganization}
              accessibilityLabel={`Your workspace: ${workspace ?? "not chosen"}`}
              className="justify-start"
            >
              <Text>{workspace ?? "Choose your workspace"}</Text>
            </Button>
          </View>
          <SwitchField
            label="I understand that participants can read the full conversation history. Linked private records are not shared."
            checked={confirmed}
            onChange={(value) => !busy && onConfirmed(value)}
          />
          <MutationError error={error} />
          <Button disabled={busy || !organizationId || !confirmed} onPress={onAccept}>
            <Text>{busy ? "Working." : "Accept invitation"}</Text>
          </Button>
          <Button variant="outline" disabled={busy} onPress={onDecline}>
            <Text>Decline invitation</Text>
          </Button>
        </>
      ) : null}
    </View>
  );
}
