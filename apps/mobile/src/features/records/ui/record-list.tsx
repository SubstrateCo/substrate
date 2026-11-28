import type { UseInfiniteQueryResult, InfiniteData } from "@tanstack/react-query";

import type { ReactElement } from "react";
import { ActivityIndicator, FlatList, RefreshControl, View } from "react-native";

import { EmptyState, ErrorState, LoadingRows } from "./states";
import type { LucideIcon } from "lucide-react-native";

export function PagedList<Page, Item>({
  query,
  items,
  keyOf,
  renderItem,
  noun,
  empty,
  header,
}: {
  query: UseInfiniteQueryResult<InfiniteData<Page, unknown>, Error>;
  items: (pages: Page[]) => Item[];
  keyOf: (item: Item) => string;
  renderItem: (item: Item) => ReactElement;
  noun: string;
  empty: { title: string; description?: string; icon?: LucideIcon; action?: ReactElement };
  header?: ReactElement;
}) {
  if (query.isPending) return <LoadingRows label={`Loading ${noun}`} />;
  if (query.error && !query.data)
    return <ErrorState error={query.error} noun={noun} onRetry={() => void query.refetch()} />;
  const data = items(query.data.pages);
  return (
    <FlatList
      data={data}
      keyExtractor={keyOf}
      renderItem={({ item }) => renderItem(item)}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={header}
      onEndReachedThreshold={0.5}
      onEndReached={() => {
        if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
      }}
      refreshControl={
        <RefreshControl
          refreshing={query.isRefetching && !query.isFetchingNextPage}
          onRefresh={() => void query.refetch()}
        />
      }
      ListEmptyComponent={<EmptyState {...empty} />}
      ListFooterComponent={<ListFooter query={query} noun={noun} />}
    />
  );
}

function ListFooter<Page>({
  query,
  noun,
}: {
  query: UseInfiniteQueryResult<InfiniteData<Page, unknown>, Error>;
  noun: string;
}) {
  if (query.isFetchingNextPage)
    return (
      <View className="py-4">
        <ActivityIndicator />
      </View>
    );
  if (query.error)
    return (
      <ErrorState
        compact
        error={query.error}
        noun={noun}
        onRetry={() => void query.fetchNextPage()}
      />
    );
  return null;
}
