import type { ReactNode } from "react";

import { MessageMarkdown } from "../markdown/message-markdown";
import type { Message } from "../types";
import { MessageInteractions } from "@/components/messaging/messages/message-item/message-interactions";
import { PersonCardTarget, useHasPersonCard } from "@/components/messaging/people/person-card-slot";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export function MessageItem({
  message,
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
  /** A small status mark on the avatar, such as an agent run's state. */
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
  return (
    <article className="group flex gap-2.5 px-4 py-2 hover:bg-muted/40">
      <span className="relative h-fit shrink-0">
        <Avatar aria-hidden="true" variant="message" className="size-9">
          <AvatarFallback>{(message.authorName || "?").slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        {avatarBadge}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <PersonCardTarget
            actorId={message.authorActorEntityId}
            name={message.authorName || "Unknown member"}
          >
            <span
              className={`text-sm font-semibold ${hasPersonCard ? "rounded-sm underline-offset-2 hover:underline" : ""}`}
            >
              {message.authorName || "Unknown member"}
            </span>
          </PersonCardTarget>
          {message.authorType === "agent" && (
            <span className="rounded border px-1.5 py-0.5 text-xs text-muted-foreground">
              Agent
            </span>
          )}
          {message.authorExternal && (
            <span className="rounded border px-1.5 py-0.5 text-xs text-muted-foreground">
              External
            </span>
          )}
          <time
            dateTime={new Date(message.createdAt).toISOString()}
            title={new Date(message.createdAt).toLocaleString()}
            className="text-xs text-muted-foreground"
            suppressHydrationWarning
          >
            {new Date(message.createdAt).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            })}
          </time>
          {status && <span className="flex min-w-0 self-center">{status}</span>}
        </div>
        {body ?? <MessageMarkdown body={message.body} />}
        <MessageInteractions
          message={message}
          onReact={onReact}
          pending={pending}
          onThread={onThread}
          actions={actions}
        />
        {children}
      </div>
    </article>
  );
}
