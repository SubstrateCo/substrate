import { useState } from "react";
import { KeyboardAvoidingView, View } from "react-native";

import { Composer } from "../composer/composer";
import { ProfileSheet } from "../conversation/profile-sheet";
import { MessageItem, type MessageNavigation } from "../messages/message-item";
import { MessageTimeline } from "../messages/message-timeline";
import { keyboardBehavior } from "../shared/keyboard";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { conversationLabel } from "@/features/messaging/conversations/conversation-rules";
import { countLabel } from "@/features/messaging/format";
import { useConversation } from "@/features/messaging/queries/use-conversations";
import { useMessageContexts, useThreadRoot } from "@/features/messaging/queries/use-messages";
import type {
  MessageSource,
  MessagingConversationTarget,
  MessagingProfileTarget,
} from "@/features/messaging/types";
import { ErrorState, LoadingRows, Notice } from "@/features/records/ui/states";
import type { RecordTarget } from "@/lib/navigation";
import { ChevronLeft } from "lucide-react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

export type ThreadScreenProps = {
  organizationId: string;
  conversationId: string;
  threadId: string;
  onBack: () => void;
  onOpenRecord: (target: RecordTarget) => void;
  onOpenProfile?: (target: MessagingProfileTarget) => void;
  onOpenConversation?: (target: MessagingConversationTarget) => void;
  onCreateFromMessage?: (source: MessageSource) => void;
};

export function ThreadScreen({
  organizationId,
  conversationId,
  threadId,
  onBack,
  onOpenRecord,
  onOpenProfile,
  onOpenConversation,
  onCreateFromMessage,
}: ThreadScreenProps) {
  const { conversation } = useConversation(organizationId, conversationId);
  const root = useThreadRoot(organizationId, conversationId, threadId);
  const rootContext = useMessageContexts(
    organizationId,
    conversationId,
    root.data ? [[root.data]] : [],
  );
  const [profile, setProfile] = useState<string>();
  const insets = useSafeAreaInsets();
  const openProfile = (actorId: string) => {
    if (onOpenProfile) onOpenProfile({ organizationId, conversationId, actorId });
    else setProfile(actorId);
  };
  const navigation: MessageNavigation = {
    onOpenRecord,
    onOpenConversation,
    onOpenProfile: openProfile,
    onCreateFromMessage,
    onOpenThread: onOpenConversation
      ? (id) => {
          if (id !== threadId) onOpenConversation({ conversationId, threadId: id });
        }
      : undefined,
  };
  const canPost = conversation?.canPost ?? false;
  return (
    <SafeAreaView className="flex-1 bg-surface" edges={["top", "bottom"]} testID="thread-screen">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={keyboardBehavior}
        keyboardVerticalOffset={insets.top}
      >
        <View className="h-12 flex-row items-center border-b border-border pr-4">
          <Button
            variant="ghost"
            size="icon"
            onPress={onBack}
            accessibilityLabel="Back to conversation"
          >
            <Icon as={ChevronLeft} className="size-5 text-foreground" />
          </Button>
          <View className="min-w-0 flex-1">
            <Text className="text-[15px] font-semibold" accessibilityRole="header">
              Thread
            </Text>
            {conversation ? (
              <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                {conversationLabel(conversation)}
              </Text>
            ) : null}
          </View>
        </View>
        {root.isPending ? <LoadingRows rows={3} label="Loading thread" /> : null}
        {root.error ? (
          <ErrorState error={root.error} noun="this thread" onRetry={() => void root.refetch()} />
        ) : null}
        {root.data ? (
          <MessageTimeline
            organizationId={organizationId}
            conversationId={conversationId}
            threadId={threadId}
            canPost={canPost}
            navigation={navigation}
            emptyTitle="No replies yet"
            header={
              <View className="border-b border-border pb-2">
                <MessageItem
                  organizationId={organizationId}
                  conversationId={conversationId}
                  message={root.data}
                  context={rootContext.byMessage.get(root.data.id)}
                  contextLoading={rootContext.loading}
                  contextError={rootContext.error}
                  grouped={false}
                  canPost={canPost}
                  navigation={{ ...navigation, onOpenThread: undefined }}
                />
                <Text className="px-4 pt-2 text-xs font-medium text-muted-foreground">
                  {root.data.replyCount
                    ? countLabel(root.data.replyCount, "reply", "replies")
                    : "No replies yet"}
                </Text>
              </View>
            }
          />
        ) : null}
        {root.data && conversation && canPost ? (
          <Composer
            organizationId={organizationId}
            conversationId={conversationId}
            threadId={threadId}
            label="Reply in thread"
          />
        ) : null}
        {root.data && conversation && !canPost ? (
          <Notice>Comment access is required to reply.</Notice>
        ) : null}
      </KeyboardAvoidingView>
      {profile ? (
        <ProfileSheet
          organizationId={organizationId}
          conversationId={conversationId}
          actorId={profile}
          onMessage={
            onOpenConversation ? (id) => onOpenConversation({ conversationId: id }) : undefined
          }
          onClose={() => setProfile(undefined)}
        />
      ) : null}
    </SafeAreaView>
  );
}
