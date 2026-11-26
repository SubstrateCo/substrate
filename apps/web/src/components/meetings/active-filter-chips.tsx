import type { ActiveFilter } from "@/components/meetings/active-filters";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

export function ActiveFilterChips({ filters }: { filters: ActiveFilter[] }) {
  return (
    <div aria-label="Active filters" className="flex shrink-0 flex-wrap gap-1.5">
      {filters.map(({ label, clear }) => (
        <Button
          key={label}
          size="xs"
          variant="outline"
          className="max-w-full"
          aria-label={`Clear ${label} filter`}
          onClick={clear}
        >
          <span className="truncate">{label}</span>
          <X />
        </Button>
      ))}
    </div>
  );
}
