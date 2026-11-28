import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { LucideIcon } from "lucide-react";

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
  icon?: LucideIcon;
};

export function SegmentedControl<T extends string>({
  value,
  options,
  onValueChange,
  "aria-label": label,
  iconOnly = false,
  disabled,
}: {
  value: T;
  options: readonly SegmentedOption<T>[];
  onValueChange: (value: T) => void;
  "aria-label": string;
  iconOnly?: boolean;
  disabled?: boolean;
}) {
  return (
    <ToggleGroup
      type="single"
      variant="segmented"
      size="sm"
      spacing={0.5}
      aria-label={label}
      value={value}
      disabled={disabled}
      onValueChange={(next) => {
        // A single toggle group clears its value when the chosen option is pressed again.
        const option = options.find((candidate) => candidate.value === next);
        if (option) onValueChange(option.value);
      }}
    >
      {options.map(({ value: optionValue, label: optionLabel, icon: Icon }) => (
        <ToggleGroupItem
          key={optionValue}
          value={optionValue}
          aria-label={iconOnly ? optionLabel : undefined}
        >
          {Icon && <Icon aria-hidden />}
          {!iconOnly && optionLabel}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
