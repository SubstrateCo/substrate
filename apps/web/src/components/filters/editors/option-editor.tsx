import { useState, type ReactNode } from "react";

import { fieldOperators, isOptionChecked, orderOptions, toggleValue } from "../filter-value";
import type { FilterClause, FilterOption, OptionFilterField } from "../types";
import { ContentNotice } from "@/components/feedback/content-notice";
import { StaleNotice } from "@/components/feedback/stale-notice";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Spinner } from "@/components/ui/spinner";
import { Check } from "lucide-react";

export function OptionEditor({
  field,
  clause,
  onChange,
  onDone,
}: {
  field: OptionFilterField;
  clause: FilterClause | undefined;
  onChange: (clause: FilterClause | undefined) => void;
  onDone: () => void;
}) {
  const [query, setQuery] = useState("");
  const [chosenOnOpen] = useState(() => clause?.values ?? []);
  const values = clause?.values ?? [];
  const operator = clause?.operator ?? fieldOperators(field)[0];
  const search = query.trim().toLocaleLowerCase();
  const leading = field.checks === "unchosen" ? [] : chosenOnOpen;
  const options = orderOptions(field.options, leading).filter(
    (option) => !search || option.label.toLocaleLowerCase().includes(search),
  );
  const groups = [...new Set(options.map((option) => option.group))];
  const choose = (option: FilterOption) => {
    if (!field.multiple) {
      onChange({ operator, values: [option.value] });
      onDone();
      return;
    }
    const next = toggleValue(values, option.value);
    if (!next.length && field.required) return;
    onChange(next.length ? { operator, values: next } : undefined);
  };
  const notice = optionNotice(field, options.length);
  return (
    <Command shouldFilter={false} loop defaultValue={field.multiple ? undefined : chosenOnOpen[0]}>
      <div className="border-b p-2">
        <CommandInput
          autoFocus
          aria-label={`Search ${field.label.toLocaleLowerCase()}`}
          placeholder={field.label}
          value={query}
          onValueChange={setQuery}
        />
      </div>
      <CommandList aria-label={field.label} aria-multiselectable={field.multiple || undefined}>
        {notice && <div className="px-3 py-2">{notice}</div>}
        {groups.map((group) => (
          <CommandGroup key={group ?? ""} heading={group}>
            {options
              .filter((option) => option.group === group)
              .map((option) => {
                const checked = isOptionChecked(field, values, option.value);
                return (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    aria-checked={checked}
                    onSelect={() => choose(option)}
                  >
                    {field.multiple && (
                      <Checkbox
                        checked={checked}
                        tabIndex={-1}
                        aria-hidden="true"
                        className="pointer-events-none"
                      />
                    )}
                    {option.icon}
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    {!field.multiple && checked && <Check aria-hidden="true" />}
                  </CommandItem>
                );
              })}
          </CommandGroup>
        ))}
      </CommandList>
    </Command>
  );
}

function optionNotice(field: OptionFilterField, matches: number): ReactNode {
  if (field.options.length)
    return (
      (field.error && <StaleNotice title={field.error} />) ||
      (!matches && <ContentNotice variant="inline" title="No matches." />)
    );
  if (field.error) return <ContentNotice variant="inline" tone="error" title={field.error} />;
  if (field.loading)
    return (
      <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner aria-hidden="true" />
        Loading options
      </div>
    );
  return <ContentNotice variant="inline" title={field.emptyLabel ?? "Nothing to choose yet."} />;
}
