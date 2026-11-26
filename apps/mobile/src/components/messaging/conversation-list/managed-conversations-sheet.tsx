import { useRef, useState } from "react";
import { View } from "react-native";

import { AddMembersForm } from "../conversation/add-members-form";
import { PanelSheet, SheetSection } from "../shared/panel-sheet";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import {
  conversationLabel,
  managedMemberChoices,
  managedOwnerCandidates,
} from "@/features/messaging/conversations/conversation-rules";
import { recipientEmails } from "@/features/messaging/conversations/recipients";
import {
  useConversationManagement,
  useDeleteImpact,
} from "@/features/messaging/queries/use-conversation-management";
import { useManagedConversations } from "@/features/messaging/queries/use-managed-conversations";
import { useMessagingScope } from "@/features/messaging/scope";
import type { ManagedConversation, WorkspacePerson } from "@/features/messaging/types";
import { ConfirmSheet, PickerSheet } from "@/features/records/ui/sheet";
import { EmptyState, ErrorState, LoadingRows } from "@/features/records/ui/states";

type Action = { kind: "members" | "owner" | "delete"; conversation: ManagedConversation };

export function ManagedConversationsSheet({
  organizationId,
  onClose,
}: {
  organizationId: string;
  onClose: () => void;
}) {
  const { access, list, people } = useManagedConversations(organizationId);
  const [action, setAction] = useState<Action>();
  return (
    <PanelSheet title="Manage conversations" onClose={onClose}>
      <Text className="text-sm text-muted-foreground">
        Every channel and group message in this organization. You see names and members, never
        messages.
      </Text>
      {access.isPending || (access.allowed && list.isPending) ? (
        <LoadingRows label="Loading managed conversations" />
      ) : null}
      {access.error || list.error ? (
        <ErrorState
          error={access.error ?? list.error}
          noun="managed conversations"
          onRetry={() => void (access.error ? access.refetch() : list.refetch())}
        />
      ) : null}
      {!access.isPending && !access.error && !access.allowed ? (
        <EmptyState title="Organization admin access required" />
      ) : null}
      {access.allowed && !list.error
        ? list.data?.map((conversation) => {
            const name = conversationLabel(conversation);
            return (
              <View key={conversation.id} testID={`managed-conversation-${conversation.id}`}>
                <SheetSection title={name}>
                  <Text className="text-xs text-muted-foreground">
                    {`${conversation.private ? "Private" : "Public"} ${conversation.kind === "channel" ? "channel" : "group"} · Owner: ${conversation.ownerName}`}
                  </Text>
                  <Text className="text-sm">
                    {conversation.members.map((member) => member.name).join(", ")}
                  </Text>
                  <View className="flex-row flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      accessibilityLabel={`Add people to ${name}`}
                      onPress={() => setAction({ kind: "members", conversation })}
                    >
                      <Text>Add people</Text>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      accessibilityLabel={`Change owner of ${name}`}
                      onPress={() => setAction({ kind: "owner", conversation })}
                    >
                      <Text>Change owner</Text>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      accessibilityLabel={`Delete ${name}`}
                      onPress={() => setAction({ kind: "delete", conversation })}
                    >
                      <Text className="text-destructive">Delete</Text>
                    </Button>
                  </View>
                </SheetSection>
              </View>
            );
          })
        : null}
      {access.allowed && list.data?.length === 0 ? (
        <EmptyState title="No channels or group messages" />
      ) : null}
      {action &&
      access.allowed &&
      !list.error &&
      list.data?.some((row) => row.id === action.conversation.id) ? (
        <ManagedConversationAction
          key={`${action.conversation.id}:${action.kind}`}
          organizationId={organizationId}
          action={{
            ...action,
            conversation: list.data.find((row) => row.id === action.conversation.id)!,
          }}
          people={people.data ?? []}
          peopleLoading={people.isPending}
          peopleError={people.error}
          retryPeople={() => void people.refetch()}
          onClose={() => setAction(undefined)}
        />
      ) : null}
    </PanelSheet>
  );
}

