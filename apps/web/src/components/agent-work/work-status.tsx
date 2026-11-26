import { WorkOrb } from "./work-orb";
import { PendingButton } from "@/components/feedback/pending-button";
import { toneText } from "@/components/feedback/tag-styles";
import { Pressable } from "@/components/ui/pressable";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { WorkTone } from "@/lib/agent-work/status";
import { cn } from "cn";
import { Check, ChevronRight, CircleAlert, Square, X } from "lucide-react";

function ToneIcon({ tone }: { tone: WorkTone }) {
  if (tone === "done")
    return <Check aria-hidden="true" className="size-3.5 shrink-0 text-success" />;
  if (tone === "failed")
    return <X aria-hidden="true" className="size-3.5 shrink-0 text-destructive" />;
  if (tone === "attention")
    return <CircleAlert aria-hidden="true" className="size-3.5 shrink-0 text-warning" />;
  if (tone === "working") return <WorkOrb />;
  return null;
}

/**
 * A turn's work as one status in the reply's header, such as "Worked for 28s". It opens the
 * transcript, which holds the steps. Requests, attention cards, and errors stay in the message
 * body so they are never hidden.
 */
export function WorkStatus({
  tone,
  label,
  activity,
  onTranscript,
  onStop,
  stopping,
}: {
  tone: WorkTone;
  label: string;
  /** The latest activity, shown beside the label while the work runs. */
  activity: string | null;
  onTranscript: () => void;
  /** Present while the work can still be stopped. */
  onStop?: () => void;
  stopping: boolean;
}) {
  return (
    <span className="flex max-w-full min-w-0 items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <Pressable
            onClick={onTranscript}
            className="group/status flex max-w-full min-w-0 items-center gap-1.5 rounded-md px-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ToneIcon tone={tone} />
            <span className={cn("shrink-0 tabular-nums", toneText[tone])}>{label}</span>
            {tone === "working" && activity && (
              <span className="max-w-80 min-w-0 truncate">· {activity}</span>
            )}
            <ChevronRight
              aria-hidden="true"
              className="size-3 shrink-0 opacity-0 transition-opacity group-hover/status:opacity-100 group-focus-visible/status:opacity-100"
            />
            <span className="sr-only">Open transcript</span>
          </Pressable>
        </TooltipTrigger>
        <TooltipContent>Open transcript</TooltipContent>
      </Tooltip>
      {onStop && (
        <PendingButton
          type="button"
          size="xs"
          variant="destructive-ghost"
          pending={stopping}
          onClick={onStop}
        >
          <Square aria-hidden="true" />
          Stop
        </PendingButton>
      )}
    </span>
  );
}

/** A silent turn: one muted line, with nothing to open. */
export function MutedWorkLine({ label }: { label: string }) {
  return <p className="mt-1 text-xs text-muted-foreground">{label}</p>;
}
