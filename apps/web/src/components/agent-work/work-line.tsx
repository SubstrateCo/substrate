import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { WorkTone } from "@/lib/agent-work/status";
import type { StepState } from "@/lib/agent-work/transcript";
import { cn } from "cn";
import { Check, ChevronDown, PanelRight, Square, X } from "lucide-react";

// Longer work shows its latest steps; the transcript has the rest.
const shownSteps = 8;

export type WorkStep = { key: string; text: string; state: StepState };

function StepIcon({ state }: { state: StepState }) {
  if (state === "done")
    return <Check aria-hidden="true" className="size-3.5 shrink-0 text-success" />;
  if (state === "error")
    return <X aria-hidden="true" className="size-3.5 shrink-0 text-destructive" />;
  return (
    <span aria-hidden="true" className="grid size-3.5 shrink-0 place-items-center">
      <span className="size-1.5 rounded-full bg-primary motion-safe:animate-pulse" />
    </span>
  );
}

/** A silent turn: one muted line, with nothing to open. */
export function MutedWorkLine({ label }: { label: string }) {
  return <p className="mt-1 text-xs text-muted-foreground">{label}</p>;
}

/**
 * A turn's work under its message: one line that opens to a light list of steps. Requests,
 * attention cards, and errors stay outside the fold so they are never hidden.
 */
export function WorkLine({
  tone,
  label,
  activity,
  error,
  open,
  onOpenChange,
  steps,
  stepsLoading,
  stepsError,
  onRetrySteps,
  stepsUnavailable,
  attention,
  onTranscript,
  onStop,
  stopping,
}: {
  tone: WorkTone;
  label: string;
  /** The latest activity, shown beside the label while the work is folded. */
  activity: string | null;
  error: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  steps?: WorkStep[];
  stepsLoading: boolean;
  stepsError: Error | null;
  onRetrySteps: () => void;
  /** Steps live on the agent's home desktop. Other devices say where to open them. */
  stepsUnavailable?: string;
  attention?: ReactNode;
  onTranscript?: () => void;
  /** Present while the work can still be stopped. */
  onStop?: () => void;
  stopping: boolean;
}) {
  const hidden = (steps?.length ?? 0) - shownSteps;
  const shown = hidden > 0 ? steps!.slice(-shownSteps) : steps;
  return (
    <div className="mt-1.5 max-w-180 min-w-0">
      <Collapsible open={open} onOpenChange={onOpenChange}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="-ml-1 flex max-w-full min-w-0 items-center gap-1.5 rounded-md px-1 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <ChevronDown
              aria-hidden="true"
              className={cn("size-3.5 shrink-0 transition-transform", !open && "-rotate-90")}
            />
            <span
              className={cn(
                "shrink-0 font-medium tabular-nums",
                tone === "attention" && "text-warning",
                tone === "failed" && "text-destructive",
              )}
            >
              {label}
            </span>
            {!open && tone === "working" && activity && (
              <span className="min-w-0 truncate">· {activity}</span>
            )}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-1.5 ml-1.75 grid gap-1.5 border-l py-0.5 pl-4 text-xs">
            {stepsUnavailable && <p className="text-muted-foreground">{stepsUnavailable}</p>}
            {hidden > 0 && (
              <p className="text-muted-foreground">
                {hidden} earlier {hidden === 1 ? "step" : "steps"}
              </p>
            )}
            {stepsError && !steps && (
              <p className="text-muted-foreground">
                Couldn’t load the steps.{" "}
                <button
                  type="button"
                  className="font-medium text-primary hover:underline"
                  onClick={onRetrySteps}
                >
                  Try again
                </button>
              </p>
            )}
            {stepsLoading && !steps && !stepsUnavailable && (
              <p className="text-muted-foreground">Loading steps…</p>
            )}
            {steps && !steps.length && <p className="text-muted-foreground">No steps yet.</p>}
            {shown && shown.length > 0 && (
              <ol className="grid gap-1.5">
                {shown.map((step) => (
                  <li key={step.key} className="flex min-w-0 items-center gap-2">
                    <StepIcon state={step.state} />
                    <span
                      title={step.text}
                      className={cn(
                        "min-w-0 truncate",
                        step.state === "error" && "text-destructive",
                        step.state === "done" && "text-muted-foreground",
                      )}
                    >
                      {step.text}
                    </span>
                  </li>
                ))}
              </ol>
            )}
            {(onTranscript || onStop) && (
              <div className="flex items-center gap-1 pt-0.5">
                {onTranscript && (
                  <Button
                    type="button"
                    size="xs"
                    variant="link"
                    className="-ml-2"
                    onClick={onTranscript}
                  >
                    <PanelRight aria-hidden="true" />
                    Open transcript
                  </Button>
                )}
                {onStop && (
                  <Button
                    type="button"
                    size="xs"
                    variant="destructive"
                    disabled={stopping}
                    onClick={onStop}
                  >
                    <Square aria-hidden="true" />
                    {stopping ? "Stopping…" : "Stop"}
                  </Button>
                )}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
      {error && <p className="mt-1 text-xs wrap-anywhere text-destructive">{error}</p>}
      {attention}
    </div>
  );
}
