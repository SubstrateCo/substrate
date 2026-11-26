import { useQuery } from "@tanstack/react-query";

import { useDeferredValue, useId, useState, type ReactNode } from "react";

import { accountOptions, contactOptions } from "./customer-options";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxSearch,
  ComboboxStatus,
  ComboboxTrigger,
  type ComboboxOption,
} from "@/components/ui/combobox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { resourceState } from "@/lib/resource-state";
import { contactsOptions } from "@/queries/contacts/options";
import { accountsOptions } from "@/queries/crm/options";

const none: ComboboxOption = { value: "", label: "None" };

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
  const [selected, setSelected] = useState<ComboboxOption>(
    value ? { value, label: initialLabel ?? "Selected record" } : none,
  );
  const accounts = useQuery({
    ...accountsOptions(organizationId, querySearch),
    enabled: open && kind === "accounts",
  });
  const contacts = useQuery({
    ...contactsOptions(organizationId, querySearch),
    enabled: open && kind === "contacts",
  });
  const query = { accounts, contacts }[kind];
  const options =
    kind === "accounts"
      ? accountOptions(resourceState(accounts).data)
      : contactOptions(resourceState(contacts).data);
  let status: ReactNode = null;
  if (query.isFetching) status = <Spinner className="size-3.5" aria-label={`Searching ${kind}`} />;
  else if (query.error) status = "Couldn’t load customer records.";
  else if (options.length === 100) status = "First 100 matches. Refine your search.";
  const current = value ? (options.find((option) => option.value === value) ?? selected) : none;
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Combobox
        items={query.error ? [none] : [none, ...options]}
        value={current}
        onValueChange={(next) => {
          const option = next ?? none;
          setSelected(option);
          onChange(option.value);
        }}
        isItemEqualToValue={(item, chosen) => item.value === chosen.value}
        filter={null}
        open={open}
        onOpenChange={setOpen}
        inputValue={search}
        onInputValueChange={setSearch}
      >
        <ComboboxTrigger render={<Button id={id} type="button" variant="field" role="combobox" />}>
          <span className="truncate">{current.label}</span>
        </ComboboxTrigger>
        <ComboboxContent>
          <ComboboxSearch aria-label={`Search ${kind}`} placeholder={`Search ${kind}`} />
          <ComboboxEmpty>No matching customer records.</ComboboxEmpty>
          <ComboboxList>
            {(option: ComboboxOption) => (
              <ComboboxItem key={option.value} value={option}>
                <span className="truncate">{option.label}</span>
              </ComboboxItem>
            )}
          </ComboboxList>
          <ComboboxStatus>{status}</ComboboxStatus>
        </ComboboxContent>
      </Combobox>
    </Field>
  );
}
