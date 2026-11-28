import { useEffect, useState, type ReactNode } from "react";
import { View } from "react-native";

import { ActionSheet, type SheetAction } from "./sheet";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { MoreHorizontal, Pencil, Search, X } from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";

export function SearchBar({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <View className="flex-row items-center gap-2 border-b border-border px-3 py-1.5">
      <Icon as={Search} className="size-4 text-muted-foreground" />
      <Input
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        accessibilityLabel={placeholder}
        className="h-9 flex-1 border-0 bg-transparent px-0 shadow-none dark:bg-transparent"
      />
      {value ? (
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onPress={() => onChange("")}
          accessibilityLabel="Clear search"
        >
          <Icon as={X} className="size-4 text-muted-foreground" />
        </Button>
      ) : null}
    </View>
  );
}

export function DetailHeader({
  kind,
  title,
  icon,
  onClose,
  onEdit,
  actions = [],
  trailing,
}: {
  kind: string;
  title: string;
  icon?: LucideIcon;
  onClose?: () => void;
  onEdit?: () => void;
  actions?: SheetAction[];
  trailing?: ReactNode;
}) {
  const [menu, setMenu] = useState(false);
  return (
    <View className="flex-row items-center gap-1 border-b border-border px-1 py-1">
      {onClose ? (
        <Button variant="ghost" size="icon" onPress={onClose} accessibilityLabel={`Close ${kind}`}>
          <Icon as={X} className="size-5 text-foreground" />
        </Button>
      ) : (
        <View className="w-3" />
      )}
      <View className="min-w-0 flex-1 py-1">
        <View className="flex-row items-center gap-1">
          {icon ? <Icon as={icon} className="size-3 text-muted-foreground" /> : null}
          <Text className="text-[11px] font-medium text-muted-foreground">{kind}</Text>
        </View>
        <Text className="text-[17px] font-semibold" numberOfLines={2} accessibilityRole="header">
          {title}
        </Text>
      </View>
      {trailing}
      {onEdit ? (
        <Button variant="ghost" size="icon" onPress={onEdit} accessibilityLabel={`Edit ${kind}`}>
          <Icon as={Pencil} className="size-4 text-foreground" />
        </Button>
      ) : null}
      {actions.length ? (
        <Button
          variant="ghost"
          size="icon"
          onPress={() => setMenu(true)}
          accessibilityLabel={`More ${kind} actions`}
        >
          <Icon as={MoreHorizontal} className="size-5 text-foreground" />
        </Button>
      ) : null}
      {menu ? <ActionSheet title={title} actions={actions} onClose={() => setMenu(false)} /> : null}
    </View>
  );
}

export function ListToolbar({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <View className="h-12 flex-row items-center gap-1 border-b border-border pl-4 pr-1">
      <Text
        className="flex-1 text-[17px] font-semibold"
        numberOfLines={1}
        accessibilityRole="header"
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

export function useDebounced<T>(value: T, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
