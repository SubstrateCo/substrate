import type { ContextEntityType } from "@substrate/contracts/context/input";

import { useState } from "react";
import { ActivityIndicator, FlatList, KeyboardAvoidingView, ScrollView, View } from "react-native";

import { keyboardBehavior } from "../shared/keyboard";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import {
  linkableKindLabels,
  type LinkableRecord,
} from "@/features/messaging/references/linkable-records";
import { ErrorState } from "@/features/records/ui/states";
import { cn } from "@/lib/utils";
import { Check, Link2, Search } from "lucide-react-native";

/** Chooses existing records to link to a message. Selection survives kind and search changes. */
export function LinkRecordSheetView({
  kinds,
  kind,
  query,
  records,
  linkedIds,
  loading,
  error,
  pending,
  linkError,
  onKind,
  onQuery,
  onRetry,
  onLink,
  onClose,
}: {
  kinds: readonly ContextEntityType[];
  kind: ContextEntityType;
  query: string;
  records: LinkableRecord[];
  linkedIds: ReadonlySet<string>;
  loading: boolean;
  error: unknown;
  pending: boolean;
  linkError?: string;
  onKind: (kind: ContextEntityType) => void;
  onQuery: (query: string) => void;
  onRetry: () => void;
  onLink: (records: LinkableRecord[]) => void;
  onClose: () => void;
}) {
  const [chosen, setChosen] = useState(() => new Map<string, LinkableRecord>());
  // Records that became linked, such as after a partial failure, leave the selection.
  const selection = [...chosen.values()].filter(
    (record) => kinds.includes(record.kind) && !linkedIds.has(record.id),
  );
  const toggle = (record: LinkableRecord) =>
    setChosen((current) => {
      const next = new Map(current);
      if (next.has(record.id)) next.delete(record.id);
      else next.set(record.id, record);
      return next;
    });
  const label = kindLabel(kind);
  let linkLabel = "Link";
  if (selection.length === 1) linkLabel = "Link 1 record";
  else if (selection.length > 1) linkLabel = `Link ${selection.length} records`;
  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="h-[88%] w-full gap-0 p-0">
        <KeyboardAvoidingView behavior={keyboardBehavior} className="flex-1">
          <DialogHeader className="border-b border-border px-5 pb-3 pt-5 text-left">
            <DialogTitle className="pr-8 text-base">Link existing records</DialogTitle>
            <DialogDescription>
              Records you can edit. Linking does not share the record or the message with anyone.
            </DialogDescription>
          </DialogHeader>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="grow-0"
            contentContainerClassName="gap-1 px-3 py-2"
            keyboardShouldPersistTaps="handled"
          >
            {kinds.map((item) => (
              <Button
                key={item}
                variant="ghost"
                size="sm"
                accessibilityRole="tab"
                accessibilityState={{ selected: item === kind }}
                disabled={pending}
                onPress={() => onKind(item)}
                className={cn("rounded-full", item === kind && "bg-accent")}
              >
                <Text
                  className={cn(
                    "text-sm",
                    item === kind ? "font-medium text-foreground" : "text-muted-foreground",
                  )}
                >
                  {linkableKindLabels[item]}
                </Text>
              </Button>
            ))}
          </ScrollView>
          <View className="flex-row items-center gap-2 border-y border-border px-4 py-1.5">
            <Icon as={Search} className="size-4 text-muted-foreground" />
            <Input
              value={query}
              onChangeText={onQuery}
              placeholder={`Search ${label}`}
              autoCorrect={false}
              autoCapitalize="none"
              editable={!pending}
              className="h-9 flex-1 border-0 bg-transparent px-0 shadow-none dark:bg-transparent"
              accessibilityLabel={`Search ${label} to link`}
            />
          </View>
          {selection.length ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="grow-0 border-b border-border"
              contentContainerClassName="gap-1.5 px-4 py-2"
              accessibilityLabel="Selected records"
            >
              {selection.map((record) => (
                <Button
                  key={record.id}
                  variant="secondary"
                  size="sm"
                  disabled={pending}
                  onPress={() => toggle(record)}
                  accessibilityLabel={`Remove ${record.title} from selection`}
                  className="max-w-60 rounded-full"
                >
                  <Text numberOfLines={1}>{record.title}</Text>
                  <Text className="text-muted-foreground">×</Text>
                </Button>
              ))}
            </ScrollView>
          ) : null}
          <FlatList
            className="flex-1"
            data={loading || error ? [] : records}
            keyExtractor={(record) => record.id}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <SearchStatus
                loading={loading}
                error={error}
                query={query.trim()}
                label={label}
                onRetry={onRetry}
              />
            }
            renderItem={({ item }) => {
              const linked = linkedIds.has(item.id);
              const selected = chosen.has(item.id) && !linked;
              return (
                <Button
                  variant="ghost"
                  disabled={pending || linked}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected || linked, disabled: pending || linked }}
                  accessibilityLabel={`${item.title}${item.detail ? `, ${item.detail}` : ""}${linked ? ", already linked" : ""}`}
                  onPress={() => toggle(item)}
                  className="h-auto min-h-12 justify-start gap-3 rounded-none border-b border-border px-5 py-2"
                >
                  <View className="min-w-0 flex-1">
                    <Text className="text-[15px] font-normal" numberOfLines={1}>
                      {item.title}
                    </Text>
                    {item.detail || linked ? (
                      <Text className="text-xs font-normal text-muted-foreground" numberOfLines={1}>
                        {linked ? "Already linked" : item.detail}
                      </Text>
                    ) : null}
                  </View>
                  <View
                    className={cn(
                      "size-5 items-center justify-center rounded border border-border",
                      (selected || linked) && "border-primary bg-primary",
                    )}
                  >
                    {selected || linked ? (
                      <Icon as={Check} className="size-3.5 text-primary-foreground" />
                    ) : null}
                  </View>
                </Button>
              );
            }}
          />
          <DialogFooter className="gap-2 border-t border-border px-5 py-3">
            {linkError ? (
              <View accessibilityRole="alert" className="rounded-md bg-destructive/10 px-3 py-2">
                <Text className="text-sm text-destructive">{linkError}</Text>
              </View>
            ) : null}
            <View className="flex-row items-center justify-between gap-2">
              <Text
                className="flex-1 text-sm text-muted-foreground"
                accessibilityLiveRegion="polite"
              >
                {selection.length ? `${selection.length} selected` : "Select one or more records"}
              </Text>
              <Button variant="outline" size="sm" onPress={onClose} disabled={pending}>
                <Text>Cancel</Text>
              </Button>
              <Button
                size="sm"
                disabled={pending || !selection.length}
                onPress={() => onLink(selection)}
                accessibilityLabel={linkLabel}
              >
                <Icon as={Link2} className="size-4 text-primary-foreground" />
                <Text>{pending ? "Linking…" : linkLabel}</Text>
              </Button>
            </View>
          </DialogFooter>
        </KeyboardAvoidingView>
      </DialogContent>
    </Dialog>
  );
}

function kindLabel(kind: ContextEntityType) {
  return linkableKindLabels[kind].toLowerCase();
}

function SearchStatus({
  loading,
  error,
  query,
  label,
  onRetry,
}: {
  loading: boolean;
  error: unknown;
  query: string;
  label: string;
  onRetry: () => void;
}) {
  if (loading)
    return (
      <View className="items-center py-8" accessibilityLabel={`Searching ${label}`}>
        <ActivityIndicator />
      </View>
    );
  if (error) return <ErrorState compact error={error} noun={label} onRetry={onRetry} />;
  return (
    <Text className="p-6 text-center text-sm text-muted-foreground">
      {query ? `No ${label} you can edit match "${query}".` : `No ${label} you can edit.`}
    </Text>
  );
}
