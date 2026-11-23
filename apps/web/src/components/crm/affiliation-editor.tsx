import { useQuery } from "@tanstack/react-query";

import { useState } from "react";

import { CustomerPicker } from "./customer-picker";
import { formText } from "./form-text";
import { FormDialog } from "@/components/feedback/form-dialog";
import { NativeField } from "@/components/forms/native-form";
import { useCrmMutation } from "@/queries/crm/mutations";
import { accountsOptions } from "@/queries/crm/options";

export function AffiliationEditor({
  organizationId,
  contactEntityId,
  onClose,
}: {
  organizationId: string;
  contactEntityId: string;
  onClose: () => void;
}) {
  const accounts = useQuery(accountsOptions(organizationId));
  const mutation = useCrmMutation(organizationId);
  const [accountId, setAccountId] = useState("");
  return (
    <FormDialog
      title="Link account"
      description="Both records must be editable. Linking does not change access or move interaction history."
      saveLabel="Link account"
      nativeValidation
      disabled={!accountId}
      pending={mutation.isPending}
      error={accounts.error ?? mutation.error}
      errorDescription="Couldn’t link this account. Check that you can edit both records."
      onClose={onClose}
      onSubmit={(form) => {
        if (accountId)
          mutation.mutate(
            {
              action: "setAffiliation",
              organizationId,
              contactEntityId,
              accountEntityId: accountId,
              title: formText(form, "title"),
              isPrimary: false,
            },
            { onSuccess: onClose },
          );
      }}
    >
      <CustomerPicker
        organizationId={organizationId}
        kind="accounts"
        label="Account"
        value={accountId}
        onChange={setAccountId}
      />
      <NativeField id="affiliation-title" name="title" label="Role or title" maxLength={300} />
    </FormDialog>
  );
}
