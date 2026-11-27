import type { ReactNode } from "react";

import { cn } from "cn";

/**
 * Who wrote the row: the avatar and byline, or a continuation of the previous message from the
 * same author, which shows neither and is named by `continued` for screen readers.
 */
export type MessageRowAuthor = { avatar: ReactNode; byline: ReactNode } | { continued: string };

export function MessageRowLayout({
  author,
  children,
  toolbar,
  highlighted = false,
}: {
  author: MessageRowAuthor;
  children: ReactNode;
  toolbar?: ReactNode;
  highlighted?: boolean;
}) {
  const continued = "continued" in author;
  return (
    <article
      aria-label={continued ? author.continued : undefined}
      className={cn(
        // A child marked `data-nested-row`, such as an agent's pending reply, hovers as its own row.
        "group/message relative flex w-full gap-3 px-4 not-has-[[data-nested-row]:hover]:hover:bg-row-hover has-data-[state=open]:bg-row-hover",
        continued ? "py-0.5" : "pt-2 pb-0.5",
        highlighted &&
          "bg-row-selected before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-primary hover:bg-row-selected",
      )}
    >
      <div data-slot="message-gutter" className="flex w-9 shrink-0 justify-end">
        {!continued && author.avatar}
      </div>
      <div className="min-w-0 flex-1">
        {!continued && (
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">{author.byline}</div>
        )}
        {children}
        {toolbar}
      </div>
    </article>
  );
}
