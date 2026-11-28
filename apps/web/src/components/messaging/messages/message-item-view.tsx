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
  arriving = false,
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
  authorMood?: Mood;
  editor?: ReactNode;
  message: Message;
  grouped?: boolean;
  highlighted?: boolean;
  arriving?: boolean;
  avatarBadge?: ReactNode;
  status?: ReactNode;
  onReact?: (emoji: string) => void;
  pending?: boolean;
  onThread?: (id: string) => void;
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
      arriving={arriving}
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
