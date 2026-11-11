import { Timestamp } from "@/components/time/timestamp";
import { MessageSquareText } from "lucide-react";

export type CommentMention = {
  commentId: string;
  href: string;
  taskTitle: string;
  authorName: string;
  createdAt: Date | string;
};

/**
 * Tasks whose comments reference this record. Only tasks the reader can open are listed, and the
 * section is absent when there are none, so it never hints at hidden work.
 */
export function TaskCommentMentions({ items }: { items: CommentMention[] }) {
  if (!items.length) return null;
  return (
    <section aria-label="Mentioned in comments" className="space-y-1">
      <h3 className="flex h-7 items-center gap-1.5 text-xs font-medium text-muted-foreground">
        Mentioned in comments
        <span className="font-normal tabular-nums">{items.length}</span>
      </h3>
      <ul className="-mx-2 grid gap-px">
        {items.map((item) => (
          <li key={item.commentId}>
            <a
              href={item.href}
              className="flex h-8 min-w-0 items-center gap-2 rounded-md px-2 text-sm outline-none hover:bg-row-hover focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <MessageSquareText
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground"
              />
              <span className="truncate">{item.taskTitle}</span>
              <span className="ml-auto flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                <span className="sr-only">, comment by </span>
                {item.authorName}
                <span aria-hidden="true">·</span>
                <Timestamp value={item.createdAt} />
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
