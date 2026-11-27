import type { AgentAvatarCode } from "@substrate/contracts/agents";

import type { ReactNode } from "react";

import { WorkIndicator } from "./work-indicator";
import { AgentAvatarView } from "@/components/agents/agent-avatar";
import { Tag } from "@/components/feedback/tag";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { WorkMood, WorkTone } from "@/lib/agent-work/status";
import { LockKeyhole } from "lucide-react";

/**
 * Stands in for the agent's reply until it posts one, with the shape of the reply message, so
 * the reply takes its place without moving the timeline. Only the agent's owner sees agent
 * work; everyone else sees only the reply when it arrives.
 *
 * It renders inside the owner message it answers, with its avatar in that message's gutter.
 */
export function PendingReply({
  name,
  avatar,
  mood,
  tone,
  status,
  line,
  children,
}: {
  name: string;
  /** The agent's look, or null while it is not known. */
  avatar: AgentAvatarCode | null;
  /** Queued and live work show in the avatar's mood. */
  mood: WorkMood | null;
  /** Ended work shows its dot on the avatar. */
  tone: WorkTone;
  /** The work's status, in the byline. */
  status: ReactNode;
  /** One line where the reply's text will go, such as the latest activity. */
  line?: ReactNode;
  children?: ReactNode;
}) {
  return (
    // The owner message's bottom padding and the reply's top padding, so the reply lands here.
    <section aria-label={`${name} reply`} className="relative mt-2.5 min-w-0">
      <span className="absolute top-0.5 -left-12">
        <span className="relative block h-fit">
          <AgentAvatarView avatar={avatar} size="lg" mood={mood ?? undefined} />
          {!mood && <WorkIndicator tone={tone} />}
        </span>
      </span>
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
        {/* oxlint-disable-next-line design/no-decorative-class -- The agent's name, as in a message byline. */}
        <span className="text-sm font-semibold wrap-anywhere">{name}</span>
        <Tag>Agent</Tag>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              tabIndex={0}
              aria-label="Only visible to you"
              className="self-center text-muted-foreground"
            >
              <LockKeyhole aria-hidden="true" className="size-3" />
            </span>
          </TooltipTrigger>
          <TooltipContent>Only visible to you</TooltipContent>
        </Tooltip>
        <span className="flex min-w-0 flex-1 self-center">{status}</span>
      </div>
      {line && <p className="h-6 truncate text-sm leading-6 text-muted-foreground">{line}</p>}
      {children}
    </section>
  );
}
