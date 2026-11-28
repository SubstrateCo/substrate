import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Pressable } from "@/components/ui/pressable";
import { Separator } from "@/components/ui/separator";
import { ArrowUpDown } from "lucide-react";

export type SortOption<Value extends string> = { value: Value; label: string };

export function SortControl<Value extends string>({
  options,
  value,
  onValueChange,
  label = "Sort",
}: {
  options: readonly SortOption<Value>[];
  value: Value;
  onValueChange: (value: Value) => void;
  label?: string;
}) {
  const current = options.find((option) => option.value === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Pressable
          aria-label={`${label}: ${current?.label ?? "Unknown"}`}
          className="flex h-7 max-w-full shrink-0 items-stretch overflow-hidden rounded-md border border-control-border bg-card text-xs hover:bg-row-hover aria-expanded:bg-row-hover"
        >
          <span className="flex items-center gap-1 px-2 text-muted-foreground">
            <ArrowUpDown aria-hidden="true" className="size-3.5" />
            {label}
          </span>
          <Separator orientation="vertical" asChild>
            <span />
          </Separator>
          <span className="flex items-center px-2 font-medium">{current?.label ?? "Unknown"}</span>
        </Pressable>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" collisionPadding={8}>
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next) => {
            const chosen = options.find((option) => option.value === next);
            if (chosen) onValueChange(chosen.value);
          }}
        >
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
