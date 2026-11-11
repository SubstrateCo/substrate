import type { TaskComment as Comment } from "../types";
import { Tag } from "@/components/feedback/tag";
import { MessageMarkdown } from "@/components/messaging/markdown/message-markdown";
import { PersonAvatar } from "@/components/people/person-avatar";
import { Timestamp } from "@/components/time/timestamp";

export function TaskComment({ comment }: { comment: Comment }) {
  return (
    <li className="flex min-w-0 gap-2.5">
      <PersonAvatar
        name={comment.authorName}
        image={comment.authorImage}
        agent={comment.authorType === "agent"}
        className="mt-0.5"
      />
      <article className="min-w-0 flex-1">
        <header className="flex min-w-0 items-center gap-1.5 text-sm">
          <strong className="truncate font-medium">{comment.authorName}</strong>
          {comment.authorType === "agent" && <Tag className="py-0">Agent</Tag>}
          <Timestamp value={comment.createdAt} className="text-xs text-muted-foreground" />
        </header>
        {/* A reference the reader cannot open is not in the list and shows as unavailable. */}
        <MessageMarkdown body={comment.body} references={comment.references ?? []} />
      </article>
    </li>
  );
}
