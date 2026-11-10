import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import type { LucideIcon } from "lucide-react";

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
  icon?: LucideIcon;
};

/**
 * One choice from two to four short options, such as Light, Dark, and System. Options read as
 * radio buttons. Use line Tabs for page sections and a Select for longer lists.
 */
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
  /** Show only icons. Each option keeps its label as its accessible name and tooltip. */
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
      {options.map(({ value: optionValue, label: optionLabel, icon: Icon }) => {
        const item = (
          <ToggleGroupItem
            key={optionValue}
            value={optionValue}
            aria-label={iconOnly ? optionLabel : undefined}
          >
            {Icon && <Icon aria-hidden />}
            {!iconOnly && optionLabel}
          </ToggleGroupItem>
        );
        if (!iconOnly) return item;
        // The tooltip trigger is a wrapper, not the item: a trigger that is the item overwrites
        // the item's `data-state`, and the chosen option would lose its raised style.
        return (
          <Tooltip key={optionValue}>
            <TooltipTrigger asChild>
              <span className="inline-flex">{item}</span>
            </TooltipTrigger>
            <TooltipContent>{optionLabel}</TooltipContent>
          </Tooltip>
        );
      })}
    </ToggleGroup>
  );
}
