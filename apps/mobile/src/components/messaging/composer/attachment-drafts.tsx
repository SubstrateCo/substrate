import { ActivityIndicator, ScrollView, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import type { AttachmentDraft } from "@/features/messaging/composer/use-attachment-uploads";
import { fileSize } from "@/features/messaging/format";
import { cn } from "@/lib/utils";
import { FileText, RotateCcw, X } from "lucide-react-native";

function draftStatus(item: AttachmentDraft) {
  if (item.status === "failed") return item.error;
  if (item.status === "uploading") return "Uploading.";
  return fileSize(item.file.size);
}

export function AttachmentDrafts({
  items,
  disabled,
  onRetry,
  onRemove,
}: {
  items: AttachmentDraft[];
  disabled: boolean;
  onRetry: (key: string) => void;
  onRemove: (key: string) => void;
}) {
  if (!items.length) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="gap-2 px-3 pt-2"
      keyboardShouldPersistTaps="always"
    >
      {items.map((item) => (
        <View
          key={item.key}
          className={cn(
            "w-56 flex-row items-center gap-2 rounded-md border pl-3",
            item.status === "failed" ? "border-destructive" : "border-border",
          )}
        >
          {item.status === "uploading" ? (
            <ActivityIndicator size="small" />
          ) : (
            <Icon as={FileText} className="size-4 text-muted-foreground" />
          )}
          <View className="min-w-0 flex-1 py-1.5">
            <Text className="text-sm" numberOfLines={1}>
              {item.file.name}
            </Text>
            <Text
              className={cn(
                "text-xs",
                item.status === "failed" ? "text-destructive" : "text-muted-foreground",
              )}
              numberOfLines={1}
            >
              {draftStatus(item)}
            </Text>
          </View>
          {item.status === "failed" ? (
            <Button
              variant="ghost"
              size="icon"
              disabled={disabled}
              onPress={() => onRetry(item.key)}
              accessibilityLabel={`Retry ${item.file.name}`}
            >
              <Icon as={RotateCcw} className="size-4 text-foreground" />
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            disabled={disabled}
            onPress={() => onRemove(item.key)}
            accessibilityLabel={`Remove ${item.file.name}`}
          >
            <Icon as={X} className="size-4 text-foreground" />
          </Button>
        </View>
      ))}
    </ScrollView>
  );
}
