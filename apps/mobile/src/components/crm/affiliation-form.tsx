import { useState } from "react";

import { RecordPickerField } from "./record-picker";
import { useCrmWrite } from "@/features/records/queries";
import { SwitchField, TextField } from "@/features/records/ui/fields";
import { FormSheet } from "@/features/records/ui/sheet";
import type { QueryScope } from "@/queries/keys";

export type Affiliation = {
  otherEntityId: string;
  name: string;
  title: string;
  isPrimary: boolean;
};

export function AffiliationForm({
  scope,
  mode,
  affiliation,
  onClose,
}: {
  scope: QueryScope;
  mode:
    | { fixed: "contact"; contactEntityId: string }
    | { fixed: "account"; accountEntityId: string };
  affiliation?: Affiliation;
  onClose: () => void;
}) {
  const write = useCrmWrite(scope);
  const [other, setOther] = useState<string | null>(affiliation?.otherEntityId ?? null);
  const [title, setTitle] = useState(affiliation?.title ?? "");
  const [isPrimary, setPrimary] = useState(affiliation?.isPrimary ?? false);
  const createTitle = mode.fixed === "contact" ? "Add to account" : "Add person";
  return (
    <FormSheet
      title={affiliation ? "Edit affiliation" : createTitle}
      description="Linking does not give anyone new access to either record."
      saveLabel={affiliation ? "Save" : "Add"}
      dirty={
        other !== (affiliation?.otherEntityId ?? null) ||
        title !== (affiliation?.title ?? "") ||
        isPrimary !== (affiliation?.isPrimary ?? false)
      }
      pending={write.isPending}
      canSave={!!other}
      error={write.error}
      onClose={onClose}
      onSave={() => {
        if (!other) return;
        write.mutate(
          {
            action: "setAffiliation",
            contactEntityId: mode.fixed === "contact" ? mode.contactEntityId : other,
            accountEntityId: mode.fixed === "account" ? mode.accountEntityId : other,
            title: title.trim(),
            isPrimary,
          },
          { onSuccess: onClose },
        );
      }}
    >
      <RecordPickerField
        scope={scope}
        kind={mode.fixed === "contact" ? "accounts" : "contacts"}
        label={mode.fixed === "contact" ? "Account" : "Contact"}
        value={other}
        initialLabel={affiliation?.name}
        disabled={!!affiliation}
        allowNone={false}
        onChange={(value) => setOther(value)}
      />
      <TextField
        label="Role"
        value={title}
        onChange={setTitle}
        maxLength={300}
        placeholder="Head of Sales…"
      />
      <SwitchField
        label="Primary account"
        description="A contact has at most one primary account."
        checked={isPrimary}
        onChange={setPrimary}
      />
    </FormSheet>
  );
}
