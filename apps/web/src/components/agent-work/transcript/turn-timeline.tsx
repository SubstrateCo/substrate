import { Link } from "@tanstack/react-router";

import type { ReactNode } from "react";

import { ContentNotice } from "@/components/feedback/content-notice";
import { SkeletonText } from "@/components/feedback/skeleton-text";
import { MessageMarkdown } from "@/components/messaging/markdown/message-markdown";
import { Skeleton } from "@/components/ui/skeleton";
import type { TranscriptEntry } from "@/lib/agent-work/transcript";
import type { RecordLink } from "@/lib/navigation/record-links";
import { Bot, Check, CornerDownRight, Hand, MessageSquarePlus, RotateCcw, X } from "lucide-react";

const outputLabels = { message: "Posted a message", task: "Changed a task", request: "Asked you" };

function TimelineText({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex min-w-0 gap-2.5">
      {icon}
      <div className="min-w-0 flex-1 text-sm">{children}</div>
    </li>
  );
}

const stepIcons: Record<Extract<TranscriptEntry, { type: "step" }>["state"], ReactNode> = {
  current: (
    <span aria-hidden="true" className="grid size-3.5 shrink-0 place-items-center">
      <span className="size-1.5 rounded-full bg-primary motion-safe:animate-pulse" />
    </span>
  ),
  done: <Check aria-hidden="true" className="size-3.5 shrink-0 text-success" />,
  error: <X aria-hidden="true" className="size-3.5 shrink-0 text-destructive" />,
};

export function TurnTimelineLoading() {
  return (
    <ol aria-hidden="true" className="grid gap-3 px-5 py-4">
      {[0, 1].map((i) => (
        <TimelineText key={i} icon={<Skeleton className="mt-0.5 size-5 shrink-0" />}>
          <SkeletonText width="90%" />
          <br />
          <SkeletonText width="60%" />
        </TimelineText>
      ))}
    </ol>
  );
}

export function TurnTimeline({
  entries,
  renderRequest,
  outputLink,
}: {
  entries: TranscriptEntry[];
  renderRequest: (requestId: string) => ReactNode;
  outputLink: (entry: Extract<TranscriptEntry, { type: "output" }>) => RecordLink | undefined;
}) {
  if (!entries.length)
    return (
      <div className="px-5 py-4">
        <ContentNotice variant="inline" title="Nothing has happened yet" />
      </div>
    );
  return (
    <ol className="grid gap-3 px-5 py-4">
      {entries.map((entry) => {
        switch (entry.type) {
          case "text":
            return (
              <TimelineText
                key={entry.key}
                icon={
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-md bg-accent text-accent-foreground">
                    <Bot aria-hidden="true" className="size-3" />
                  </span>
                }
              >
                <MessageMarkdown body={entry.text} />
              </TimelineText>
            );
          case "step":
            return (
              <li
                key={entry.key}
                className="flex min-w-0 items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs"
              >
                {stepIcons[entry.state]}
                <span className="min-w-0 font-mono wrap-anywhere">{entry.text}</span>
              </li>
            );
          case "request":
            return (
              <li key={entry.key} className="min-w-0 text-xs text-muted-foreground">
                <span className="flex items-center gap-2">
                  <Hand aria-hidden="true" className="size-3.5 shrink-0" />
                  {entry.kind === "proposal" ? "Proposed an action" : "Asked you"}
                </span>
                {renderRequest(entry.requestId)}
              </li>
            );
          case "output": {
            const link = outputLink(entry);
            return (
              <li key={entry.key} className="flex items-center gap-2 text-xs text-muted-foreground">
                <CornerDownRight aria-hidden="true" className="size-3.5 shrink-0" />
                {link ? (
                  <Link {...link} className="font-medium text-primary hover:underline">
                    {outputLabels[entry.output.kind]}
                  </Link>
                ) : (
                  outputLabels[entry.output.kind]
                )}
              </li>
            );
          }
          case "input":
            return (
              <li key={entry.key} className="flex items-center gap-2 text-xs text-muted-foreground">
                <MessageSquarePlus aria-hidden="true" className="size-3.5 shrink-0" />
                Your new message was added to this work
              </li>
            );
          case "note":
            return (
              <li key={entry.key} className="text-xs wrap-anywhere text-muted-foreground">
                {entry.text}
              </li>
            );
          case "error":
            return (
              <li
                key={entry.key}
                className="flex min-w-0 gap-2 text-xs wrap-anywhere text-destructive"
              >
                <X aria-hidden="true" className="mt-px size-3.5 shrink-0" />
                {entry.text}
              </li>
            );
          case "attempt":
            return (
              <li
                key={entry.key}
                className="flex items-center gap-2 border-t pt-3 text-xs font-medium text-muted-foreground"
              >
                <RotateCcw aria-hidden="true" className="size-3.5 shrink-0" />
                Resumed after interruption · attempt {entry.attempt}
              </li>
            );
        }
      })}
    </ol>
  );
}