function ManagedConversationAction({
  organizationId,
  action,
  people,
  peopleLoading,
  peopleError,
  retryPeople,
  onClose,
}: {
  organizationId: string;
  action: Action;
  people: WorkspacePerson[];
  peopleLoading: boolean;
  peopleError: Error | null;
  retryPeople: () => void;
  onClose: () => void;
}) {
  const conversation = action.conversation;
  const { userId } = useMessagingScope(organizationId);
  const name = conversationLabel(conversation);
  const manage = useConversationManagement(organizationId, conversation.id);
  const impact = useDeleteImpact(organizationId, conversation.id, action.kind === "delete");
  const [owner, setOwner] = useState<{ userId: string; name: string }>();
  const ownerPicked = useRef(false);
  if (action.kind === "delete" && impact.error)
    return (
      <PanelSheet title={`Delete ${name}?`} onClose={onClose}>
        <ErrorState
          error={impact.error}
          noun="deletion impact"
          onRetry={() => void impact.refetch()}
        />
      </PanelSheet>
    );
  if (action.kind === "delete")
    return (
      <ConfirmSheet
        title={`Delete ${name}?`}
        description={`Its messages are deleted for everyone.${impact.data?.linkedWork ? ` ${impact.data.linkedWork} linked records stay, without this conversation.` : ""}`}
        confirmLabel={conversation.kind === "channel" ? "Delete channel" : "Delete group"}
        destructive
        pending={manage.remove.isPending || impact.isPending}
        error={manage.remove.error ?? impact.error}
        onCancel={onClose}
        onConfirm={() => manage.remove.mutate(undefined, { onSuccess: onClose })}
      />
    );
  if (peopleLoading || peopleError)
    return (
      <PanelSheet
        title={action.kind === "members" ? "Add people" : "Change owner"}
        onClose={onClose}
      >
        {peopleLoading ? (
          <LoadingRows label="Loading workspace members" />
        ) : (
          <ErrorState error={peopleError} noun="workspace members" onRetry={retryPeople} />
        )}
      </PanelSheet>
    );
  if (action.kind === "members")
    return (
      <AddMembersForm
        name={name}
        channel={conversation.kind === "channel"}
        people={managedMemberChoices(people, conversation.members, userId)}
        pending={manage.addMembers.isPending}
        error={manage.addMembers.error}
        onClose={onClose}
        onSubmit={(recipients, shareHistory) =>
          manage.addMembers.mutate(
            { emails: recipientEmails(recipients), shareHistory },
            { onSuccess: onClose },
          )
        }
      />
    );
  const candidates = managedOwnerCandidates(conversation, people);
  if (!candidates.length)
    return (
      <PanelSheet title="Change owner" onClose={onClose}>
        <EmptyState
          title="No other host members"
          description="Add another person from this organization before changing the owner."
        />
      </PanelSheet>
    );
  if (owner)
    return (
      <ConfirmSheet
        title={`Make ${owner.name} the owner?`}
        description="The new owner manages members and settings."
        confirmLabel="Change owner"
        pending={manage.transfer.isPending}
        error={manage.transfer.error}
        onCancel={() => {
          ownerPicked.current = false;
          setOwner(undefined);
        }}
        onConfirm={() => manage.transfer.mutate(owner.userId, { onSuccess: onClose })}
      />
    );
  return (
    <PickerSheet
      title="Change owner"
      choices={candidates.map((person) => ({ value: person.userId, label: person.name }))}
      value={undefined}
      onClose={() => {
        if (!ownerPicked.current) onClose();
      }}
      onSelect={(userId) => {
        const person = candidates.find((candidate) => candidate.userId === userId);
        if (person) {
          ownerPicked.current = true;
          setOwner({ userId, name: person.name });
        }
      }}
    />
  );
}
