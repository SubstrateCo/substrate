import type { ReferenceKind, ReferenceTab } from "@substrate/contracts/messaging/references";
import { taskStatusLabels, type TaskStatus } from "@substrate/contracts/tasks";

import { ActivityIndicator, ScrollView, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { ErrorState } from "@/features/records/ui/states";
import { cn } from "@/lib/utils";
import {
  AtSign,
  Bot,
  CheckSquare,
  FolderKanban,
  Hash,
  MessageSquareReply,
} from "lucide-react-native";

const tabLabels: Record<ReferenceTab, string> = {
  all: "All",
  person: "People",
  agent: "Agents",
  task: "Tasks",
  project: "Projects",
  channel: "Channels",
  thread: "Threads",
};

const kindIcons = {
  person: AtSign,
  agent: Bot,
  task: CheckSquare,
  project: FolderKanban,
  channel: Hash,
  thread: MessageSquareReply,
};

export type ReferenceOption = {
  id: string;
  kind: ReferenceKind;
  title: string;
  conversationName?: string;
  projectName?: string;
  status?: TaskStatus;
};

function description(option: ReferenceOption) {
  if (option.conversationName) return `In ${option.conversationName}`;
  return (
    [option.projectName, option.status && taskStatusLabels[option.status]]
      .filter(Boolean)
      .join(" · ") || undefined
  );
}

/** Suggestions above the composer while an `@` or `#` query is open. */
export function ReferencePickerView({
  tabs,
  tab,
  query,
  options,
  loading,
  error,
  onTab,
  onRetry,
  onPick,
}: {
  tabs: ReferenceTab[];
  tab: ReferenceTab;
  query: string;
  options: ReferenceOption[];
  loading: boolean;
  error: unknown;
  onTab: (tab: ReferenceTab) => void;
  onRetry: () => void;
  onPick: (option: ReferenceOption) => void;
}) {
  return (
    <View
      className="max-h-72 border-t border-border bg-popover"
      accessibilityLabel="Insert workspace reference"
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-1 px-2 py-1"
        keyboardShouldPersistTaps="always"
      >
        {tabs.map((item) => (
          <Button
            variant="ghost"
            key={item}
            accessibilityRole="tab"
            accessibilityState={{ selected: item === tab }}
            onPress={() => onTab(item)}
            className={cn(
              "min-h-11 justify-center rounded-full px-3",
              item === tab ? "bg-accent" : "",
            )}
          >
            <Text
              className={cn(
                "text-sm",
                item === tab ? "font-medium text-foreground" : "text-muted-foreground",
              )}
            >
              {tabLabels[item]}
            </Text>
          </Button>
        ))}
      </ScrollView>
      <ScrollView keyboardShouldPersistTaps="always">
        {loading ? (
          <View
            className="min-h-12 items-center justify-center"
            accessibilityLabel="Searching references"
          >
            <ActivityIndicator />
          </View>
        ) : null}
        {!loading && error ? (
          <ErrorState compact error={error} noun="references" onRetry={onRetry} />
        ) : null}
        {!loading && !error && !options.length ? (
          <Text className="px-4 py-3 text-sm text-muted-foreground">
            {query
              ? `No accessible references match "${query}".`
              : "No accessible references found."}
          </Text>
        ) : null}
        {!loading && !error
          ? options.map((option) => {
              const detail = description(option);
              return (
                <Button
                  variant="ghost"
                  key={`${option.kind}:${option.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Insert ${option.title}${detail ? `, ${detail}` : ""}`}
                  onPress={() => onPick(option)}
                  className="min-h-12 flex-row items-center justify-start gap-3 rounded-none px-4 py-0 active:bg-accent"
                >
                  <Icon as={kindIcons[option.kind]} className="size-4 text-muted-foreground" />
                  <View className="min-w-0 flex-1">
                    <Text className="text-[15px]" numberOfLines={1}>
                      {option.title}
                    </Text>
                    {detail ? (
                      <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                        {detail}
                      </Text>
                    ) : null}
                  </View>
                </Button>
              );
            })
          : null}
      </ScrollView>
    </View>
  );
}
