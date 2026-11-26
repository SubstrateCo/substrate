import { filterLabels, type Mailbox, type MailColor } from "@substrate/contracts/mail";
import type { MailLabelFilter } from "@substrate/contracts/mail/ipc";

import { LabelMenu } from "./label-menu";
import { defaultLabelColor, ink, labelName } from "./mail-colors";
import { actionRow, RowActions } from "@/components/layout/row-actions";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronRight, Tag } from "lucide-react";

export type LabelNavigation = {
  filter?: MailLabelFilter;
  onLabel: (value: MailLabelFilter) => void;
};
export function SidebarLabels({
  boxes,
  grouped,
  colors,
  filter,
  onLabel,
}: LabelNavigation & {
  boxes: readonly Mailbox[];
  grouped: boolean;
  colors: ReadonlyMap<string, MailColor>;
}) {
  const groups = boxes
    .map((box) => ({ box, labels: filterLabels(box) }))
    .filter((g) => g.labels.length);
  if (!groups.length) return null;
  return (
    <div className="border-t pt-2">
      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button variant="disclosure" size="xs" className="group">
            <ChevronRight aria-hidden className="group-aria-expanded:rotate-90" />
            Labels
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <nav aria-label="Mail labels" className="space-y-2">
            {groups.map(({ box, labels }) => (
              <div key={box.id} role="group" aria-label={`Labels for ${box.address}`}>
                {grouped && (
                  <p
                    className={`truncate px-2 pt-2 pb-1 text-xs ${ink[colors.get(box.id)!]}`}
                    title={box.address}
                  >
                    {box.address}
                  </p>
                )}
                {labels.map((label) => (
                  <div key={label.id} className={`${actionRow} flex min-w-0 items-center`}>
                    <Button
                      variant="sidebar"
                      size="xs"
                      className="min-w-0 flex-1 justify-start"
                      title={labelName(label)}
                      aria-current={
                        filter?.mailboxId === box.id && filter.id === label.id ? "page" : undefined
                      }
                      onClick={() => onLabel({ mailboxId: box.id, id: label.id })}
                    >
                      <Tag
                        aria-hidden
                        className={`fill-current ${ink[label.color ?? defaultLabelColor(label)]}`}
                      />
                      <span className="truncate text-xs">{labelName(label)}</span>
                    </Button>
                    <RowActions label={`Actions for ${labelName(label)}`}>
                      <LabelMenu mailboxId={box.id} label={label} />
                    </RowActions>
                  </div>
                ))}
              </div>
            ))}
          </nav>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
