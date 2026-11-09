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

/** A small dot on the agent's avatar. Working and waiting work pulses softly. */
export function WorkIndicator({ tone, label = labels[tone] }: { tone: WorkTone; label?: string }) {
  const live = tone === "working" || tone === "attention";
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        "absolute -right-1 -bottom-1 size-3 rounded-full border-2 border-surface",
        tones[tone],
      )}
    >
      {live && (
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-full bg-inherit opacity-60 motion-safe:animate-ping"
        />
      )}
    </span>
  );
}
