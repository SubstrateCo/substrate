import type { MailColor, Mailbox } from "@substrate/contracts/mail";

import { ink } from "../mail-colors";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronRight, Mail } from "lucide-react";

export function UnreadMailboxes({
  boxes,
  colors,
  counts,
  total,
  selected,
  onUnread,
  onPick,
}: {
  boxes: readonly Mailbox[];
  colors: ReadonlyMap<string, MailColor>;
  counts?: Record<string, number>;
  total?: number;
  selected: boolean;
  onUnread: () => void;
  onPick: (box: Mailbox) => void;
}) {
  return (
    <Collapsible>
      <div className="flex items-center gap-0.5">
        <Button
          variant="sidebar"
          className="min-w-0 flex-1 justify-start"
          aria-current={selected ? "page" : undefined}
          onClick={onUnread}
        >
          <Mail aria-hidden />
          Unread {!!total && <span className="ml-auto text-xs tabular-nums">{total}</span>}
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Unread by mailbox"
                className="group"
              >
                <ChevronRight
                  aria-hidden
                  className="transition-transform group-aria-expanded:rotate-90"
                />
              </Button>
            </CollapsibleTrigger>
          </TooltipTrigger>
          <TooltipContent>Unread by mailbox</TooltipContent>
        </Tooltip>
      </div>
      <CollapsibleContent>
        <div role="group" aria-label="Unread by mailbox" className="ml-4 border-l pl-1">
          {boxes.map((box) => (
            <Button
              key={box.id}
              variant="sidebar"
              size="sm"
              className="w-full justify-start"
              onClick={() => onPick(box)}
              title={box.address}
            >
              <span className={`min-w-0 truncate text-xs ${ink[colors.get(box.id)!]}`}>
                {box.address}
              </span>
              <span className="ml-auto shrink-0 text-xs tabular-nums">
                {counts ? (counts[box.id] ?? 0) : "…"}
              </span>
            </Button>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
