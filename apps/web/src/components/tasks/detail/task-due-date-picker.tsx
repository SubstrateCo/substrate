import { useId, useState, type ReactNode } from "react";

import { dateOnly, parseTaskDate } from "./task-date";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatShortDate, parseDateOnly } from "@/lib/format/date";
import { Check } from "lucide-react";

// Days from today for each quick choice. Next week is the coming Monday.
const quick: { label: string; days: (today: Date) => number }[] = [
  { label: "Today", days: () => 0 },
  { label: "Tomorrow", days: () => 1 },
  { label: "Next week", days: (today) => (8 - today.getDay()) % 7 || 7 },
];

/** Quick choices and an exact date for a date-only value. `children` is the trigger button. */
export function TaskDueDatePicker({
  value,
  onChange,
  children,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const choose = (next: string | null) => {
    setOpen(false);
    if (next !== value) onChange(next);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent variant="menu" align="start" className="w-auto">
        <DueDateChoices value={value} onChoose={choose} />
      </PopoverContent>
    </Popover>
  );
}

/** The popover's content. It mounts on each open, so today and the typed date start fresh. */
function DueDateChoices({
  value,
  onChoose: choose,
}: {
  value: string | null;
  onChoose: (value: string | null) => void;
}) {
  const id = useId();
  const [today] = useState(() => new Date());
  const [text, setText] = useState("");
  const [invalid, setInvalid] = useState(false);
  return (
    <>
      {quick.map((option) => {
        const date = new Date(today);
        date.setDate(date.getDate() + option.days(date));
        const selected = dateOnly(date) === value;
        return (
          <Button
            key={option.label}
            type="button"
            variant="property"
            size="sm"
            aria-current={selected || undefined}
            onClick={() => {
              choose(dateOnly(date));
            }}
          >
            {option.label}
            <span className="ml-auto text-xs text-muted-foreground">{formatShortDate(date)}</span>
            {selected && <Check aria-hidden="true" data-icon="inline-end" />}
          </Button>
        );
      })}
      <div className="mt-1 grid gap-1.5 border-t px-2 pt-2 pb-1">
        <Label variant="caption" htmlFor={id}>
          Type a date
        </Label>
        <Input
          id={id}
          placeholder="Tomorrow, Fri, or Nov 20"
          value={text}
          aria-invalid={invalid}
          aria-describedby={invalid ? `${id}-error` : undefined}
          onChange={(event) => {
            setText(event.target.value);
            setInvalid(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              const next = parseTaskDate(text, today);
              if (next) choose(next);
              else setInvalid(true);
            }
          }}
        />
        {invalid && (
          <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
            Enter a date, like Nov 20.
          </p>
        )}
      </div>
      <Calendar
        mode="single"
        selected={value ? parseDateOnly(value) : undefined}
        defaultMonth={value ? parseDateOnly(value) : today}
        onSelect={(date) => {
          if (date) choose(dateOnly(date));
        }}
      />
      {value && (
        <Button type="button" variant="property" size="sm" onClick={() => choose(null)}>
          Clear date
        </Button>
      )}
    </>
  );
}
