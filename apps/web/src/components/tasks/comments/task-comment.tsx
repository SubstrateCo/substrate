import type { TaskComment as Comment } from "../types";
import { Tag } from "@/components/feedback/tag";
import { Timestamp } from "@/components/time/timestamp";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials } from "@/lib/people/initials";
import { Bot } from "lucide-react";

export function TaskComment({ comment }: { comment: Comment }) {
  return (
    <li className="flex min-w-0 gap-2.5">
      <Avatar aria-hidden="true" size="sm" variant="user" className="mt-0.5">
        <AvatarFallback>
          {comment.authorType === "agent" ? (
            <Bot className="size-3.5" />
          ) : (
            initials(comment.authorName)
          )}
        </AvatarFallback>
      </Avatar>
      <article className="min-w-0 flex-1">
        <header className="flex min-w-0 items-center gap-1.5 text-sm">
          <strong className="truncate font-medium">{comment.authorName}</strong>
          {comment.authorType === "agent" && <Tag className="py-0">Agent</Tag>}
          <Timestamp value={comment.createdAt} className="text-xs text-muted-foreground" />
        </header>
        <p className="mt-0.5 text-sm/relaxed wrap-break-word whitespace-pre-wrap">{comment.body}</p>
      </article>
    </li>
  );
}
