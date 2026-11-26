import type { ReactNode } from "react";

import { MessageMarkdown } from "../markdown/message-markdown";
import type { Message } from "../types";
import { Tag } from "@/components/feedback/tag";
import { messageAuthorName } from "@/components/messaging/messages/message-author";
import {
  MessageReactions,
  MessageToolbar,
} from "@/components/messaging/messages/message-interactions";
import { DeletedMessageBody } from "@/components/messaging/messages/message-placeholders";
import { MessageRowLayout } from "@/components/messaging/messages/message-row-layout";
import { useHasPersonCard } from "@/components/messaging/people/person-card-context";
import { PersonCardTarget } from "@/components/messaging/people/person-card-slot";
import { Timestamp } from "@/components/time/timestamp";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials } from "@/lib/people/initials";
import { cn } from "cn";

export function MessageItem({
  message,
  grouped = false,
  highlighted = false,
  onReact,
  pending = false,
  onThread,
  unreadReplies,
  body,
  editor,
  actions,
  avatarBadge,
  status,
  renderReaction,
  children,
}: {
  /** Replaces the body while the message is edited in place. */
  editor?: ReactNode;
  message: Message;
  /** Continues the previous message from the same author: no avatar or name. */
  grouped?: boolean;
  /** The message a link points to. */
  highlighted?: boolean;
  /** A small status mark on the avatar, such as an agent run's state. Agent replies never group. */
  avatarBadge?: ReactNode;
  /** A status after the time, such as the state of the work behind an agent's reply. */
  status?: ReactNode;
  onReact?: (emoji: string) => void;
  pending?: boolean;
  onThread?: (id: string) => void;
  /** Replies in this message's thread that the viewer has not read. */
  unreadReplies?: number;
  body?: ReactNode;
  actions?: ReactNode;
  renderReaction?: (reaction: Message["reactions"][number]) => ReactNode;
  children?: ReactNode;
}) {
  const name = messageAuthorName(message);
  return (
    <MessageRowLayout
      label={grouped ? `${name}, continued` : undefined}
      grouped={grouped}
      highlighted={highlighted || !!editor}
      avatar={
        !grouped && (
          <span className="relative mt-0.5 h-fit shrink-0">
            <Avatar
              aria-hidden="true"
              variant={message.authorType === "agent" ? "agent" : "default"}
              className="size-9"
            >
              {message.authorImage && <AvatarImage src={message.authorImage} alt="" />}
              <AvatarFallback>{initials(message.authorName)}</AvatarFallback>
            </Avatar>
            {avatarBadge}
          </span>
        )
      }
      byline={!grouped && <MessageByline message={message} name={name} status={status} />}
      toolbar={
        !editor && (
          <MessageToolbar
            message={message}
            onReact={onReact}
            pending={pending}
            onThread={onThread}
            actions={actions}
          />
        )
      }
    >
      {message.deletedAt ? (
        <DeletedMessageBody />
      ) : (
        (editor ?? body ?? <MessageMarkdown body={message.body} />)
      )}
      {!message.deletedAt && !editor && message.editedAt && (
        <span className="text-xs text-muted-foreground">Edited</span>
      )}
      <MessageReactions
        message={message}
        onReact={onReact}
        pending={pending}
        onThread={onThread}
        unreadReplies={unreadReplies}
        renderReaction={renderReaction}
      />
      {children}
    </MessageRowLayout>
  );
}

function MessageByline({
  message,
  name,
  status,
}: {
  message: Message;
  name: string;
  status?: ReactNode;
}) {
  const hasPersonCard = useHasPersonCard();
  return (
    <>
      <PersonCardTarget actorId={message.authorActorEntityId} name={name}>
        <span
          className={cn(
            // oxlint-disable-next-line design/no-decorative-class -- The message author.
            "text-sm font-semibold wrap-anywhere",
            hasPersonCard && "rounded-sm underline-offset-2 hover:underline",
          )}
        >
          {name}
        </span>
      </PersonCardTarget>
      <Timestamp
        value={message.createdAt}
        format="time"
        className="shrink-0 text-xs text-muted-foreground"
      />
      {message.authorType === "agent" && <Tag>Agent</Tag>}
      {message.authorExternal && <Tag>External</Tag>}
      {status && <span className="flex min-w-0 self-center">{status}</span>}
    </>
  );
}
