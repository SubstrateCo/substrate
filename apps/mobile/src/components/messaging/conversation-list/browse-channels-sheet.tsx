import { FlatList, View } from "react-native";

import { ConversationKindIcon } from "../shared/conversation-icon";
import { PanelSheet } from "../shared/panel-sheet";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { conversationName } from "@/features/messaging/conversations/conversation-rules";
import { countLabel } from "@/features/messaging/format";
import type { Conversation } from "@/features/messaging/types";
import { EmptyState, MutationError } from "@/features/records/ui/states";

export function BrowseChannelsSheet({
  channels,
  joiningId,
  error,
  onOpen,
  onJoin,
  onClose,
}: {
  channels: Conversation[];
  joiningId?: string;
  error: unknown;
  onOpen: (id: string) => void;
  onJoin: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <PanelSheet title="Browse channels" onClose={onClose} scroll={false}>
      {error ? (
        <View className="p-3">
          <MutationError error={error} />
        </View>
      ) : null}
      <FlatList
        data={channels}
        keyExtractor={(channel) => channel.id}
        ListEmptyComponent={<EmptyState title="You're in every public channel" />}
        renderItem={({ item }) => (
          <View className="min-h-14 flex-row items-center gap-3 border-b border-border px-4 py-2">
            <ConversationKindIcon conversation={item} />
            <View className="min-w-0 flex-1">
              <Text className="text-[15px]" numberOfLines={1}>
                {conversationName(item)}
              </Text>
              <Text className="text-xs text-muted-foreground">
                {countLabel(item.members.length, "member", "members")}
              </Text>
            </View>
            <Button variant="ghost" size="sm" onPress={() => onOpen(item.id)}>
              <Text>Open</Text>
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!!joiningId}
              onPress={() => onJoin(item.id)}
              accessibilityLabel={`Join ${conversationName(item)}`}
            >
              <Text>{joiningId === item.id ? "Joining." : "Join"}</Text>
            </Button>
          </View>
        )}
      />
    </PanelSheet>
  );
}
