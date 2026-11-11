import type { Attachment } from "@substrate/contracts/files/attachments";

import type { ReactNode } from "react";

import { actionRow } from "@/components/layout/row-actions";
import { cn } from "cn";
import { File, Download } from "lucide-react";

export function AttachmentList({
  attachments,
  href,
  actions,
}: {
  attachments: Attachment[];
  href: (attachment: Attachment) => string;
  actions?: (attachment: Attachment) => ReactNode;
}) {
  if (!attachments.length) return null;
  return (
    <ul aria-label="Attachments" className="my-2 grid max-w-md gap-2">
      {attachments.map((attachment) => (
        <li
          key={attachment.id}
          className={cn(
            actionRow,
            "flex min-w-0 items-center rounded-md border bg-background pr-2 hover:bg-row-hover",
          )}
        >
          <a
            href={href(attachment)}
            download={attachment.filename}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            aria-label={`Download ${attachment.filename}`}
          >
            <File aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{attachment.filename}</span>
              <span className="block text-xs text-muted-foreground">
                {attachment.size < 1024
                  ? `${attachment.size} B`
                  : `${Math.ceil(attachment.size / 1024)} KiB`}{" "}
                · Unscanned file
              </span>
            </span>
            <Download aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          </a>
          {actions?.(attachment)}
        </li>
      ))}
    </ul>
  );
}
