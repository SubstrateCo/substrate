import { FilterPicker } from "./filter-picker";
import { FilterPill } from "./filter-pill";
import { canAddFilter, clearFilterValue, hasClearableFilters, withClause } from "./filter-value";
import type { FilterClause, FilterField, FilterValue } from "./types";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

export function FilterBar<Id extends string>({
  fields,
  value,
  onValueChange,
  onClear,
  clearable = true,
  clearLabel = "Clear filters",
  "aria-label": label = "Filters",
}: {
  fields: readonly FilterField<Id>[];
  value: FilterValue<Id>;
  onValueChange: (value: FilterValue<Id>) => void;
  onClear?: () => void;
  clearable?: boolean;
  clearLabel?: string;
  "aria-label"?: string;
}) {
  const setClause = (id: Id, clause: FilterClause | undefined) =>
    onValueChange(withClause(value, id, clause));
  return (
    <div role="group" aria-label={label} className="flex min-w-0 items-start gap-2">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        {canAddFilter(fields, value) && (
          <FilterPicker fields={fields} value={value} onClauseChange={setClause} />
        )}
        {fields.map((field) => {
          const clause = value[field.id];
          if (!clause?.values.length) return null;
          return (
            <FilterPill
              key={field.id}
              field={field}
              clause={clause}
              onChange={(next) => setClause(field.id, next)}
            />
          );
        })}
      </div>
      {clearable && hasClearableFilters(fields, value) && (
        <Button
          type="button"
          variant="disclosure"
          size="sm"
          aria-label={clearLabel}
          onClick={() => {
            onValueChange(clearFilterValue(fields, value));
            onClear?.();
          }}
        >
          <X data-icon="inline-start" aria-hidden="true" />
          {clearLabel}
        </Button>
      )}
    </div>
  );
}
