import type { Mailbox } from "@substrate/contracts/mail";

import { useState } from "react";

import { LabelMenu, type LabelActions } from "./label-menu";
import { labelName } from "./mail-colors";
import { LabelTag } from "./message-labels";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Field, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { ChevronRight } from "lucide-react";

export function LabelSettings({ box, ...actions }: { box: Mailbox } & LabelActions) {
  const [pending, setPending] = useState(false),
    [failed, setFailed] = useState(false);
  async function toggle(visible: boolean) {
    setPending(true);
    setFailed(false);
    try {
      await actions.onLabelVisibility(box.id, { area: "mailbox", visible });
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }
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
              disabled={pending}
              onCheckedChange={(v) => void toggle(v)}
            />
          </Field>
          {box.labels.map((label) => (
            <div key={label.id} className="flex min-w-0 items-center gap-2">
              <span className="min-w-0 flex-1 truncate" title={labelName(label)}>
                <LabelTag label={label} />
              </span>
              {label.filterMode === "hide" && (
                <span className="text-xs text-muted-foreground">Hidden filter</span>
              )}
              {label.filterMode === "unread" && (
                <span className="text-xs text-muted-foreground">If unread</span>
              )}
              <LabelMenu mailboxId={box.id} label={label} {...actions} />
            </div>
          ))}
          {failed && (
            <p role="alert" className="text-xs text-destructive">
              Couldn’t save the label settings. Try again.
            </p>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
