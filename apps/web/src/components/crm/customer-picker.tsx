import { useQuery } from "@tanstack/react-query";

import { useDeferredValue, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Field, FieldLabel } from "@/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { resourceState } from "@/lib/resource-state";
import { contactsOptions } from "@/queries/contacts/options";
import { accountsOptions } from "@/queries/crm/options";
import { Check, ChevronDown } from "lucide-react";

export function CustomerPicker({
  organizationId,
  kind,
  label,
  value,
  initialLabel,
  onChange,
}: {
  organizationId: string;
  kind: "accounts" | "contacts";
  label: string;
  value: string;
  initialLabel?: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const querySearch = useDeferredValue(search);
  const [selectedLabel, setSelectedLabel] = useState(initialLabel);
  const accounts = useQuery({
    ...accountsOptions(organizationId, querySearch),
    enabled: open && kind === "accounts",
  });
  const contacts = useQuery({
    ...contactsOptions(organizationId, querySearch),
    enabled: open && kind === "contacts",
  });
  const query = { accounts, contacts }[kind];
  const options = {
    accounts: (resourceState(accounts).data ?? []).map((row) => ({
      value: row.entityId,
      label: row.name,
    })),
    contacts: (resourceState(contacts).data ?? []).map(({ contact }) => ({
      value: contact.entityId,
      label: contact.displayName,
    })),
  }[kind];
  const selected = options.find((option) => option.value === value);
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            variant="field"
            role="combobox"
            aria-expanded={open}
            className="justify-between"
          >
            <span className="truncate">
              {value ? (selected?.label ?? selectedLabel ?? "Selected record") : "None"}
            </span>
            <ChevronDown aria-hidden className="text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent variant="menu" align="start" className="w-80">
          <Command shouldFilter={false}>
            <CommandInput
              aria-label={`Search ${kind}`}
              placeholder={`Search ${kind}…`}
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              <CommandEmpty>
                {query.error ? "Couldn’t load customer records." : "No matching customer records."}
              </CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value="none"
                  onSelect={() => {
                    onChange("");
                    setSelectedLabel(undefined);
                    setOpen(false);
                  }}
                >
                  None{!value && <Check aria-hidden />}
                </CommandItem>
                {!query.error &&
                  options.map((option) => (
                    <CommandItem
                      key={option.value}
                      value={option.value}
                      onSelect={() => {
                        onChange(option.value);
                        setSelectedLabel(option.label);
                        setOpen(false);
                      }}
                    >
                      <span className="flex-1 truncate">{option.label}</span>
                      {value === option.value && <Check aria-hidden />}
                    </CommandItem>
                  ))}
              </CommandGroup>
            </CommandList>
          </Command>
          {query.isFetching && (
            <p role="status" className="px-2 py-1 text-xs text-muted-foreground">
              Searching…
            </p>
          )}
          {options.length === 100 && (
            <p className="px-2 py-1 text-xs text-muted-foreground">
              First 100 matches. Refine your search.
            </p>
          )}
        </PopoverContent>
      </Popover>
    </Field>
  );
}
