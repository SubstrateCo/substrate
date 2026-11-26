import { useEffect, useRef, type ReactNode } from "react";

import { TechnicalDetails } from "../technical-details";
import { TurnTimelineLoading } from "./turn-timeline";
import { ContentNotice } from "@/components/feedback/content-notice";
import { PaneState } from "@/components/feedback/pane-state";
import { PendingButton } from "@/components/feedback/pending-button";
import { SkeletonText } from "@/components/feedback/skeleton-text";
import { toneText } from "@/components/feedback/tag-styles";
import { PageHeader } from "@/components/layout/page-header";
import { PageAside, useAsideCovers } from "@/components/layout/page-layout";
import { Timestamp } from "@/components/time/timestamp";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { WorkTone } from "@/lib/agent-work/status";
import { cn } from "cn";
import { Bot, Laptop, Square, X } from "lucide-react";

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 gap-4">
      <dt className="w-16 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 flex-1 flex-wrap gap-x-2 wrap-anywhere">{children}</dd>
    </div>
  );
}

function TranscriptDetails({
  startedAt,
  session,
  sources,
  outputs,
  usage,
  diagnostic,
  loading,
}: {
  startedAt?: string;
  session?: string;
  sources?: ReactNode;
  outputs?: ReactNode;
  usage?: string;
  diagnostic?: string;
  loading?: boolean;
}) {
  return (
    <dl className="grid gap-1.5 border-b px-5 py-3 text-xs">
      {loading && (
        <Detail label="Started">
          <SkeletonText width="8rem" />
        </Detail>
      )}
      {startedAt && (
        <Detail label="Started">
          <Timestamp value={startedAt} format="datetime" />
        </Detail>
      )}
      {session && <Detail label="Session">{session}</Detail>}
      {sources && <Detail label="From">{sources}</Detail>}
      {outputs && <Detail label="Output">{outputs}</Detail>}
      <Detail label="Usage">
        {loading ? <SkeletonText width="6rem" /> : (usage ?? "Unavailable")}
      </Detail>
      {diagnostic && (
        <Detail label="Error">
          <TechnicalDetails>{diagnostic}</TechnicalDetails>
        </Detail>
      )}
    </dl>
  );
}

function TranscriptBody({
  unavailable,
  timelineNotice,
  loading,
  error,
  onRetry,
  details,
  timeline,
}: {
  unavailable?: string;
  timelineNotice?: string;
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
  details: ReactNode;
  timeline?: ReactNode;
}) {
  if (unavailable) return <PaneState label={unavailable} />;
  if (timeline || timelineNotice)
    return (
      <div className="min-h-0 flex-1 overflow-y-auto">
        {details}
        {timeline ?? (
          <div className="px-5 py-4">
            <ContentNotice
              variant="compact"
              icon={Laptop}
              title="The transcript is on another desktop"
              description={timelineNotice}
            />
          </div>
        )}
      </div>
    );
  if (loading)
    return (
      <div role="status" aria-label="Loading transcript" className="min-h-0 flex-1 overflow-y-auto">
        <div aria-hidden="true">
          <TranscriptDetails loading />
          <TurnTimelineLoading />
        </div>
      </div>
    );
  return (
    <PaneState
      label={error ? "Transcript unavailable" : "Loading transcript"}
      error={error}
      onRetry={onRetry}
    />
  );
}

/** A turn's full record in its own side panel. */
export function TurnTranscriptView({
  name,
  tone,
  label,
  startedAt,
  session,
  usage,
  diagnostic,
  sources,
  outputs,
  timeline,
  unavailable,
  timelineNotice,
  loading,
  error,
  onRetry,
  onClose,
  onStop,
  stopping,
}: {
  name: string;
  tone?: WorkTone;
  label?: string;
  startedAt?: string;
  session?: string;
  usage?: string;
  /** What the runtime reported when the work stopped, shown under Technical details. */
  diagnostic?: string;
  sources?: ReactNode;
  outputs?: ReactNode;
  timeline?: ReactNode;
  /** Why the turn can't show here, such as work that is gone. */
  unavailable?: string;
  /** Why the timeline can't show here: only the desktop that ran the work stores it. */
  timelineNotice?: string;
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
  onClose: () => void;
  onStop?: () => void;
  stopping: boolean;
}) {
  const close = useRef<HTMLButtonElement>(null);
  const covers = useAsideCovers();
  useEffect(() => {
    // When the panel covers the page, focus moves into it.
    if (covers) close.current?.focus();
  }, [covers]);
  return (
    <PageAside aria-label="Agent transcript">
      <PageHeader
        variant="pane"
        icon={<Bot aria-hidden="true" />}
        title={`${name} · transcript`}
        actions={
          <>
            {label && (
              <span
                className={cn(
                  "mr-1.5 max-w-20 truncate text-xs text-muted-foreground tabular-nums sm:max-w-32",
                  tone && toneText[tone],
                )}
              >
                {label}
              </span>
            )}
            {onStop && (
              <PendingButton
                type="button"
                size="sm"
                variant="destructive-ghost"
                pending={stopping}
                onClick={onStop}
              >
                <Square aria-hidden="true" />
                Stop
              </PendingButton>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  ref={close}
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Close transcript"
                  onClick={onClose}
                >
                  <X />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Close transcript</TooltipContent>
            </Tooltip>
          </>
        }
      />
      <TranscriptBody
        unavailable={unavailable}
        timelineNotice={timelineNotice}
        loading={loading}
        error={error}
        onRetry={onRetry}
        details={
          <TranscriptDetails
            startedAt={startedAt}
            session={session}
            sources={sources}
            outputs={outputs}
            usage={usage}
            diagnostic={diagnostic}
          />
        }
        timeline={timeline}
      />
    </PageAside>
  );
}
