import { useQuery } from "@tanstack/react-query";

import { useState } from "react";

import { recordQueries, useCrmWrite } from "@/features/records/queries";
import { TextField } from "@/features/records/ui/fields";
import { FormSheet } from "@/features/records/ui/sheet";
import { ErrorState, LoadingRows } from "@/features/records/ui/states";
import type { QueryScope } from "@/queries/keys";

export function CrmSettingsSheet({
  scope,
  canEdit,
  onClose,
}: {
  scope: QueryScope;
  canEdit: boolean;
  onClose: () => void;
}) {
  const query = useQuery(recordQueries.crmSettings(scope));
  if (!query.data)
    return (
      <FormSheet
        title="CRM settings"
        dirty={false}
        pending={false}
        canSave={false}
        onSave={() => undefined}
        onClose={onClose}
      >
        {query.error ? (
          <ErrorState
            compact
            error={query.error}
            noun="CRM settings"
            onRetry={() => void query.refetch()}
          />
        ) : (
          <LoadingRows label="Loading CRM settings" />
        )}
      </FormSheet>
    );
  return (
    <CurrencyForm
      scope={scope}
      initial={query.data.defaultCurrency ?? ""}
      canEdit={canEdit}
      onClose={onClose}
    />
  );
}

function CurrencyForm({
  scope,
  initial,
  canEdit,
  onClose,
}: {
  scope: QueryScope;
  initial: string;
  canEdit: boolean;
  onClose: () => void;
}) {
  const [currency, setCurrency] = useState(initial);
  const write = useCrmWrite(scope);
  const value = currency.trim().toUpperCase();
  const valid = value === "" || /^[A-Z]{3}$/.test(value);
  return (
    <FormSheet
      title="CRM settings"
      description="Workspace admins can set the default currency for new deals. Existing deals keep their currency."
      dirty={value !== initial}
      pending={write.isPending}
      canSave={canEdit && valid && value !== initial}
      error={write.error}
      onClose={onClose}
      onSave={() =>
        write.mutate(
          { action: "updateSettings", defaultCurrency: value || null },
          { onSuccess: onClose },
        )
      }
    >
      <TextField
        label="Default currency"
        value={currency}
        onChange={(next) => setCurrency(next.toUpperCase())}
        maxLength={3}
        autoCapitalize="characters"
        placeholder="USD"
        editable={canEdit}
        description={
          canEdit
            ? "Leave empty for no default."
            : "Only workspace owners and admins can change CRM settings."
        }
        error={valid ? null : "Use a three-letter currency code, like USD."}
      />
    </FormSheet>
  );
}
