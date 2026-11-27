import type { LabelFilterMode, Mailbox } from "@substrate/contracts/mail";

import { useMutation } from "@tanstack/react-query";

import { useInboxWorkspace } from "./inbox-workspace-context";
import { LabelMenu } from "./label-menu";
import { labelName } from "./mail-colors";
import { LabelTag } from "./message-labels";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Field, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { ChevronRight } from "lucide-react";

/** How a label's filter shows in the sidebar, when it is not shown as usual. */
const filterModeNotes: Partial<Record<LabelFilterMode, string>> = {
  hide: "Hidden filter",
  unread: "If unread",
};

function FilterModeNote({ mode }: { mode?: LabelFilterMode }) {
  const note = mode && filterModeNotes[mode];
  if (!note) return null;
  return <span className="text-xs text-muted-foreground">{note}</span>;
}

export function LabelSettings({ box }: { box: Mailbox }) {
  const { onLabelVisibility } = useInboxWorkspace().labelActions;
  const toggle = useMutation({
    mutationFn: (visible: boolean) => onLabelVisibility(box.id, { area: "mailbox", visible }),
  });
  return (
    <Collapsible>
      <CollapsibleTrigger asChild>
        <Button variant="disclosure" size="xs" className="group">
          <ChevronRight aria-hidden className="group-aria-expanded:rotate-90" />
          Labels
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 grid gap-1">
          <Field orientation="horizontal" className="mb-2">
            <FieldLabel htmlFor={`filters-${box.id}`}>Show label filters</FieldLabel>
            <Switch
              size="sm"
              id={`filters-${box.id}`}
              checked={box.showLabelFilters !== false}
              disabled={toggle.isPending}
              onCheckedChange={(v) => toggle.mutate(v)}
            />
          </Field>
          {box.labels.map((label) => (
            <div key={label.id} className="flex min-w-0 items-center gap-2">
              <span className="min-w-0 flex-1 truncate" title={labelName(label)}>
                <LabelTag label={label} />
              </span>
              <FilterModeNote mode={label.filterMode} />
              <LabelMenu mailboxId={box.id} label={label} />
            </div>
          ))}
          {toggle.isError && (
            <p role="alert" className="text-xs text-destructive">
              Couldn’t save the label settings. Try again.
            </p>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
