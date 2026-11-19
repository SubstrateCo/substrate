import type { ContactIdentifierType } from "@substrate/contracts/contacts/input";

import { useState } from "react";

import type { getContact } from "@/api/contacts/requests";
import { CrmSelect } from "@/components/crm/crm-select";
import { formText } from "@/components/crm/form-text";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { FormMessage } from "@/components/feedback/form-message";
import { PendingButton } from "@/components/feedback/pending-button";
import { NativeField, NativeForm } from "@/components/forms/native-form";
import { RowAction, RowActions } from "@/components/layout/row-actions";
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
import { useRecordMutation } from "@/queries/records/mutations";
import { Pencil, Plus, Trash2 } from "lucide-react";

type Identifier = Awaited<ReturnType<typeof getContact>>["identifiers"][number];

export function ContactMethods({
  organizationId,
  contactEntityId,
  identifiers,
  canEdit,
}: {
  organizationId: string;
  contactEntityId: string;
  identifiers: Identifier[];
  canEdit: boolean;
}) {
  const [editor, setEditor] = useState<{ record?: Identifier } | null>(null);
  const [removing, setRemoving] = useState<Identifier | null>(null);
  const mutation = useRecordMutation(organizationId, "contacts");
  return (
    <section aria-label="Contact methods" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium">Contact methods</h2>
        {canEdit && (
          <Button variant="outline" size="sm" onClick={() => setEditor({})}>
            <Plus aria-hidden />
            Add contact method
          </Button>
        )}
      </div>
      {!identifiers.length && (
        <p className="text-sm text-muted-foreground">No email addresses or phone numbers added</p>
      )}
      <ul className="divide-y">
        {identifiers.map((identifier) => (
          <li key={identifier.id} className="group/row flex items-center gap-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm wrap-break-word">
                {identifier.value}
                {identifier.extension ? ` ext. ${identifier.extension}` : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                {identifier.label || (identifier.type === "email" ? "Email" : "Phone")}
                {identifier.isPrimary ? " · Primary" : ""}
              </p>
            </div>
            {canEdit && (
              <RowActions label="Contact method actions">
                <RowAction
                  label="Edit contact method"
                  onClick={() => setEditor({ record: identifier })}
                >
                  <Pencil aria-hidden />
                </RowAction>
                <RowAction
                  label="Remove contact method"
                  destructive
                  onClick={() => {
                    mutation.reset();
                    setRemoving(identifier);
                  }}
                >
                  <Trash2 aria-hidden />
                </RowAction>
              </RowActions>
            )}
          </li>
        ))}
      </ul>
      {editor && (
        <ContactMethodEditor
          organizationId={organizationId}
          contactEntityId={contactEntityId}
          record={editor.record}
          onClose={() => setEditor(null)}
        />
      )}
      {removing && (
        <ConfirmDialog
          title="Remove contact method?"
          description="Remove this email address or phone number from the contact. This does not merge contacts or change any user’s identity."
          confirmLabel="Remove contact method"
          pendingLabel="Removing…"
          destructive
          pending={mutation.isPending}
          error={mutation.error}
          errorDescription="Couldn’t remove this contact method. Try again."
          onClose={() => setRemoving(null)}
          onConfirm={() =>
            mutation.mutate(
              { action: "removeIdentifier", organizationId, contactEntityId, id: removing.id },
              { onSuccess: () => setRemoving(null) },
            )
          }
        />
      )}
    </section>
  );
}

function ContactMethodEditor({
  organizationId,
  contactEntityId,
  record,
  onClose,
}: {
  organizationId: string;
  contactEntityId: string;
  record?: Identifier;
  onClose: () => void;
}) {
  const mutation = useRecordMutation(organizationId, "contacts");
  const [type, setType] = useState<ContactIdentifierType>(record?.type ?? "email");
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{record ? "Edit contact method" : "New contact method"}</DialogTitle>
          <DialogDescription>
            Contact details do not create a user, invite anyone, or merge matching contacts.
          </DialogDescription>
        </DialogHeader>
        <NativeForm
          pending={mutation.isPending}
          onSubmit={(form) => {
            const fields = {
              organizationId,
              contactEntityId,
              type,
              value: formText(form, "value"),
              label: formText(form, "label") || null,
              extension: record?.extension ?? null,
              isPrimary: record?.isPrimary ?? false,
            };
            mutation.mutate(
              record
                ? { action: "updateIdentifier", id: record.id, ...fields }
                : { action: "addIdentifier", ...fields },
              { onSuccess: onClose },
            );
          }}
        >
          <DialogBody>
            <CrmSelect
              label="Type"
              value={type}
              onValueChange={(next) => {
                if (next === "email" || next === "phone") setType(next);
              }}
              options={[
                { value: "email", label: "Email" },
                { value: "phone", label: "Phone" },
              ]}
            />
            <NativeField
              id="contact-method-value"
              name="value"
              label={type === "email" ? "Email address" : "Phone number"}
              type={type === "email" ? "email" : "tel"}
              defaultValue={record?.value ?? ""}
              description={
                type === "phone"
                  ? "Use the international format with + and the country calling code."
                  : undefined
              }
              required
              maxLength={1000}
            />
            <NativeField
              id="contact-method-label"
              name="label"
              label="Label"
              defaultValue={record?.label ?? ""}
              placeholder="Work"
              maxLength={1000}
            />
            <FormMessage
              error={mutation.error}
              errorDescription="Couldn’t save this contact method. Check the email address or international phone number."
            />
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" disabled={mutation.isPending} onClick={onClose}>
              Cancel
            </Button>
            <PendingButton type="submit" pending={mutation.isPending} pendingLabel="Saving…">
              {record ? "Save" : "Add contact method"}
            </PendingButton>
          </DialogFooter>
        </NativeForm>
      </DialogContent>
    </Dialog>
  );
}
