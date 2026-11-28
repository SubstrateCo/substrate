import type { CalendarSyncStatus } from "@substrate/contracts/calendar";

import { Tag } from "@/components/feedback/tag";
import { syncStatusLabels, type StatusTone } from "@/lib/calendar/labels";
import { Check, CircleAlert, Pause, TriangleAlert, Unlink, type LucideIcon } from "lucide-react";

const toneIcons: Partial<Record<StatusTone, LucideIcon>> = {
  success: Check,
  warning: TriangleAlert,
  destructive: CircleAlert,
};

export function CalendarStatusTag({ status }: { status: CalendarSyncStatus }) {
  const { label, tone } = syncStatusLabels[status];
  const Icon =
    tone === "working"
      ? undefined
      : (toneIcons[tone] ?? (status === "disconnected" ? Unlink : Pause));
  return (
    <Tag
      tone={tone === "neutral" ? "default" : tone}
      icon={Icon && <Icon aria-hidden="true" className="size-3 shrink-0" />}
      className="shrink-0"
    >
      {label}
    </Tag>
  );
}
