import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, View } from "react-native";

import { Composer } from "../composer/composer";
import { MessageTimeline } from "../messages/message-timeline";
import { keyboardBehavior, shellHeaderHeight } from "../shared/keyboard";
import { ConversationDetailsSheet } from "./conversation-details-sheet";
import { ConversationHeader } from "./conversation-header";
import { ProfileSheet } from "./profile-sheet";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import {
  conversationLabel,
  sidebarSections,
} from "@/features/messaging/conversations/conversation-rules";
import { useConversationManagement } from "@/features/messaging/queries/use-conversation-management";
import { useConversation } from "@/features/messaging/queries/use-conversations";
import { useMessageTarget } from "@/features/messaging/queries/use-messages";
import { useMessagingScope } from "@/features/messaging/scope";
import type {
  MessageSource,
  MessagingConversationTarget,
  MessagingProfileTarget,
} from "@/features/messaging/types";
import {
  EmptyState,
  ErrorState,
  LoadingRows,
  MutationError,
  Notice,
} from "@/features/records/ui/states";
import type { RecordTarget } from "@/lib/navigation";
import { MessagesSquare, Unlink } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type MessagingScreenProps = {
  organizationId: string;
  /** Without one, the screen opens the first joined conversation, or asks to choose. */
  conversationId?: string;
  /** A linked message: a timeline message opens there, a reply opens its thread. */
  targetMessageId?: string;
  /** Opens a thread. The conversation is passed because the screen may pick it by itself. */
  onOpenThread: (threadId: string, conversationId?: string) => void;
  /**
   * Starts a record from a message: a task, a CRM record, or a logged interaction. The shell opens
   * the source form. Without it, these message actions are hidden.
   */
  onCreateFromMessage?: (source: MessageSource) => void;
  onOpenRecord: (target: RecordTarget) => void;
  /** Opens a profile in the shell. Without it, a conversation-scoped profile sheet opens here. */
  onOpenProfile?: (target: MessagingProfileTarget) => void;
  /** Opens the conversations drawer. */
  onOpenConversations?: () => void;
  /** Opens another conversation, or a thread in it, from a reference or a profile. */
  onOpenConversation?: (target: MessagingConversationTarget) => void;
};

export function MessagingScreen(props: MessagingScreenProps) {
  const { organizationId, conversationId } = props;
  const { userId } = useMessagingScope(organizationId);
  const list = useConversation(organizationId, conversationId);
  const fallback = conversationId
    ? undefined
    : list.data && Object.values(sidebarSections(list.data)).flat()[0];
  const conversation = list.conversation ?? fallback;

  if (list.isPending) return <LoadingRows label="Loading conversation" />;
  if (list.error && !list.data)
    return (
      <ErrorState error={list.error} noun="conversations" onRetry={() => void list.refetch()} />
    );
  if (!conversation)
    return conversationId ? (
      <EmptyState
        icon={Unlink}
        title="Conversation unavailable"
        description="It may have been deleted, or you may no longer have access."
        action={
          props.onOpenConversations ? (
            <ChooseButton onPress={props.onOpenConversations} />
          ) : undefined
        }
      />
    ) : (
      <EmptyState
        icon={MessagesSquare}
        title="No conversation open"
        description="Pick a channel or direct message, or start a new one."
        action={
          props.onOpenConversations ? (
            <ChooseButton onPress={props.onOpenConversations} />
          ) : undefined
        }
      />
    );
  return (
    <OpenConversation
      key={conversation.id}
      {...props}
      conversation={conversation}
      viewerId={userId}
    />
  );
}

function ChooseButton({ onPress }: { onPress: () => void }) {
  return (
    <Button size="sm" onPress={onPress} testID="choose-conversation">
      <Text>Choose a conversation</Text>
    </Button>
  );
}

