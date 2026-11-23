import type { ContactIdentifierType } from "@substrate/contracts/contacts/input";

import { useState } from "react";

import type { getContact } from "@/api/contacts/requests";
import { formText } from "@/components/crm/form-text";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { ContentNotice } from "@/components/feedback/content-notice";
import { FormDialog } from "@/components/feedback/form-dialog";
import { NativeField } from "@/components/forms/native-form";
import { SelectField } from "@/components/forms/select-field";
import { RecordSection, RecordSectionAction, recordRows } from "@/components/layout/record-section";
import { RowAction, RowActions } from "@/components/layout/row-actions";
import { Item, ItemActions, ItemContent, ItemDescription } from "@/components/ui/item";
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
    <RecordSection
      aria-label="Contact methods"
      title="Contact methods"
      actions={
        canEdit && (
          <RecordSectionAction label="Add contact method" onClick={() => setEditor({})}>
            <Plus aria-hidden="true" />
          </RecordSectionAction>
        )
      }
    >
      {!identifiers.length && (
        <ContentNotice variant="inline" title="No email addresses or phone numbers added" />
      )}
      <ul className={recordRows}>
        {identifiers.map((identifier) => (
          <Item key={identifier.id} asChild size="xs" className="group/row">
            <li>
              <ItemContent className="min-w-0">
                <p className="wrap-anywhere">
                  {identifier.value}
                  {identifier.extension ? ` ext. ${identifier.extension}` : ""}
                </p>
                <ItemDescription>
                  {identifier.label || (identifier.type === "email" ? "Email" : "Phone")}
                  {identifier.isPrimary ? " · Primary" : ""}
                </ItemDescription>
              </ItemContent>
              {canEdit && (
                <ItemActions>
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
                </ItemActions>
              )}
            </li>
          </Item>
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
    </RecordSection>
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
    <FormDialog
      title={record ? "Edit contact method" : "New contact method"}
      description="Contact details do not create a user, invite anyone, or merge matching contacts."
      saveLabel={record ? "Save" : "Create contact method"}
      nativeValidation
      pending={mutation.isPending}
      error={mutation.error}
      errorDescription="Couldn’t save this contact method. Check the email address or international phone number."
      onClose={onClose}
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
      <SelectField
        label="Type"
        value={type}
        onChange={setType}
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
        missingMessage={type === "email" ? "Enter an email address." : "Enter a phone number."}
        maxLength={1000}
      />
      <NativeField
        id="contact-method-label"
        name="label"
        label="Label"
        defaultValue={record?.label ?? ""}
        placeholder="For example: Work"
        maxLength={1000}
      />
    </FormDialog>
  );
}
