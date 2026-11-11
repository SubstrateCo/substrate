import { Link } from "@tanstack/react-router";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import type { WorkTone } from "@/lib/agent-work/status";
import type { RecordLink } from "@/lib/navigation/record-links";
import { cn } from "cn";
import { Bot, MessageSquarePlus } from "lucide-react";

export type ComposerNoticeLine = {
  key: string;
  agentName: string;
  tone: WorkTone;
  label: ReactNode;
  /** For example, a link to agent settings when no desktop runs the agent. */
  link?: { link: RecordLink; label: string };
};

/**
 * Above the composer: what the owner's agents here are doing. The composer stays editable; new
 * messages join the current work or wait for it.
 */
export function ComposerNotice({
  lines,
  onNewTopic,
  startingTopic,
}: {
  lines: ComposerNoticeLine[];
  /** Direct messages with an agent on this desktop can start a new topic. */
  onNewTopic?: () => void;
  startingTopic: boolean;
}) {
  if (!lines.length && !onNewTopic) return null;
  return (
    <div
      role="status"
      aria-label="Agent status"
      className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 px-4 pt-2 text-xs text-muted-foreground"
    >
      {lines.map((line) => (
        <span key={line.key} className="flex min-w-0 items-center gap-1.5">
          <Bot aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="font-medium text-foreground">{line.agentName}</span>
          <span
            className={cn(
              "min-w-0 truncate tabular-nums",
              line.tone === "attention" && "text-warning-text",
              line.tone === "working" && "text-primary",
            )}
          >
            {line.label}
          </span>
          {line.link && (
            <Link {...line.link.link} className="shrink-0 font-medium text-primary hover:underline">
              {line.link.label}
            </Link>
          )}
        </span>
      ))}
      {onNewTopic && (
        <Button
          type="button"
          size="xs"
          variant="ghost"
          className="ml-auto"
          disabled={startingTopic}
          title="The agent keeps its memory but starts this conversation with a clean slate"
          onClick={onNewTopic}
        >
          <MessageSquarePlus aria-hidden="true" />
          New topic
        </Button>
      )}
    </div>
  );
}
