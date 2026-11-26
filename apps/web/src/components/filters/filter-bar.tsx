import { FilterPicker } from "./filter-picker";
import { FilterPill } from "./filter-pill";
import { canAddFilter, clearFilterValue, hasClearableFilters, withClause } from "./filter-value";
import type { FilterClause, FilterField, FilterValue } from "./types";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

/**
 * A "Filter" button, then one pill per active filter, then "Clear filters". Fully controlled:
 * the app owns `value`, applies it to its data, and keeps search, sort, and view separate.
 * Pills follow the order of `fields` and wrap onto new lines.
 */
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
  /** Called after "Clear filters" resets the optional fields, such as to reset a page. */
  onClear?: () => void;
  /** Show "Clear filters" while an optional field has a filter. Hide it when the page offers its own. */
  clearable?: boolean;
  clearLabel?: string;
  "aria-label"?: string;
}) {
  const setClause = (id: Id, clause: FilterClause | undefined) =>
    onValueChange(withClause(value, id, clause));
  return (
    <div role="group" aria-label={label} className="flex min-w-0 flex-wrap items-center gap-2">
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
      {clearable && hasClearableFilters(fields, value) && (
        <Button
          type="button"
          // Pill height, muted text, and an X: it reads as an action but stays quieter than the pills.
          variant="disclosure"
          size="sm"
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
