import type { Mood } from "@substrate/agent-avatars/config";

import type { ReactNode } from "react";

import { MessageMarkdown } from "../markdown/message-markdown";
import type { Message } from "../types";
import { Tag } from "@/components/feedback/tag";
import { messageAuthor } from "@/components/messaging/messages/message-author";
import {
  MessageReactions,
  MessageToolbar,
} from "@/components/messaging/messages/message-interactions";
import { DeletedMessageBody } from "@/components/messaging/messages/message-placeholders";
import { MessageRowLayout } from "@/components/messaging/messages/message-row-layout";
import { useHasPersonCard } from "@/components/messaging/people/person-card-context";
import { PersonCardTarget } from "@/components/messaging/people/person-card-slot";
import { ActorAvatar, ActorKindTag } from "@/components/people/actor-avatar";
import { Timestamp } from "@/components/time/timestamp";
import type { ActorIdentity } from "@/lib/actors/identity";
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
  authorMood,
  avatarBadge,
  status,
  renderReaction,
  children,
}: {
  /** What an agent author is doing, such as working while its reply is still being worked on. */
  authorMood?: Mood;
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
  const author = messageAuthor(message);
  const content = messageContent(message, editor, body);
  const editing = content.kind === "editing";
  return (
    <MessageRowLayout
      author={
        grouped
          ? { continued: `${author.name}, continued` }
          : {
              avatar: (
                <span className="relative mt-0.5 h-fit shrink-0">
                  <ActorAvatar actor={author} size="lg" mood={authorMood} />
                  {avatarBadge}
                </span>
              ),
              byline: <MessageByline message={message} author={author} status={status} />,
            }
      }
      highlighted={highlighted || editing}
      toolbar={
        !editing && (
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
      <MessageBody content={content} />
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

/** What the body shows. A deleted message wins over an open editor. */
type MessageContent =
  | { kind: "deleted" }
  | { kind: "editing"; editor: ReactNode }
  | { kind: "posted"; body: ReactNode; edited: boolean };

function messageContent(message: Message, editor: ReactNode, body: ReactNode): MessageContent {
  if (message.deletedAt) return { kind: "deleted" };
  if (editor) return { kind: "editing", editor };
  return {
    kind: "posted",
    body: body ?? <MessageMarkdown body={message.body} />,
    edited: !!message.editedAt,
  };
}

function MessageBody({ content }: { content: MessageContent }) {
  if (content.kind === "deleted") return <DeletedMessageBody />;
  if (content.kind === "editing") return content.editor;
  return (
    <>
      {content.body}
      {content.edited && <span className="text-xs text-muted-foreground">Edited</span>}
    </>
  );
}

function MessageByline({
  message,
  author,
  status,
}: {
  message: Message;
  author: ActorIdentity;
  status?: ReactNode;
}) {
  const hasPersonCard = useHasPersonCard();
  const { name } = author;
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
      <ActorKindTag actor={author} />
      {message.authorExternal && <Tag>External</Tag>}
      {status && <span className="flex min-w-0 flex-1 self-center">{status}</span>}
    </>
  );
}
