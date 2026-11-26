import type { CrmExport } from "@substrate/contracts/crm/export";

import { useMutation } from "@tanstack/react-query";

import { useState } from "react";

import { exportRecords } from "@/features/records/export-records";
import { SelectField, SwitchField, TextField } from "@/features/records/ui/fields";
import { FormSheet } from "@/features/records/ui/sheet";
import type { QueryScope } from "@/queries/keys";

export function ExportRecords({
  scope,
  kind,
  archived,
  onClose,
}: {
  scope: QueryScope;
  kind: CrmExport["kind"];
  archived: boolean;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<CrmExport["archived"]>(archived ? "archived" : "active");
  const [format, setFormat] = useState<"csv" | "json">("csv");
  const [consent, setConsent] = useState(false);
  const write = useMutation({
    mutationFn: () =>
      exportRecords(scope, {
        organizationId: scope.organizationId,
        kind,
        archived: status,
        search,
        format,
      }),
    onSuccess: onClose,
  });
  return (
    <FormSheet
      title={`Export ${kind}`}
      description="Organization owners and admins can export readable records. The file contains private workspace data."
      saveLabel="Export"
      dirty={consent || !!search}
      pending={write.isPending}
      canSave={consent}
      error={write.error}
      onSave={() => write.mutate()}
      onClose={onClose}
    >
      <TextField label="Search filter" value={search} onChange={setSearch} maxLength={200} />
      <SelectField
        label="Records"
        value={status}
        onChange={setStatus}
        choices={[
          { value: "active", label: "Active" },
          { value: "archived", label: "Archived" },
          { value: "all", label: "All" },
        ]}
      />
      <SelectField
        label="Format"
        value={format}
        onChange={setFormat}
        choices={[
          { value: "csv", label: "CSV" },
          { value: "json", label: "JSON" },
        ]}
      />
      <SwitchField
        label="Save private workspace data"
        checked={consent}
        onChange={setConsent}
        description="I will keep this export in a safe location. Exporting does not change record permissions."
      />
    </FormSheet>
  );
}
