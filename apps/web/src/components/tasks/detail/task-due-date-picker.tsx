import { useId, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatShortDate } from "@/lib/format/date";

// A calendar date as YYYY-MM-DD in local time, the format tasks store.
const dateOnly = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

// Days from today for each quick choice. Next week is the coming Monday.
const quick: { label: string; days: (today: Date) => number }[] = [
  { label: "Today", days: () => 0 },
  { label: "Tomorrow", days: () => 1 },
  { label: "Next week", days: (today) => (8 - today.getDay()) % 7 || 7 },
];

/** Quick choices and an exact date for a task's due date. `children` is the trigger button. */
export function TaskDueDatePicker({
  value,
  onChange,
  children,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  children: ReactNode;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [today, setToday] = useState(() => new Date());
  const choose = (next: string | null) => {
    setOpen(false);
    if (next !== value) onChange(next);
  };
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setToday(new Date());
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent variant="menu" align="start" className="w-56">
        {quick.map((option) => {
          const date = new Date(today);
          date.setDate(date.getDate() + option.days(date));
          return (
            <Button
              key={option.label}
              type="button"
              variant="property"
              size="sm"
              onClick={() => {
                choose(dateOnly(date));
              }}
            >
              {option.label}
              <span className="ml-auto text-xs text-muted-foreground">{formatShortDate(date)}</span>
            </Button>
          );
        })}
        <div className="mt-1 grid gap-1.5 border-t px-1 pt-2 pb-1">
          <label htmlFor={id} className="text-xs text-muted-foreground">
            Pick a date
          </label>
          <Input
            id={id}
            type="date"
            defaultValue={value ?? ""}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                choose(event.currentTarget.value || null);
              }
            }}
            onBlur={(event) => {
              const next = event.currentTarget.value || null;
              if (next && next !== value) onChange(next);
            }}
          />
        </div>
        {value && (
          <Button type="button" variant="property" size="sm" onClick={() => choose(null)}>
            Clear due date
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
