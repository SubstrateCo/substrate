import { taskStatusLabels, type TaskPriority, type TaskStatus } from "@substrate/contracts/tasks";

import type { ComponentProps, ReactNode } from "react";
import { ScrollView, View } from "react-native";

import { formatDate, overdue, taskPriorityLabels } from "../format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Circle,
  CircleCheck,
  CircleDashed,
  CircleDot,
  CircleSlash,
  Plus,
  TriangleAlert,
} from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";

/** The pressable surface of a list row: a ghost button without the button's height or rounding. */
export function ListButton({ className, ...props }: ComponentProps<typeof Button>) {
  return (
    <Button
      variant="ghost"
      {...props}
      className={cn("h-auto justify-start rounded-none shadow-none", className)}
    />
  );
}

/** A dense list row with a hairline separator, like a channel list. */
export function Row({
  title,
  subtitle,
  leading,
  trailing,
  onPress,
  chevron = false,
  accessibilityLabel,
  muted = false,
  testID,
}: {
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  accessibilityLabel?: string;
  muted?: boolean;
  testID?: string;
}) {
  const content = (
    <>
      {leading ? <View className="w-5 items-center">{leading}</View> : null}
      <View className="min-w-0 flex-1">
        <Text
          numberOfLines={1}
          className={cn("text-[15px] font-normal", muted && "text-muted-foreground line-through")}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} className="text-xs font-normal text-muted-foreground">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ? <View className="flex-row items-center gap-1.5">{trailing}</View> : null}
      {chevron ? <Icon as={ChevronRight} className="size-4 text-muted-foreground" /> : null}
    </>
  );
  const className = "min-h-12 flex-row items-center gap-3 border-b border-border px-4 py-2";
  if (!onPress) return <View className={className}>{content}</View>;
  return (
    <ListButton
      accessibilityLabel={accessibilityLabel ?? title}
      onPress={onPress}
      testID={testID}
      className={className}
    >
      {content}
    </ListButton>
  );
}

export function SectionHeader({
  title,
  count,
  action,
}: {
  title: string;
  count?: number;
  action?: { label: string; onPress: () => void; icon?: LucideIcon };
}) {
  return (
    <View className="flex-row items-center gap-2 bg-background px-4 pb-1 pt-4">
      <Text className="flex-1 text-xs font-semibold text-muted-foreground">
        {title}
        {count !== undefined ? `  ${count}` : ""}
      </Text>
      {action ? (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2"
          onPress={action.onPress}
          accessibilityLabel={action.label}
        >
          <Icon as={action.icon ?? Plus} className="size-4 text-muted-foreground" />
        </Button>
      ) : null}
    </View>
  );
}

export function Chip({
  label,
  tone = "neutral",
  icon,
}: {
  label: string;
  tone?: "neutral" | "accent" | "danger" | "outline";
  icon?: LucideIcon;
}) {
  const variant = {
    neutral: "secondary",
    accent: "default",
    danger: "destructive",
    outline: "outline",
  } as const;
  return (
    <Badge variant={variant[tone]} className="px-1.5 py-0">
      {icon ? <Icon as={icon} className="size-3" /> : null}
      <Text className="text-[11px]">{label}</Text>
    </Badge>
  );
}

const statusIcons: Record<TaskStatus, { icon: LucideIcon; className: string }> = {
  not_started: { icon: Circle, className: "text-muted-foreground" },
  in_progress: { icon: CircleDot, className: "text-primary" },
  in_review: { icon: CircleDashed, className: "text-primary" },
  completed: { icon: CircleCheck, className: "text-muted-foreground" },
  canceled: { icon: CircleSlash, className: "text-muted-foreground" },
};

export function TaskStatusIcon({ status }: { status: TaskStatus }) {
  const { icon, className } = statusIcons[status];
  return (
    <Icon
      as={icon}
      className={cn("size-4", className)}
      accessibilityLabel={taskStatusLabels[status]}
    />
  );
}

export function PriorityChip({ priority }: { priority: TaskPriority }) {
  if (priority === "none") return null;
  const icon = { low: ArrowDown, medium: ArrowUp, high: ArrowUp, urgent: TriangleAlert }[priority];
  return (
    <Chip
      label={taskPriorityLabels[priority]}
      icon={icon}
      tone={priority === "urgent" ? "danger" : "outline"}
    />
  );
}

export function DueChip({ value, open = true }: { value: string | null; open?: boolean }) {
  if (!value) return null;
  return <Chip label={formatDate(value)} tone={open && overdue(value) ? "danger" : "outline"} />;
}

/** A label and value pair in a record's details. Tapping edits the field when allowed. */
export function Property({
  label,
  value,
  placeholder = "Not set",
  onPress,
}: {
  label: string;
  value?: string | null;
  placeholder?: string;
  onPress?: () => void;
}) {
  const body = (
    <>
      <Text className="w-28 text-sm font-normal text-muted-foreground">{label}</Text>
      <Text
        className={cn("flex-1 text-sm font-normal", !value && "text-muted-foreground")}
        numberOfLines={2}
      >
        {value || placeholder}
      </Text>
      {onPress ? <Icon as={ChevronRight} className="size-4 text-muted-foreground" /> : null}
    </>
  );
  const className = "min-h-11 flex-row items-center gap-2 border-b border-border px-4 py-2";
  return onPress ? (
    <ListButton
      accessibilityLabel={`${label}: ${value || placeholder}`}
      onPress={onPress}
      className={className}
    >
      {body}
    </ListButton>
  ) : (
    <View className={className}>{body}</View>
  );
}

/** Horizontal filter or section tabs. */
export function Segments<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly { value: T; label: string; count?: number }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityLabel={label}
      accessibilityRole="tablist"
      className="h-14 flex-none border-b border-border"
      contentContainerClassName="items-center gap-1 px-3 py-1"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Button
            key={option.value}
            variant={selected ? "default" : "ghost"}
            size="sm"
            role="tab"
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            aria-selected={selected}
            onPress={() => onChange(option.value)}
            className="h-8 gap-1 rounded-full px-3 shadow-none"
          >
            <Text
              className={cn(
                "text-[13px] font-medium",
                selected ? "text-primary-foreground" : "text-muted-foreground",
              )}
            >
              {option.label}
            </Text>
            {option.count !== undefined ? (
              <Text
                className={cn(
                  "text-[11px]",
                  selected ? "text-primary-foreground/80" : "text-muted-foreground",
                )}
              >
                {option.count}
              </Text>
            ) : null}
          </Button>
        );
      })}
    </ScrollView>
  );
}

/** A labelled block of rows inside a record detail. */
export function DetailSection({
  title,
  count,
  action,
  children,
}: {
  title: string;
  count?: number;
  action?: { label: string; onPress: () => void; icon?: LucideIcon };
  children: ReactNode;
}) {
  return (
    <View accessibilityLabel={title}>
      <SectionHeader title={title} count={count} action={action} />
      <View className="border-t border-border">{children}</View>
    </View>
  );
}
