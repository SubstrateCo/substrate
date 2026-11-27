import {
  canLeave,
  canManageOwnAgents,
  canRemovePerson,
} from "@substrate/contracts/messaging/permissions";

import { useState } from "react";
import { View } from "react-native";

import { PanelSheet, SheetSection } from "../shared/panel-sheet";
import { SharingSheet } from "../sharing/sharing-sheet";
import { AddMembersForm } from "./add-members-form";
import { AgentAppearanceSheet } from "./agent-appearance-sheet";
import { AgentsSection } from "./agents-section";
import { MembersSection } from "./members-section";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import {
  leaveOwnerCandidates,
  ownerCandidates,
} from "@/features/messaging/conversations/conversation-access";
import {
  conversationLabel,
  humanMembers,
  leaveConsequence,
} from "@/features/messaging/conversations/conversation-rules";
import { recipientEmails } from "@/features/messaging/conversations/recipients";
import {
  useConversationManagement,
  useDeleteImpact,
} from "@/features/messaging/queries/use-conversation-management";
import { useOwnAgents, useWorkspacePeople } from "@/features/messaging/queries/use-conversations";
import type { Conversation, ConversationMember } from "@/features/messaging/types";
import { ConfirmSheet, PickerSheet } from "@/features/records/ui/sheet";
import { MutationError } from "@/features/records/ui/states";

type Panel =
  | { kind: "add" }
  | { kind: "sharing" }
  | { kind: "remove"; member: ConversationMember }
  | { kind: "leave"; newOwnerUserId?: string }
  | { kind: "pick-owner"; purpose: "leave" | "transfer" }
  | { kind: "transfer"; userId: string; name: string }
  | { kind: "delete" }
  | { kind: "appearance"; agentId: string };

