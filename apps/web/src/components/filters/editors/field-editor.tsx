import type { FilterClause, FilterField } from "../types";
import { DateEditor } from "./date-editor";
import { NumberEditor } from "./number-editor";
import { OptionEditor } from "./option-editor";

export function FieldEditor({
  field,
  clause,
  onChange,
  onDone,
}: {
  field: FilterField;
  clause: FilterClause | undefined;
  onChange: (clause: FilterClause | undefined) => void;
  onDone: () => void;
}) {
  if (field.kind === "number")
    return <NumberEditor field={field} clause={clause} onChange={onChange} onDone={onDone} />;
  if (field.kind === "date")
    return <DateEditor field={field} clause={clause} onChange={onChange} onDone={onDone} />;
  return <OptionEditor field={field} clause={clause} onChange={onChange} onDone={onDone} />;
}
