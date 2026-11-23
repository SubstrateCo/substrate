import type { CalendarSyncStatus } from "@substrate/contracts/calendar";

import { Tag } from "@/components/feedback/tag";
import { syncStatusLabels, type StatusTone } from "@/lib/calendar/labels";
import { cn } from "cn";
import { Check, CircleAlert, Pause, TriangleAlert, Unlink } from "lucide-react";

function ToneIcon({ status, tone }: { status: CalendarSyncStatus; tone: StatusTone }) {
  const className = "size-3 shrink-0";
  if (tone === "working")
    return (
      <span aria-hidden="true" className="grid size-3 shrink-0 place-items-center">
        <span className="size-1.5 rounded-full bg-primary motion-safe:animate-pulse" />
      </span>
    );
  if (tone === "success") return <Check aria-hidden="true" className={className} />;
  if (tone === "warning") return <TriangleAlert aria-hidden="true" className={className} />;
  if (tone === "destructive") return <CircleAlert aria-hidden="true" className={className} />;
  if (status === "disconnected") return <Unlink aria-hidden="true" className={className} />;
  return <Pause aria-hidden="true" className={className} />;
}

/** A calendar's sync state as words and an icon, so color is never the only signal. */
export function CalendarStatusTag({ status }: { status: CalendarSyncStatus }) {
  const { label, tone } = syncStatusLabels[status];
  return (
    <Tag
      className={cn(
        "inline-flex shrink-0 items-center gap-1",
        tone === "working" && "text-foreground",
        tone === "success" && "text-success",
        tone === "warning" && "border-warning/50 bg-warning/10 text-warning-text",
        tone === "destructive" && "border-destructive/40 bg-destructive/5 text-destructive",
      )}
    >
      <ToneIcon status={status} tone={tone} />
      {label}
    </Tag>
  );
}
