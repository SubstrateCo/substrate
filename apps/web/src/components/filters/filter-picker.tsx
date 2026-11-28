import { useState } from "react";

import { FieldEditor } from "./editors/field-editor";
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
import { ListFilter } from "lucide-react";

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
          <FieldEditor
            key={field.id}
            field={field}
            clause={value[field.id]}
            onChange={(clause) => onClauseChange(field.id, clause)}
            onDone={() => setOpen(false)}
          />
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
              {matches.length ? (
                <CommandGroup>
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
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              ) : (
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
