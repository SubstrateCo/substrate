import { Checkbox } from "../../ui/checkbox";
import { Field, FieldLabel } from "../../ui/field";
import { Globe } from "lucide-react";

/**
 * Explains what happens to people outside the workspace and asks whether they may read earlier
 * messages. Show it only when the recipients include someone to invite.
 */
export function ShareHistoryField({
  id,
  invited,
  channel,
  checked,
  disabled,
  onCheckedChange,
}: {
  id: string;
  /** How many recipients will get an invitation. */
  invited: number;
  /** Channels with outside people also need their organization's approval. */
  channel: boolean;
  checked: boolean;
  disabled: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const people = invited === 1 ? "1 person isn’t" : `${invited} people aren’t`;
  return (
    <div className="grid gap-3 rounded-lg border bg-muted/40 p-3">
      <p className="flex gap-2 text-sm">
        <Globe aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <span>
          {people} in this workspace. They get an email invitation and join after they accept
          {channel ? ". Their organization must also approve." : "."}
        </span>
      </p>
      <Field orientation="horizontal">
        <Checkbox
          id={id}
          checked={checked}
          onCheckedChange={(value) => onCheckedChange(value === true)}
          disabled={disabled}
        />
        <FieldLabel htmlFor={id}>Let invited people read the full conversation history</FieldLabel>
      </Field>
    </div>
  );
}
