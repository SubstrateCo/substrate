import { Checkbox } from "../../ui/checkbox";
import { Field, FieldLabel } from "../../ui/field";

export function ShareHistoryField({
  id,
  checked,
  disabled,
  onCheckedChange,
}: {
  id: string;
  checked: boolean;
  disabled: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <Field orientation="horizontal">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        disabled={disabled}
      />
      <FieldLabel htmlFor={id}>
        For external invitations, I approve sharing the full conversation history.
      </FieldLabel>
    </Field>
  );
}
