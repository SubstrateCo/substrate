import { useMemo, useState } from "react";

import { timeZones } from "./schedule";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatTimeZone } from "@/lib/format/date";
import { Check, ChevronsUpDown } from "lucide-react";

/** A searchable list of IANA time zones. */
export function TimeZonePicker({
  id,
  value,
  invalid,
  describedBy,
  disabled,
  onChange,
}: {
  id: string;
  value: string;
  invalid?: boolean;
  describedBy?: string;
  disabled?: boolean;
  onChange: (zone: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const zones = useMemo(
    () => timeZones(value).map((zone) => ({ zone, label: formatTimeZone(zone) })),
    [value],
  );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="field"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          disabled={disabled}
        >
          <span className="truncate">{value ? formatTimeZone(value) : "Choose a time zone"}</span>
          <ChevronsUpDown aria-hidden="true" className="size-3.5 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        variant="reference"
        align="start"
        className="w-(--radix-popover-trigger-width) min-w-72"
      >
        <Command defaultValue={value}>
          <CommandInput placeholder="Search time zones…" />
          <CommandList>
            <CommandEmpty>No time zones match.</CommandEmpty>
            {zones.map(({ zone, label }) => (
              <CommandItem
                key={zone}
                value={zone}
                keywords={[label]}
                onSelect={() => {
                  onChange(zone);
                  setOpen(false);
                }}
              >
                <Check
                  aria-hidden="true"
                  className={`size-3.5 ${zone === value ? "text-primary" : "invisible"}`}
                />
                <span className="truncate">{label}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
