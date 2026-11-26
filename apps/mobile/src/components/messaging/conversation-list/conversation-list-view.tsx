import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";

import { ConversationRow } from "./conversation-row";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import type { SidebarConversation } from "@/features/messaging/conversations/conversation-rules";
import { countLabel } from "@/features/messaging/format";
import { EmptyState, ErrorState, LoadingRows } from "@/features/records/ui/states";
import { Compass, Inbox, MessageSquarePlus, Settings, X } from "lucide-react-native";

type Sections = {
  channels: SidebarConversation[];
  partner: SidebarConversation[];
  direct: SidebarConversation[];
};

const sectionTitles = {
  channels: "Channels",
  partner: "Partner channels",
  direct: "Direct messages",
};

function Section({
  title,
  rows,
  empty,
  children,
}: {
  title: string;
  rows: SidebarConversation[];
  empty?: string;
  children: (row: SidebarConversation) => ReactNode;
}) {
  if (!rows.length && !empty) return null;
  return (
    <View className="gap-0.5">
      <Text
        className="px-3 pb-1 pt-4 text-xs font-medium text-muted-foreground"
        accessibilityRole="header"
      >
        {title}
      </Text>
      {rows.length ? (
        rows.map(children)
      ) : (
        <Text className="px-3 py-2 text-sm text-muted-foreground">{empty}</Text>
      )}
    </View>
  );
}

function ShortcutRow({
  icon,
  label,
  onPress,
}: {
  icon: typeof Compass;
  label: string;
  onPress: () => void;
}) {
  return (
    <Button
      variant="ghost"
      accessibilityRole="button"
      onPress={onPress}
      className="min-h-12 flex-row items-center justify-start gap-3 rounded-md px-3 py-0 active:bg-accent"
    >
      <View className="w-6 items-center">
        <Icon as={icon} className="size-4 text-muted-foreground" />
      </View>
      <Text className="flex-1 text-[15px] text-muted-foreground">{label}</Text>
    </Button>
  );
}

export function ConversationListView({
  sections,
  viewerId,
  selectedId,
  loading,
  error,
  browsableCount,
  invitationCount,
  onRetry,
  onSelect,
  onNew,
  onBrowse,
  onManage,
  onInvitations,
  onClose,
}: {
  sections?: Sections;
  viewerId: string;
  selectedId?: string;
  loading: boolean;
  error: unknown;
  browsableCount: number;
  invitationCount: number;
  onRetry: () => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onBrowse: () => void;
  onManage?: () => void;
  onInvitations: () => void;
  onClose?: () => void;
}) {
  const row = (conversation: SidebarConversation) => (
    <ConversationRow
      key={conversation.id}
      conversation={conversation}
      viewerId={viewerId}
      selected={conversation.id === selectedId}
      onPress={() => onSelect(conversation.id)}
    />
  );
  return (
    <View className="flex-1 bg-surface" testID="conversation-list">
      <View className="h-12 flex-row items-center border-b border-border pl-4 pr-1">
        <Text className="flex-1 text-base font-semibold" accessibilityRole="header">
          Messages
        </Text>
        <Button
          variant="ghost"
          size="icon"
          onPress={onNew}
          accessibilityLabel="New message"
          testID="new-message"
        >
          <Icon as={MessageSquarePlus} className="size-5 text-foreground" />
        </Button>
        {onClose ? (
          <Button
            variant="ghost"
            size="icon"
            onPress={onClose}
            accessibilityLabel="Close conversations"
          >
            <Icon as={X} className="size-5 text-foreground" />
          </Button>
        ) : null}
      </View>
      {loading ? <LoadingRows label="Loading conversations" /> : null}
      {error && !sections ? (
        <ErrorState error={error} noun="conversations" onRetry={onRetry} />
      ) : null}
      {sections ? (
        <ScrollView contentContainerClassName="px-1 pb-8">
          {error ? (
            <ErrorState compact error={error} noun="conversations" onRetry={onRetry} />
          ) : null}
          {invitationCount > 0 ? (
            <ShortcutRow
              icon={Inbox}
              label={`Review ${countLabel(invitationCount, "invitation", "invitations")}`}
              onPress={onInvitations}
            />
          ) : null}
          <Section title={sectionTitles.channels} rows={sections.channels} empty="No channels yet">
            {row}
          </Section>
          {browsableCount > 0 ? (
            <ShortcutRow
              icon={Compass}
              label={`Browse ${countLabel(browsableCount, "channel", "channels")}`}
              onPress={onBrowse}
            />
          ) : null}
          <Section title={sectionTitles.partner} rows={sections.partner}>
            {row}
          </Section>
          {onManage ? (
            <ShortcutRow icon={Settings} label="Manage conversations" onPress={onManage} />
          ) : null}
          <Section title={sectionTitles.direct} rows={sections.direct} empty="No conversations yet">
            {row}
          </Section>
          {!sections.channels.length && !sections.partner.length && !sections.direct.length ? (
            <EmptyState
              title="Start a conversation"
              description="Message a teammate or create a channel for your team."
              action={
                <Button size="sm" onPress={onNew}>
                  <Text>New message</Text>
                </Button>
              }
            />
          ) : null}
        </ScrollView>
      ) : null}
    </View>
  );
}
