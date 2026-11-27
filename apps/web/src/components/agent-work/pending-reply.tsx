import type { AgentAvatarCode } from "@substrate/contracts/agents";

import type { ReactNode } from "react";

import { WorkIndicator } from "./work-indicator";
import { AgentAvatarView } from "@/components/agents/agent-avatar";
import { Tag } from "@/components/feedback/tag";
import { MessageRowLayout } from "@/components/messaging/messages/message-row-layout";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { WorkMood, WorkTone } from "@/lib/agent-work/status";
import { LockKeyhole } from "lucide-react";

/**
 * Stands in for the agent's reply until it posts one, with the shape of the reply message, so
 * the reply takes its place without moving the timeline. Only the agent's owner sees agent
 * work; everyone else sees only the reply when it arrives.
 *
 * It is a separate message row after its source, never part of a user's message body.
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
    <section aria-label={`${name} reply`}>
      <MessageRowLayout
        author={{
          avatar: (
            <span className="relative mt-0.5 block h-fit">
              <AgentAvatarView avatar={avatar} size="lg" mood={mood ?? undefined} />
              {!mood && <WorkIndicator tone={tone} />}
            </span>
          ),
          byline: (
            <>
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
            </>
          ),
        }}
      >
        {line && <p className="text-sm leading-6 text-muted-foreground">{line}</p>}
        {children}
      </MessageRowLayout>
    </section>
  );
}
