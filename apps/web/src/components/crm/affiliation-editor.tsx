import { useQuery } from "@tanstack/react-query";

import { useState } from "react";

import { CustomerPicker } from "./customer-picker";
import { formText } from "./form-text";
import { FormMessage } from "@/components/feedback/form-message";
import { PendingButton } from "@/components/feedback/pending-button";
import { NativeField, NativeForm } from "@/components/forms/native-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Link account</DialogTitle>
          <DialogDescription>
            Both records must be editable. Linking does not change access or move interaction
            history.
          </DialogDescription>
        </DialogHeader>
        <NativeForm
          pending={mutation.isPending}
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
          <DialogBody>
            <CustomerPicker
              organizationId={organizationId}
              kind="accounts"
              label="Account"
              value={accountId}
              onChange={setAccountId}
            />
            <NativeField
              id="affiliation-title"
              name="title"
              label="Role or title"
              maxLength={300}
            />
            <FormMessage
              error={accounts.error ?? mutation.error}
              errorDescription="Couldn’t link this account. Check that you can edit both records."
            />
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" disabled={mutation.isPending} onClick={onClose}>
              Cancel
            </Button>
            <PendingButton
              type="submit"
              pending={mutation.isPending}
              pendingLabel="Linking…"
              disabled={!accountId}
            >
              Link account
            </PendingButton>
          </DialogFooter>
        </NativeForm>
      </DialogContent>
    </Dialog>
  );
}
