import type { ReactNode } from "react";
import { View } from "react-native";

import { errorText, isAccessError } from "../format";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { AlertCircle, Inbox, Lock, RefreshCw } from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";

export function LoadingRows({ rows = 6, label }: { rows?: number; label: string }) {
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label} className="px-4 py-2">
      {Array.from({ length: rows }, (_, index) => (
        <View key={index} className="flex-row items-center gap-3 py-3">
          <Skeleton className="size-4 rounded-full" />
          <Skeleton
            className="h-3.5 flex-1 rounded"
            style={{ maxWidth: `${80 - (index % 3) * 15}%` }}
          />
        </View>
      ))}
    </View>
  );
}

export function EmptyState({
  title,
  description,
  icon = Inbox,
  action,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: ReactNode;
}) {
  return (
    <View className="items-center gap-2 px-6 py-10">
      <Icon as={icon} className="size-6 text-muted-foreground" />
      <Text className="text-center text-sm font-medium">{title}</Text>
      {description ? (
        <Text className="text-center text-sm text-muted-foreground">{description}</Text>
      ) : null}
      {action}
    </View>
  );
}

export function ErrorState({
  error,
  noun,
  onRetry,
  compact = false,
}: {
  /** Any thrown value. Only an Error carries safe copy; anything else gets the generic message. */
  error: unknown;
  noun: string;
  onRetry?: () => void;
  compact?: boolean;
}) {
  const failure = error instanceof Error ? error : null;
  const access = isAccessError(failure);
  const message = errorText(failure, `Couldn't load ${noun}.`);
  if (compact)
    return (
      <View className="flex-row items-center gap-2 px-4 py-2">
        <Icon as={access ? Lock : AlertCircle} className="size-4 text-destructive" />
        <Text className="flex-1 text-sm text-muted-foreground">{message}</Text>
        {onRetry && !access ? (
          <Button variant="ghost" size="sm" onPress={onRetry} accessibilityLabel={`Retry ${noun}`}>
            <Text>Retry</Text>
          </Button>
        ) : null}
      </View>
    );
  return (
    <View className="items-center gap-2 px-6 py-10" accessibilityRole="alert">
      <Icon as={access ? Lock : AlertCircle} className="size-6 text-muted-foreground" />
      <Text className="text-center text-sm">{message}</Text>
      {onRetry && !access ? (
        <Button variant="outline" size="sm" onPress={onRetry}>
          <Icon as={RefreshCw} className="size-4 text-foreground" />
          <Text>Try again</Text>
        </Button>
      ) : null}
    </View>
  );
}

/** A one-line explanation, such as a read-only or archived record. */
export function Notice({ icon = Lock, children }: { icon?: LucideIcon; children: string }) {
  return (
    <View className="flex-row items-center gap-2 border-b border-border bg-muted/50 px-4 py-2">
      <Icon as={icon} className="size-3.5 text-muted-foreground" />
      <Text className="flex-1 text-xs text-muted-foreground">{children}</Text>
    </View>
  );
}

export function MutationError({ error }: { error: unknown }) {
  if (!error) return null;
  const failure = error instanceof Error ? error : null;
  return (
    <View
      accessibilityRole="alert"
      className="flex-row items-center gap-2 rounded-md bg-destructive/10 px-3 py-2"
    >
      <Icon as={AlertCircle} className="size-4 text-destructive" />
      <Text className="flex-1 text-sm text-destructive">
        {errorText(failure, "Couldn't save. Try again.")}
      </Text>
    </View>
  );
}

/** The body of a record section backed by its own query: loading, error, empty text, or rows. */
export function SectionQuery({
  pending,
  error,
  noun,
  onRetry,
  emptyText,
  children,
}: {
  pending: boolean;
  error: Error | null;
  noun: string;
  onRetry: () => void;
  /** Shown instead of the rows when set. */
  emptyText: string | null;
  children: ReactNode;
}) {
  if (pending) return <LoadingRows rows={2} label={`Loading ${noun}`} />;
  if (error) return <ErrorState compact error={error} noun={noun} onRetry={onRetry} />;
  if (emptyText)
    return <Text className="px-4 py-3 text-sm text-muted-foreground">{emptyText}</Text>;
  return <>{children}</>;
}
