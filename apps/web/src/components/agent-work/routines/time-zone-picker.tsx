import { timeZones } from "./schedule";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxSearch,
  ComboboxTrigger,
  type ComboboxOption,
} from "@/components/ui/combobox";
import { formatTimeZone } from "@/lib/format/date";

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
  const zones = timeZones(value).map((zone): ComboboxOption => ({
    value: zone,
    label: formatTimeZone(zone),
  }));
  const current = zones.find((zone) => zone.value === value) ?? null;
  return (
    <Combobox
      items={zones}
      value={current}
      onValueChange={(next) => {
        if (next) onChange(next.value);
      }}
      isItemEqualToValue={(item, chosen) => item.value === chosen.value}
      // Match the zone name too, so "Toronto" and "America/Toronto" both find it.
      filter={(zone, query) => {
        const text = query.trim().toLowerCase();
        return zone.label.toLowerCase().includes(text) || zone.value.toLowerCase().includes(text);
      }}
      disabled={disabled}
    >
      <ComboboxTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="field"
            role="combobox"
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
          />
        }
      >
        <span className="truncate">{current?.label ?? "Choose a time zone"}</span>
      </ComboboxTrigger>
      <ComboboxContent>
        <ComboboxSearch aria-label="Search time zones" placeholder="Search time zones" />
        <ComboboxEmpty>No time zones match.</ComboboxEmpty>
        <ComboboxList>
          {(zone: ComboboxOption) => (
            <ComboboxItem key={zone.value} value={zone}>
              <span className="truncate">{zone.label}</span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
