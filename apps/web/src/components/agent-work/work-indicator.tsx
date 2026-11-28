import type { WorkTone } from "@/lib/agent-work/status";
import { cn } from "cn";

const tones: Record<WorkTone, string> = {
  idle: "bg-muted-foreground/60",
  muted: "bg-muted-foreground/40",
  working: "bg-primary",
  attention: "bg-warning",
  done: "bg-success",
  failed: "bg-destructive",
};

const labels: Record<WorkTone, string> = {
  idle: "Agent is not working",
  muted: "Agent found nothing to report",
  working: "Agent is working",
  attention: "Agent needs you",
  done: "Agent finished",
  failed: "Agent work failed",
};

export function WorkIndicator({
  tone,
  label = labels[tone],
  compact = false,
}: {
  tone: WorkTone;
  label?: string;
  compact?: boolean;
}) {
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        "absolute rounded-full border-2 border-surface",
        compact ? "-right-0.5 -bottom-0.5 size-2.5" : "-right-1 -bottom-1 size-3",
        tones[tone],
        tone === "working" && "motion-safe:animate-pulse",
      )}
    />
  );
}