function OpenConversation({
  organizationId,
  conversation,
  viewerId,
  targetMessageId,
  onOpenThread,
  onOpenRecord,
  onOpenProfile,
  onOpenConversation,
  onCreateFromMessage,
}: MessagingScreenProps & {
  conversation: NonNullable<ReturnType<typeof useConversation>["conversation"]>;
  viewerId: string;
}) {
  const [details, setDetails] = useState(false);
  const [profile, setProfile] = useState<string>();
  const target = useMessageTarget(organizationId, conversation.id, targetMessageId);
  const management = useConversationManagement(organizationId, conversation.id);
  const insets = useSafeAreaInsets();

  // A linked reply opens its thread once; a linked timeline message anchors the timeline until
  // the person jumps to the latest.
  const linked = target.data;
  const handled = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!linked?.message.threadId || handled.current === linked.message.id) return;
    handled.current = linked.message.id;
    onOpenThread(linked.root.id, conversation.id);
  }, [linked, onOpenThread, conversation.id]);
  const [latestFor, setLatestFor] = useState<string>();
  const linkedAnchor = linked && !linked.message.threadId ? linked.message.id : undefined;
  const anchor = linkedAnchor !== latestFor ? linkedAnchor : undefined;

  const openProfile = (actorId: string) => {
    if (onOpenProfile) onOpenProfile({ organizationId, conversationId: conversation.id, actorId });
    else setProfile(actorId);
  };
  const label = `Message ${conversationLabel(conversation)}`;
  return (
    <KeyboardAvoidingView
      className="flex-1 bg-surface"
      testID="messaging-screen"
      behavior={keyboardBehavior}
      keyboardVerticalOffset={insets.top + shellHeaderHeight}
    >
      <ConversationHeader
        conversation={conversation}
        viewerId={viewerId}
        onDetails={() => setDetails(true)}
        onOpenTask={
          conversation.task
            ? () =>
                onOpenRecord({
                  kind: "task",
                  id: conversation.task!.taskEntityId,
                  projectId: conversation.task!.projectEntityId,
                })
            : undefined
        }
      />
      {target.error ? <Notice>The linked message isn&apos;t available.</Notice> : null}
      <MessageTimeline
        organizationId={organizationId}
        conversationId={conversation.id}
        aroundMessageId={anchor}
        canPost={conversation.canPost}
        navigation={{
          onOpenRecord,
          onOpenThread: (threadId) => onOpenThread(threadId, conversation.id),
          onOpenConversation,
          onOpenProfile: openProfile,
          onCreateFromMessage,
        }}
        emptyTitle={
          conversation.kind === "channel"
            ? `Welcome to ${conversationLabel(conversation)}`
            : "No messages yet"
        }
        emptyDescription="Send the first message below."
        onJumpToLatest={() => setLatestFor(linkedAnchor)}
      />
      {!conversation.joined && !conversation.task ? (
        <View className="gap-2 border-t border-border px-4 py-3">
          <Text className="text-sm text-muted-foreground">
            You aren&apos;t a member of this channel. Join to get it in your list, or post to
            rejoin.
          </Text>
          <MutationError error={management.join.error} />
          <Button
            variant="outline"
            size="sm"
            disabled={management.join.isPending}
            onPress={() => management.join.mutate()}
          >
            <Text>{management.join.isPending ? "Joining." : "Join channel"}</Text>
          </Button>
        </View>
      ) : null}
      {conversation.canPost ? (
        <Composer organizationId={organizationId} conversationId={conversation.id} label={label} />
      ) : (
        <Notice>You can view this discussion. Comment access is required to send messages.</Notice>
      )}
      {details ? (
        <ConversationDetailsSheet
          organizationId={organizationId}
          conversation={conversation}
          viewerId={viewerId}
          onProfile={openProfile}
          onClose={() => setDetails(false)}
        />
      ) : null}
      {profile ? (
        <ProfileSheet
          organizationId={organizationId}
          conversationId={conversation.id}
          actorId={profile}
          onMessage={
            onOpenConversation
              ? (id) => {
                  setProfile(undefined);
                  onOpenConversation({ conversationId: id });
                }
              : undefined
          }
          onClose={() => setProfile(undefined)}
        />
      ) : null}
    </KeyboardAvoidingView>
  );
}
