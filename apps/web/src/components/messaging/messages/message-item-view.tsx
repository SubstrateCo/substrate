import type { ReactNode } from "react";

import { MessageMarkdown } from "../markdown/message-markdown";
import type { Message } from "../types";
import { Tag } from "@/components/feedback/tag";
import {
  MessageReactions,
  MessageToolbar,
} from "@/components/messaging/messages/message-interactions";
import { PersonCardTarget, useHasPersonCard } from "@/components/messaging/people/person-card-slot";
import { Timestamp } from "@/components/time/timestamp";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials } from "@/lib/people/initials";
import { cn } from "cn";

export function MessageItem({
  message,
  grouped = false,
  highlighted = false,
  onReact,
  pending = false,
  onThread,
  body,
  actions,
  avatarBadge,
  status,
  children,
}: {
  message: Message;
  /** Continues the previous message from the same author: no avatar or name. */
  grouped?: boolean;
  /** The message a link points to. */
  highlighted?: boolean;
  /** A small status mark on the avatar, such as an agent run's state. Agent replies never group. */
  avatarBadge?: ReactNode;
  /** A status after the time, such as the state of the work behind an agent's reply. */
  status?: ReactNode;
  onReact: (emoji: string) => void;
  pending?: boolean;
  onThread?: (id: string) => void;
  body?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const hasPersonCard = useHasPersonCard();
  const name = message.authorName || "Unknown member";
  return (
    <article
      aria-label={grouped ? `${name}, continued` : undefined}
      className={cn(
        "group/message relative mx-auto flex w-full max-w-3xl gap-2.5 px-4 hover:bg-row-hover has-data-[state=open]:bg-row-hover",
        grouped ? "py-0.5" : "pt-2 pb-0.5",
        highlighted &&
          "bg-row-selected before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-primary hover:bg-row-selected",
      )}
    >
      {grouped ? (
        <span className="flex w-9 shrink-0 justify-end text-xs leading-6 whitespace-nowrap text-muted-foreground opacity-0 group-hover/message:opacity-100 group-has-focus-visible/message:opacity-100">
          <Timestamp value={message.createdAt} format="time" />
        </span>
      ) : (
        <span className="relative mt-0.5 h-fit shrink-0">
          <Avatar
            aria-hidden="true"
            variant={message.authorType === "agent" ? "agent" : "message"}
            className="size-9"
          >
            <AvatarFallback>{initials(message.authorName)}</AvatarFallback>
          </Avatar>
          {avatarBadge}
        </span>
      )}
      <div className="min-w-0 flex-1">
        {!grouped && (
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <PersonCardTarget actorId={message.authorActorEntityId} name={name}>
              <span
                className={cn(
                  "text-sm font-semibold",
                  hasPersonCard && "rounded-sm underline-offset-2 hover:underline",
                )}
              >
                {name}
              </span>
            </PersonCardTarget>
            {message.authorType === "agent" && <Tag>Agent</Tag>}
            {message.authorExternal && <Tag>External</Tag>}
            <Timestamp
              value={message.createdAt}
              format="time"
              className="text-xs text-muted-foreground"
            />
            {status && <span className="flex min-w-0 self-center">{status}</span>}
          </div>
        )}
        {body ?? <MessageMarkdown body={message.body} />}
        <MessageReactions
          message={message}
          onReact={onReact}
          pending={pending}
          onThread={onThread}
        />
        {children}
      </div>
      <MessageToolbar
        message={message}
        onReact={onReact}
        pending={pending}
        onThread={onThread}
        actions={actions}
      />
    </article>
  );
}
