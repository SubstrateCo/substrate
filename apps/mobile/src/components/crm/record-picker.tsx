import { useInfiniteQuery } from "@tanstack/react-query";

import { useState } from "react";

import { recordQueries } from "@/features/records/queries";
import { SelectField } from "@/features/records/ui/fields";
import { useDebounced } from "@/features/records/ui/layout";
import type { QueryScope } from "@/queries/keys";

const none = "none";

export function RecordPickerField({
  scope,
  kind,
  label,
  value,
  initialLabel,
  onChange,
  allowNone = true,
  disabled,
  description,
}: {
  scope: QueryScope;
  kind: "accounts" | "contacts";
  label: string;
  value: string | null;
  initialLabel?: string;
  onChange: (value: string | null, label: string | null) => void;
  allowNone?: boolean;
  disabled?: boolean;
  description?: string;
}) {
  const [search, setSearch] = useState("");
  const term = useDebounced(search.trim());
  const [selectedLabel, setSelectedLabel] = useState(initialLabel);
  const accounts = useInfiniteQuery({
    ...recordQueries.accounts(scope, term),
    enabled: kind === "accounts",
  });
  const contacts = useInfiniteQuery({
    ...recordQueries.contacts(scope, term),
    enabled: kind === "contacts",
  });
  const options =
    kind === "accounts"
      ? (accounts.data?.pages.flat() ?? []).map((row) => ({ value: row.entityId, label: row.name }))
      : (contacts.data?.pages.flat() ?? []).map((row) => ({
          value: row.contact.entityId,
          label: row.contact.displayName,
        }));
  const choices = [
    ...(allowNone ? [{ value: none, label: "None" }] : []),
    ...(value && !options.some((option) => option.value === value)
      ? [{ value, label: selectedLabel ?? "Current selection" }]
      : []),
    ...options,
  ];
  const query = kind === "accounts" ? accounts : contacts;
  return (
    <SelectField
      label={label}
      value={value ?? (allowNone ? none : null)}
      choices={choices}
      placeholder={
        allowNone ? "None" : `Choose ${kind === "accounts" ? "an account" : "a contact"}`
      }
      disabled={disabled}
      description={description}
      searchable
      search={search}
      onSearch={setSearch}
      loading={query.isPending || query.isFetching}
      onChange={(next) => {
        if (next === none) {
          setSelectedLabel(undefined);
          onChange(null, null);
          return;
        }
        const option = choices.find((choice) => choice.value === next);
        setSelectedLabel(option?.label);
        onChange(next, option?.label ?? null);
      }}
    />
  );
}
