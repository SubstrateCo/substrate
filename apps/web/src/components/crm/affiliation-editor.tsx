import { useState } from "react";

import { CustomerPicker } from "./customer-picker";
import { formText } from "./form-text";
import { FormDialog } from "@/components/feedback/form-dialog";
import { NativeField } from "@/components/forms/native-form";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { useCrmMutation } from "@/queries/crm/mutations";

export function AffiliationEditor({
  contactEntityId,
  onClose,
}: {
  contactEntityId: string;
  onClose: () => void;
}) {
  const { organizationId } = useWorkspaceScope();
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
      error={mutation.error}
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
      <CustomerPicker kind="accounts" label="Account" value={accountId} onChange={setAccountId} />
      <NativeField id="affiliation-title" name="title" label="Role or title" maxLength={300} />
    </FormDialog>
  );
}
