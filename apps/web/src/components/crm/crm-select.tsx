import { useId } from "react";

import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

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
  const id = useId();
  return (
    <CrmSelectField label={label} id={id}>
      <Select
        name={name}
        value={value || "none"}
        onValueChange={(next) => onValueChange?.(next === "none" ? "" : next)}
        disabled={disabled}
      >
        <SelectTrigger id={id} className="w-full">
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
    </CrmSelectField>
  );
}

export function CrmSelectLoading({ label }: { label: string }) {
  return (
    <CrmSelectField label={label} hidden>
      <Skeleton className="h-9 w-full" />
    </CrmSelectField>
  );
}

function CrmSelectField({
  label,
  id,
  hidden,
  children,
}: {
  label: string;
  id?: string;
  hidden?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Field aria-hidden={hidden}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {children}
    </Field>
  );
}
