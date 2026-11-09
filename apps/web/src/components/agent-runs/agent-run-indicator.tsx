import type { RunTone } from "@/lib/agent-runs/runs";
import { cn } from "cn";

const tones: Record<RunTone, string> = {
  idle: "bg-muted-foreground/60",
  working: "bg-primary",
  attention: "bg-warning",
  done: "bg-success",
  failed: "bg-destructive",
};

const labels: Record<RunTone, string> = {
  idle: "Agent run is not working",
  working: "Agent is working",
  attention: "Agent needs you",
  done: "Agent run finished",
  failed: "Agent run failed",
};

/** A small dot on the agent's avatar. Working and waiting runs pulse softly. */
export function AgentRunIndicator({
  tone,
  label = labels[tone],
}: {
  tone: RunTone;
  label?: string;
}) {
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
