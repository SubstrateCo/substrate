import { FlatList, View } from "react-native";

import { PanelSheet } from "../shared/panel-sheet";
import { PersonAvatar } from "../shared/person-avatar";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useReactionPeople } from "@/features/messaging/queries/use-message-mutations";
import { ErrorState, LoadingRows } from "@/features/records/ui/states";

export function ReactionPeopleSheet({
  organizationId,
  messageId,
  emoji,
  onClose,
}: {
  organizationId: string;
  messageId: string;
  emoji: string;
  onClose: () => void;
}) {
  const people = useReactionPeople(organizationId, messageId, emoji);
  const rows = people.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <PanelSheet title={`Reacted with ${emoji}`} onClose={onClose} scroll={false}>
      {people.isPending ? <LoadingRows rows={3} label="Loading reactions" /> : null}
      {people.error ? (
        <ErrorState error={people.error} noun="reactions" onRetry={() => void people.refetch()} />
      ) : null}
      <FlatList
        data={rows}
        keyExtractor={(row) => row.actorId}
        renderItem={({ item }) => (
          <View className="min-h-12 flex-row items-center gap-3 border-b border-border px-4">
            <PersonAvatar
              name={item.name}
              image={item.image}
              agent={item.type === "agent"}
              size="sm"
            />
            <Text className="flex-1 text-[15px]" numberOfLines={1}>
              {item.self ? `${item.name} (you)` : item.name}
            </Text>
          </View>
        )}
        ListFooterComponent={
          people.hasNextPage ? (
            <Button
              variant="ghost"
              disabled={people.isFetchingNextPage}
              onPress={() => void people.fetchNextPage()}
            >
              <Text>{people.isFetchingNextPage ? "Loading." : "Show more"}</Text>
            </Button>
          ) : null
        }
      />
    </PanelSheet>
  );
}
