import { useState } from "react";

import { fieldOperators } from "../filter-value";
import type { DateFilterField, FilterClause } from "../types";
import { Calendar } from "@/components/ui/calendar";
import { formatDateOnly, parseDateOnly } from "@/lib/format/date";

/** A calendar for one date-only day. Choosing a day applies it and calls `onDone`. */
export function DateEditor({
  field,
  clause,
  onChange,
  onDone,
}: {
  field: DateFilterField;
  clause: FilterClause | undefined;
  onChange: (clause: FilterClause | undefined) => void;
  onDone: () => void;
}) {
  const [today] = useState(() => new Date());
  const day = clause?.values[0];
  const selected = day ? parseDateOnly(day) : undefined;
  const operator = clause?.operator ?? fieldOperators(field)[0];
  return (
    <Calendar
      mode="single"
      autoFocus
      selected={selected}
      defaultMonth={selected ?? today}
      onSelect={(date) => {
        if (!date) return;
        onChange({ operator, values: [formatDateOnly(date)] });
        onDone();
      }}
    />
  );
}
