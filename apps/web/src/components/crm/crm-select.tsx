import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function CrmSelect({
  label,
  name,
  value,
  onValueChange,
  options,
  optional = false,
  disabled = false,
  emptyLabel = "None",
}: {
  label: string;
  name?: string;
  value: string;
  onValueChange?: (value: string) => void;
  options: { value: string; label: string }[];
  optional?: boolean;
  disabled?: boolean;
  emptyLabel?: string;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={`crm-${name ?? label}`}>{label}</FieldLabel>
      <Select
        name={name}
        value={value || "none"}
        onValueChange={(next) => onValueChange?.(next === "none" ? "" : next)}
        disabled={disabled}
      >
        <SelectTrigger id={`crm-${name ?? label}`} className="w-full">
          <SelectValue placeholder={`Choose ${label.toLowerCase()}`} />
        </SelectTrigger>
        <SelectContent>
          {optional && <SelectItem value="none">{emptyLabel}</SelectItem>}
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}
