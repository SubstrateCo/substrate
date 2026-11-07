import { useId } from "react";

import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

export function TaskSelect<T extends string>({
  label,
  value,
  onChange,
  options,
  disabled = false,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: NoInfer<T>; label: string }[];
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="relative min-w-0 space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={value}
        onValueChange={(next) => {
          const option = options.find((candidate) => candidate.value === next);
          if (option) onChange(option.value);
        }}
        disabled={disabled}
      >
        <SelectTrigger id={id} className="w-full min-w-0">
          <SelectValue className="min-w-0" />
        </SelectTrigger>
        <SelectContent
          position="popper"
          align="start"
          className="w-(--radix-select-trigger-width) max-w-dvw"
        >
          {options.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              className="wrap-anywhere whitespace-normal"
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
