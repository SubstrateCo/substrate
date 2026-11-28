import type { ReactNode } from "react";

import { enterMotion } from "@/components/motion/motion";
import { cn } from "cn";

export type MessageRowAuthor = { avatar: ReactNode; byline: ReactNode } | { continued: string };

export function MessageRowLayout({
  author,
  children,
  toolbar,
  highlighted = false,
  arriving = false,
}: {
  author: MessageRowAuthor;
  children: ReactNode;
  toolbar?: ReactNode;
  highlighted?: boolean;
  arriving?: boolean;
}) {
  const continued = "continued" in author;
  return (
    <article
      aria-label={continued ? author.continued : undefined}
      className={cn(
        "group/message relative flex w-full gap-3 px-4 hover:bg-row-hover has-data-[state=open]:bg-row-hover",
        continued ? "py-0.5" : "pt-2 pb-0.5",
        highlighted &&
          "bg-row-selected before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-primary hover:bg-row-selected",
        arriving && enterMotion.fade,
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