/** Members, agents, sharing and management for one conversation. */
export function ConversationDetailsSheet({
  organizationId,
  conversation,
  viewerId,
  onProfile,
  onClose,
}: {
  organizationId: string;
  conversation: Conversation;
  viewerId: string;
  onProfile: (actorId: string) => void;
  onClose: () => void;
}) {
  const [panel, setPanel] = useState<Panel>();
  const manage = useConversationManagement(organizationId, conversation.id);
  const people = useWorkspacePeople(organizationId);
  const agents = useOwnAgents(organizationId);
  const impact = useDeleteImpact(organizationId, conversation.id, panel?.kind === "delete");
  const name = conversationLabel(conversation);
  const leaving = canLeave(conversation);
  const leaveCandidates = leaveOwnerCandidates(conversation, viewerId);
  const transferCandidates = ownerCandidates(conversation);
  const memberIds = new Set(humanMembers(conversation.members).map((person) => person.userId));
  const kindNoun = conversation.kind === "channel" ? "channel" : "group";
  let busyAgent: string | undefined;
  if (manage.addAgent.isPending) busyAgent = manage.addAgent.variables;
  else if (manage.removeAgent.isPending)
    busyAgent =
      conversation.members.find((member) => member.actorId === manage.removeAgent.variables)
        ?.agentId ?? undefined;

  return (
    <PanelSheet title={name} onClose={onClose}>
      <MembersSection
        conversation={conversation}
        viewerId={viewerId}
        canRemove={(member) => canRemovePerson(conversation, viewerId, member)}
        onRemove={(member) => setPanel({ kind: "remove", member })}
        onProfile={(member) => onProfile(member.actorId)}
      />
      {conversation.canManage ? (
        <Button variant="outline" onPress={() => setPanel({ kind: "add" })}>
          <Text>Add people</Text>
        </Button>
      ) : null}
      {canManageOwnAgents(conversation) ? (
        <AgentsSection
          agents={agents.data}
          members={conversation.members}
          loading={agents.isPending}
          loadError={agents.error}
          error={manage.addAgent.error ?? manage.removeAgent.error}
          busyId={busyAgent}
          onAdd={(agentId) => manage.addAgent.mutate(agentId)}
          onRemove={(actorId) => manage.removeAgent.mutate(actorId)}
          onAppearance={(agentId) => setPanel({ kind: "appearance", agentId })}
        />
      ) : null}
      {conversation.canShare || leaving || conversation.canManage ? (
        <SheetSection title="Manage">
          <View className="gap-2">
            {conversation.canShare ? (
              <Button variant="outline" onPress={() => setPanel({ kind: "sharing" })}>
                <Text>External collaboration</Text>
              </Button>
            ) : null}
            {conversation.canManage && transferCandidates.length ? (
              <Button
                variant="outline"
                onPress={() => setPanel({ kind: "pick-owner", purpose: "transfer" })}
              >
                <Text>Change owner</Text>
              </Button>
            ) : null}
            <MutationError error={manage.transfer.error} />
            {leaving ? (
              <Button
                variant="outline"
                onPress={() =>
                  setPanel(
                    leaveCandidates.length
                      ? { kind: "pick-owner", purpose: "leave" }
                      : { kind: "leave" },
                  )
                }
              >
                <Text className="text-destructive">{`Leave ${kindNoun}`}</Text>
              </Button>
            ) : null}
            {conversation.canManage ? (
              <Button variant="outline" onPress={() => setPanel({ kind: "delete" })}>
                <Text className="text-destructive">{`Delete ${kindNoun}`}</Text>
              </Button>
            ) : null}
          </View>
        </SheetSection>
      ) : null}

      {panel?.kind === "add" ? (
        <AddMembersForm
          name={name}
          channel={conversation.kind === "channel"}
          people={(people.data ?? []).filter((person) => !memberIds.has(person.id))}
          pending={manage.addMembers.isPending}
          error={manage.addMembers.error}
          onClose={() => setPanel(undefined)}
          onSubmit={(recipients, shareHistory) =>
            manage.addMembers.mutate(
              { emails: recipientEmails(recipients), shareHistory },
              { onSuccess: () => setPanel(undefined) },
            )
          }
        />
      ) : null}
      {panel?.kind === "appearance" ? (
        <AgentAppearanceSheet
          organizationId={organizationId}
          agentId={panel.agentId}
          onClose={() => setPanel(undefined)}
        />
      ) : null}
      {panel?.kind === "sharing" ? (
        <SharingSheet
          organizationId={organizationId}
          conversationId={conversation.id}
          name={name}
          onClose={() => setPanel(undefined)}
        />
      ) : null}
      {panel?.kind === "remove" ? (
        <ConfirmSheet
          title={`Remove ${panel.member.name}?`}
          description={
            conversation.kind === "channel" && !conversation.private
              ? "This ends their membership. This channel is public: they can still read its history, post, and rejoin."
              : "They and their agents lose access through this organization. Their past messages and linked work remain."
          }
          confirmLabel="Remove member"
          destructive
          pending={manage.removeMember.isPending}
          error={manage.removeMember.error}
          onCancel={() => setPanel(undefined)}
          onConfirm={() =>
            manage.removeMember.mutate(panel.member.actorId, {
              onSuccess: () => setPanel(undefined),
            })
          }
        />
      ) : null}
      {panel?.kind === "pick-owner" ? (
        <PickerSheet
          title={panel.purpose === "leave" ? "Choose a new owner" : "Change owner"}
          choices={(panel.purpose === "leave" ? leaveCandidates : transferCandidates).map(
            (person) => ({
              value: person.userId,
              label: person.name,
            }),
          )}
          value={undefined}
          onSelect={(userId) => {
            const person = conversation.members.find((member) => member.userId === userId);
            setPanel(
              panel.purpose === "leave"
                ? { kind: "leave", newOwnerUserId: userId }
                : { kind: "transfer", userId, name: person?.name ?? "this person" },
            );
          }}
          onClose={() =>
            setPanel((current) => (current?.kind === "pick-owner" ? undefined : current))
          }
        />
      ) : null}
      {panel?.kind === "transfer" ? (
        <ConfirmSheet
          title={`Make ${panel.name} the owner?`}
          description="The new owner manages members and settings. You stay a member."
          confirmLabel="Change owner"
          pending={manage.transfer.isPending}
          error={manage.transfer.error}
          onCancel={() => setPanel(undefined)}
          onConfirm={() =>
            manage.transfer.mutate(panel.userId, { onSuccess: () => setPanel(undefined) })
          }
        />
      ) : null}
      {panel?.kind === "leave" ? (
        <ConfirmSheet
          title={`Leave ${name}?`}
          description={`${leaveConsequence(conversation)}${panel.newOwnerUserId ? " Ownership moves to the person you chose." : ""}`}
          confirmLabel={`Leave ${kindNoun}`}
          destructive
          pending={manage.leave.isPending}
          error={manage.leave.error}
          onCancel={() => setPanel(undefined)}
          onConfirm={() => manage.leave.mutate(panel.newOwnerUserId, { onSuccess: onClose })}
        />
      ) : null}
      {panel?.kind === "delete" ? (
        <ConfirmSheet
          title={`Delete ${name}?`}
          description={`Its messages are deleted for everyone.${impact.data?.linkedWork ? ` ${impact.data.linkedWork} linked records stay, without this conversation.` : ""}`}
          confirmLabel={`Delete ${kindNoun}`}
          destructive
          pending={manage.remove.isPending || impact.isPending}
          error={manage.remove.error ?? impact.error}
          onCancel={() => setPanel(undefined)}
          onConfirm={() => manage.remove.mutate(undefined, { onSuccess: onClose })}
        />
      ) : null}
    </PanelSheet>
  );
}
