import type { AgentAvatarCode } from "@substrate/contracts/agents";

import { Link } from "@tanstack/react-router";

import type { ReactNode } from "react";

import { AgentAvatarView } from "@/components/agents/agent-avatar";
import { toneText } from "@/components/feedback/tag-styles";
import { enterMotion } from "@/components/motion/motion";
import { useListMotion } from "@/components/motion/use-list-motion";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { WorkMood, WorkTone } from "@/lib/agent-work/status";
import type { RecordLink } from "@/lib/navigation/record-links";
import { cn } from "cn";
import { MessageSquarePlus } from "lucide-react";

export type ComposerNoticeLine = {
  key: string;
  agentName: string;
  avatar: AgentAvatarCode | null;
  tone: WorkTone;
  mood?: WorkMood | null;
  label: ReactNode;
  status?: ReactNode;
  turnId?: string;
  link?: { link: RecordLink; label: string };
};

function showTurn(from: HTMLElement, turnId: string) {
  const selector = `[data-turn-status="${CSS.escape(turnId)}"]`;
  let pane: HTMLElement | null = from;
  while (pane && !pane.querySelector('[role="log"]')) pane = pane.parentElement;
  const target = pane?.querySelector(selector) ?? document.querySelector(selector);
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  target?.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
}

function NoticePill({ line }: { line: ComposerNoticeLine }) {
  const { turnId } = line;
  return (
    <div
      data-motion-key={line.key}
      className={cn(
        "pointer-events-auto flex h-8 max-w-full min-w-0 items-center gap-1.5 rounded-lg border bg-surface pr-1 pl-2 text-xs text-muted-foreground shadow-floating",
        enterMotion.rise,
      )}
    >
      <AgentAvatarView avatar={line.avatar} size="xs" mood={line.mood ?? undefined} />
      <span className="shrink-0 font-medium text-foreground">{line.agentName}</span>
      {line.status ?? (
        <span className={cn("min-w-0 truncate pr-2 tabular-nums", toneText[line.tone])}>
          {line.label}
        </span>
      )}
      {line.link && (
        <Link
          {...line.link.link}
          className="shrink-0 pr-2 font-medium text-primary hover:underline"
        >
          {line.link.label}
        </Link>
      )}
      {turnId && (
        <Button
          type="button"
          size="xs"
          variant="ghost"
          aria-label={`Show ${line.agentName}’s work`}
          onClick={(event) => showTurn(event.currentTarget, turnId)}
        >
          Show
        </Button>
      )}
    </div>
  );
}

export function ComposerNotice({
  lines,
  onNewTopic,
  startingTopic,
}: {
  lines: ComposerNoticeLine[];
  onNewTopic?: () => void;
  startingTopic: boolean;
}) {
  const stack = useListMotion<HTMLDivElement>("bottom", "drop");
  return (
    <div role="status" aria-label="Agent status" className="flex items-end gap-2 px-4">
      <div className="relative min-w-0 flex-1 self-stretch">
        <div
          ref={stack}
          className="pointer-events-none absolute inset-x-0 bottom-0 mb-3 flex flex-col items-start gap-1.5"
        >
          {lines.map((line) => (
            <NoticePill key={line.key} line={line} />
          ))}
        </div>
      </div>
      {onNewTopic && (
        <div className="shrink-0 pt-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="xs"
                variant="ghost"
                disabled={startingTopic}
                onClick={onNewTopic}
              >
                <MessageSquarePlus aria-hidden="true" />
                New topic
              </Button>
            </TooltipTrigger>
            <TooltipContent>Starts a fresh session for this conversation</TooltipContent>
          </Tooltip>
        </div>
      )}
    </div>
  );
}
