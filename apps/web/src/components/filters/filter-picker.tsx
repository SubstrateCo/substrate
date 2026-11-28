import { useState } from "react";

import { FieldEditor } from "./editors/field-editor";
import { matchingFilterOptions } from "./filter-search";
import { fieldOperators } from "./filter-value";
import type { FilterClause, FilterField, FilterValue } from "./types";
import { ContentNotice } from "@/components/feedback/content-notice";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ArrowLeft, ArrowRight, Check, ListFilter } from "lucide-react";

export function FilterPicker<Id extends string>({
  fields,
  value,
  onClauseChange,
}: {
  fields: readonly FilterField<Id>[];
  value: FilterValue<Id>;
  onClauseChange: (id: Id, clause: FilterClause | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const [fieldId, setFieldId] = useState<Id | null>(null);
  const [query, setQuery] = useState("");
  const field = fields.find((candidate) => candidate.id === fieldId);
  const search = query.trim().toLocaleLowerCase();
  const matches = fields.filter(
    (candidate) => !search || candidate.label.toLocaleLowerCase().includes(search),
  );
  const optionMatches = matchingFilterOptions(fields, query);
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setFieldId(null);
          setQuery("");
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <ListFilter aria-hidden="true" />
          Filter
        </Button>
      </PopoverTrigger>
      <PopoverContent
        variant="reference"
        align="start"
        collisionPadding={8}
        className={
          field?.kind === "date"
            ? "max-h-(--radix-popover-content-available-height) w-auto overflow-y-auto"
            : "max-h-(--radix-popover-content-available-height) w-64"
        }
      >
        {field ? (
          <>
            <div className="flex items-center gap-2 border-b p-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Back to filters"
                onClick={() => setFieldId(null)}
              >
                <ArrowLeft aria-hidden="true" />
                Filters
              </Button>
              <span className="min-w-0 truncate text-xs text-muted-foreground">{field.label}</span>
            </div>
            <FieldEditor
              key={field.id}
              field={field}
              clause={value[field.id]}
              onChange={(clause) => onClauseChange(field.id, clause)}
              onDone={() => setOpen(false)}
            />
          </>
        ) : (
          <Command shouldFilter={false} loop>
            <div className="border-b p-2">
              <CommandInput
                aria-label="Search filters"
                placeholder="Filter by"
                value={query}
                onValueChange={setQuery}
              />
            </div>
            <CommandList aria-label="Filter by">
              {matches.length > 0 && (
                <CommandGroup heading="Filter by">
                  {matches.map((candidate) => {
                    const Icon = candidate.icon;
                    return (
                      <CommandItem
                        key={candidate.id}
                        value={candidate.id}
                        onSelect={() => setFieldId(candidate.id)}
                      >
                        <Icon aria-hidden="true" className="text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate">{candidate.label}</span>
                        {value[candidate.id]?.values.length ? (
                          <Check aria-hidden="true" className="text-muted-foreground" />
                        ) : (
                          <ArrowRight aria-hidden="true" className="text-muted-foreground" />
                        )}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              )}
              {optionMatches.length > 0 && (
                <CommandGroup heading="Matching values">
                  {optionMatches.map(({ field: candidate, option }) => (
                    <CommandItem
                      key={`${candidate.id}:${option.value}`}
                      value={`${candidate.id}:${option.value}`}
                      onSelect={() => {
                        const current = value[candidate.id];
                        const values = candidate.multiple
                          ? [...new Set([...(current?.values ?? []), option.value])]
                          : [option.value];
                        onClauseChange(candidate.id, {
                          operator: current?.operator ?? fieldOperators(candidate)[0],
                          values,
                        });
                        setOpen(false);
                      }}
                    >
                      <candidate.icon aria-hidden="true" className="text-muted-foreground" />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate">{option.label}</span>
                        <span className="text-xs text-muted-foreground">{candidate.label}</span>
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {!matches.length && !optionMatches.length && (
                <div className="px-3 py-2">
                  <ContentNotice variant="inline" title="No matches." />
                </div>
              )}
            </CommandList>
          </Command>
        )}
      </PopoverContent>
    </Popover>
  );
}
