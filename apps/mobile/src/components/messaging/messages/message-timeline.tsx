import { useEffect, useRef, type ReactElement } from "react";
import { ActivityIndicator, FlatList, View } from "react-native";

import { MessageItem, type MessageNavigation } from "./message-item";
import { DayDivider } from "./message-row";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { messageRows } from "@/features/messaging/messages/message-rows";
import {
  useMarkRead,
  useMessageContexts,
  useMessageHistory,
} from "@/features/messaging/queries/use-messages";
import { EmptyState, ErrorState, LoadingRows } from "@/features/records/ui/states";
import { ArrowDown } from "lucide-react-native";

export function MessageTimeline({
  organizationId,
  conversationId,
  threadId,
  aroundMessageId,
  canPost,
  navigation,
  header,
  emptyTitle,
  emptyDescription,
  onJumpToLatest,
}: {
  organizationId: string;
  conversationId: string;
  threadId?: string;
  aroundMessageId?: string;
  canPost: boolean;
  navigation: MessageNavigation;
  header?: ReactElement;
  emptyTitle: string;
  emptyDescription?: string;
  onJumpToLatest?: () => void;
}) {
  const { query, pages, messages } = useMessageHistory(
    organizationId,
    conversationId,
    threadId,
    aroundMessageId,
  );
  const contexts = useMessageContexts(organizationId, conversationId, pages);
  const anchored = !!aroundMessageId;
  useMarkRead(
    organizationId,
    conversationId,
    !anchored && !query.isPlaceholderData ? messages.at(-1)?.id : undefined,
  );
  const rows = messageRows(messages).reverse();
  const list = useRef<FlatList<(typeof rows)[number]>>(null);
  const scrolledTo = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!aroundMessageId || scrolledTo.current === aroundMessageId) return;
    const index = rows.findIndex((row) => row.message.id === aroundMessageId);
    if (index < 0) return;
    scrolledTo.current = aroundMessageId;
    requestAnimationFrame(() =>
      list.current?.scrollToIndex({ index, viewPosition: 0.5, animated: false }),
    );
  }, [aroundMessageId, rows]);

  if (query.isPending)
    return <LoadingRows label={threadId ? "Loading replies" : "Loading messages"} />;
  if (query.error && !messages.length && !header)
    return (
      <ErrorState
        error={query.error}
        noun={threadId ? "replies" : "messages"}
        onRetry={() => void query.refetch()}
      />
    );

  return (
    <View className="flex-1">
      <FlatList
        ref={list}
        inverted
        data={rows}
        keyExtractor={(row) => row.message.id}
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="pb-2"
        onEndReached={() =>
          query.hasNextPage && !query.isFetchingNextPage && void query.fetchNextPage()
        }
        onEndReachedThreshold={0.4}
        onScrollToIndexFailed={({ index, averageItemLength }) =>
          list.current?.scrollToOffset({ offset: index * averageItemLength, animated: false })
        }
        renderItem={({ item }) => (
          <View>
            {item.newDay ? <DayDivider date={item.message.createdAt} /> : null}
            <MessageItem
              organizationId={organizationId}
              conversationId={conversationId}
              message={item.message}
              context={contexts.byMessage.get(item.message.id)}
              contextLoading={contexts.loading}
              contextError={contexts.error}
              grouped={item.grouped}
              highlighted={item.message.id === aroundMessageId}
              canPost={canPost}
              navigation={navigation}
            />
          </View>
        )}
        ListFooterComponent={
          <View>
            {query.isFetchingNextPage ? (
              <View className="items-center py-3" accessibilityLabel="Loading older messages">
                <ActivityIndicator />
              </View>
            ) : null}
            {query.hasNextPage && !query.isFetchingNextPage ? (
              <Button
                variant="ghost"
                size="sm"
                className="self-center"
                onPress={() => void query.fetchNextPage()}
              >
                <Text>Load older messages</Text>
              </Button>
            ) : null}
            {header}
            {!query.hasNextPage && !messages.length && !header ? (
              <EmptyState title={emptyTitle} description={emptyDescription} />
            ) : null}
          </View>
        }
        ListHeaderComponent={
          query.error ? (
            <ErrorState
              compact
              error={query.error}
              noun="new messages"
              onRetry={() => void query.refetch()}
            />
          ) : null
        }
      />
      {anchored && onJumpToLatest ? (
        <Button
          variant="secondary"
          size="sm"
          className="absolute bottom-3 self-center"
          onPress={onJumpToLatest}
        >
          <Icon as={ArrowDown} className="size-4 text-secondary-foreground" />
          <Text>Jump to latest</Text>
        </Button>
      ) : null}
    </View>
  );
}
