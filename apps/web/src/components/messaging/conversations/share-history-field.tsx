import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Globe } from "lucide-react";

export function ShareHistoryField({
  id,
  invited,
  channel,
  checked,
  disabled,
  onCheckedChange,
}: {
  id: string;
  invited: number;
  channel: boolean;
  checked: boolean;
  disabled: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const people = invited === 1 ? "1 person isn’t" : `${invited} people aren’t`;
  return (
    <div className="grid gap-3 rounded-lg border bg-inset p-3">
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
