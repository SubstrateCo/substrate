import { Tag } from "@/components/feedback/tag";
import type { WorkStatus } from "@/lib/agent-work/status";
import { cn } from "cn";
import { Check, CircleAlert, Hand, Minus, Square } from "lucide-react";

function ToneIcon({ tone }: { tone: WorkStatus["tone"] }) {
  const className = "size-3 shrink-0";
  if (tone === "done") return <Check aria-hidden="true" className={className} />;
  if (tone === "failed") return <CircleAlert aria-hidden="true" className={className} />;
  if (tone === "attention") return <Hand aria-hidden="true" className={className} />;
  if (tone === "idle") return <Square aria-hidden="true" className={className} />;
  if (tone === "muted") return <Minus aria-hidden="true" className={className} />;
  return (
    <span aria-hidden="true" className="grid size-3 shrink-0 place-items-center">
      <span className="size-1.5 rounded-full bg-primary motion-safe:animate-pulse" />
    </span>
  );
}

/**
 * A turn's state as words and an icon, so color is never the only signal. The label comes from
 * `turnLabel`, such as "Worked for 2m 00s" or "Stopped · needs you".
 */
export function WorkStatusTag({ status }: { status: WorkStatus }) {
  return (
    <Tag
      className={cn(
        "inline-flex max-w-full items-center gap-1 tabular-nums",
        status.tone === "working" && "text-foreground",
        status.tone === "attention" && "border-warning/50 bg-warning/10 text-warning-text",
        status.tone === "failed" && "border-destructive/40 bg-destructive/5 text-destructive",
        status.tone === "done" && "text-success",
      )}
    >
      <ToneIcon tone={status.tone} />
      <span className="truncate">{status.label}</span>
    </Tag>
  );
}
