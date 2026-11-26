import type { Attachment } from "@substrate/contracts/files/attachments";

import type { ReactNode } from "react";

import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { cn } from "cn";
import { File, Download } from "lucide-react";

export function AttachmentList({
  attachments,
  href,
  renderActions,
  compact = false,
}: {
  attachments: Attachment[];
  href: (attachment: Attachment) => string;
  renderActions?: (attachment: Attachment) => ReactNode;
  compact?: boolean;
}) {
  if (!attachments.length) return null;
  return (
    <ul
      aria-label="Attachments"
      className={cn("my-2 grid", compact ? "max-w-xs gap-1" : "max-w-md gap-2")}
    >
      {attachments.map((attachment) => (
        <Item
          key={attachment.id}
          asChild
          variant="outline"
          size={compact ? "xs" : "default"}
          className="group/row min-w-0 flex-nowrap"
        >
          <li>
            <a
              href={href(attachment)}
              download={attachment.filename}
              aria-label={`Download ${attachment.filename}`}
              className="flex min-w-0 flex-1 items-center gap-2 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <ItemMedia variant="icon">
                <File aria-hidden="true" className="text-muted-foreground" />
              </ItemMedia>
              <ItemContent className="min-w-0">
                <ItemTitle className="max-w-full">
                  <span className="truncate">{attachment.filename}</span>
                </ItemTitle>
                <ItemDescription>
                  {attachment.size < 1024
                    ? `${attachment.size} B`
                    : `${Math.ceil(attachment.size / 1024)} KiB`}{" "}
                  · Unscanned file
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <Download aria-hidden="true" className="size-4 text-muted-foreground" />
              </ItemActions>
            </a>
            {renderActions && <ItemActions>{renderActions(attachment)}</ItemActions>}
          </li>
        </Item>
      ))}
    </ul>
  );
}
