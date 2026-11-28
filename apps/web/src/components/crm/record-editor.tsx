import { useState, type ReactNode } from "react";

import { singularLabels, type CrmKind } from "./crm-types";
import { CustomerPicker } from "./customer-picker";
import { formText } from "./form-text";
import { FormDialog } from "@/components/feedback/form-dialog";
import { DateField } from "@/components/forms/date-field";
import { NativeField } from "@/components/forms/native-form";
import { SelectField } from "@/components/forms/select-field";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { useActiveStages } from "@/queries/crm/stages";
import type { RecordWrite } from "@/queries/records/mutations";

export type RecordDraft = {
  entityId: string;
  name?: string;
  displayName?: string;
  title?: string;
  website?: string | null;
  domain?: string | null;
  summary?: string;
  notes?: string | null;
  accountEntityId?: string | null;
  accountName?: string;
  stageId?: string;
  amount?: string | null;
  currency?: string | null;
  expectedCloseDate?: string | null;
  version?: number;
  contactEntityIds?: string[];
  primaryContactEntityId?: string | null;
  primaryContactName?: string;
};

type EditorProps = {
  record?: RecordDraft;
  pending: boolean;
  error: Error | null;
  onClose: () => void;
  onSubmit: (write: RecordWrite) => void;
};

export function RecordEditor({
  kind,
  defaultCurrency,
  ...props
}: EditorProps & {
  kind: CrmKind;
  defaultCurrency?: string | null;
}) {
  if (kind === "accounts") return <AccountEditor {...props} />;
  if (kind === "contacts") return <ContactEditor {...props} />;
  return <DealEditor {...props} defaultCurrency={defaultCurrency} />;
}

function useOpenedRecord(record: RecordDraft | undefined) {
  return useState(record)[0];
}

function AccountEditor({ record: openedRecord, onSubmit, ...dialog }: EditorProps) {
  const { organizationId } = useWorkspaceScope();
  const record = useOpenedRecord(openedRecord);
  const [requestId] = useState(() => crypto.randomUUID());
  return (
    <RecordEditorDialog
      kind="accounts"
      editing={!!record}
      {...dialog}
      onSubmit={(form) => {
        const text = (name: string) => formText(form, name);
        const fields = {
          organizationId,
          name: text("name"),
          website: text("website") || null,
          domain: text("domain") || null,
          summary: text("summary"),
        };
        onSubmit(
          record
            ? { action: "updateAccount", entityId: record.entityId, ...fields }
            : { action: "createAccount", requestId, ...fields },
        );
      }}
    >
      <RecordNameField kind="accounts" record={record} />
      <AccountFields record={record} />
      <RecordSummaryField label="Summary" record={record} />
    </RecordEditorDialog>
  );
}

function ContactEditor({ record: openedRecord, onSubmit, ...dialog }: EditorProps) {
  const { organizationId } = useWorkspaceScope();
  const record = useOpenedRecord(openedRecord);
  return (
    <RecordEditorDialog
      kind="contacts"
      editing={!!record}
      {...dialog}
      onSubmit={(form) => {
        const text = (name: string) => formText(form, name);
        const fields = {
          organizationId,
          displayName: text("name"),
          notes: text("summary") || null,
        };
        onSubmit(
          record
            ? { action: "updateContact", entityId: record.entityId, ...fields }
            : { action: "createContact", ...fields },
        );
      }}
    >
      <RecordNameField kind="contacts" record={record} />
      <RecordSummaryField label="Notes" record={record} />
    </RecordEditorDialog>
  );
}

function DealEditor({
  record: openedRecord,
  defaultCurrency,
  error,
  onSubmit,
  ...dialog
}: EditorProps & { defaultCurrency?: string | null }) {
  const { organizationId } = useWorkspaceScope();
  const record = useOpenedRecord(openedRecord);
  const { options: stages } = useActiveStages(organizationId, true);
  const [accountId, setAccountId] = useState(record?.accountEntityId ?? "");
  const [contactId, setContactId] = useState(record?.primaryContactEntityId ?? "");
  const [stageId, setStageId] = useState(record?.stageId ?? stages.at(0)?.value ?? "");
  const [validation, setValidation] = useState<string | null>(null);
  const [requestId] = useState(() => crypto.randomUUID());
  function submit(form: FormData) {
    const text = (name: string) => formText(form, name);
    if (!record && !accountId && !contactId) {
      setValidation("Choose an account or contact for this deal.");
      return;
    }
    if (!stageId) {
      setValidation("Choose a stage for this deal.");
      return;
    }
    const amount = text("amount") || null;
    const currency = amount === null ? null : text("currency") || null;
    if (amount !== null && currency === null) {
      setValidation("Choose a currency for this amount.");
      return;
    }
    const fields = {
      organizationId,
      title: text("name"),
      accountEntityId: accountId || null,
      contactEntityIds: [
        ...new Set([...(record?.contactEntityIds ?? []), ...(contactId ? [contactId] : [])]),
      ],
      primaryContactEntityId: contactId || null,
      stageId,
      amount,
      currency,
      expectedCloseDate: text("closeDate") || null,
      summary: text("summary"),
    };
    onSubmit(
      record
        ? {
            action: "updateDeal",
            entityId: record.entityId,
            expectedVersion: record.version ?? 1,
            ...fields,
          }
        : { action: "createDeal", requestId, ...fields },
    );
  }
  return (
    <RecordEditorDialog
      kind="deals"
      editing={!!record}
      size="lg"
      error={validation ?? error}
      {...dialog}
      onSubmit={submit}
    >
      <RecordNameField kind="deals" record={record} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <CustomerPicker
          kind="accounts"
          label="Account"
          value={accountId}
          onChange={setAccountId}
          initialLabel={record?.accountName}
        />
        <CustomerPicker
          kind="contacts"
          label="Primary contact"
          value={contactId}
          onChange={setContactId}
          initialLabel={record?.primaryContactName}
        />
      </div>
      <SelectField
        label="Stage"
        value={stageId}
        onChange={setStageId}
        options={stages}
        disabled={!!record}
      />
      <DealTermsFields record={record} defaultCurrency={defaultCurrency} />
      <RecordSummaryField label="Summary" record={record} />
    </RecordEditorDialog>
  );
}

function RecordEditorDialog({
  kind,
  editing,
  size,
  pending,
  error,
  onClose,
  onSubmit,
  children,
}: {
  kind: CrmKind;
  editing: boolean;
  size?: "lg";
  pending: boolean;
  error: Error | string | null;
  onClose: () => void;
  onSubmit: (form: FormData) => void;
  children: ReactNode;
}) {
  const singular = singularLabels[kind];
  return (
    <FormDialog
      title={editing ? `Edit ${singular}` : `New ${singular}`}
      description={
        editing
          ? "Update this record without changing its access."
          : "Records start with your access. Linking a customer does not share either record."
      }
      size={size}
      saveLabel={editing ? "Save" : `Create ${singular}`}
      nativeValidation
      pending={pending}
      error={error}
      errorDescription="Couldn’t save this record. Refresh it and try again."
      onClose={onClose}
      onSubmit={onSubmit}
    >
      {children}
    </FormDialog>
  );
}

const nameFields = {
  accounts: { label: "Name", missingMessage: "Enter an account name.", maxLength: 300 },
  contacts: { label: "Name", missingMessage: "Enter a contact name.", maxLength: 1000 },
  deals: { label: "Title", missingMessage: "Enter a deal title.", maxLength: 300 },
} satisfies Record<CrmKind, { label: string; missingMessage: string; maxLength: number }>;

function RecordNameField({ kind, record }: { kind: CrmKind; record?: RecordDraft }) {
  return (
    <NativeField
      id="crm-name"
      name="name"
      {...nameFields[kind]}
      defaultValue={record?.name ?? record?.displayName ?? record?.title ?? ""}
      required
    />
  );
}

function RecordSummaryField({ label, record }: { label: string; record?: RecordDraft }) {
  return (
    <NativeField
      id="crm-summary"
      name="summary"
      label={label}
      multiline
      defaultValue={record?.summary ?? record?.notes ?? ""}
      maxLength={20000}
    />
  );
}

function AccountFields({ record }: { record?: RecordDraft }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <NativeField
        id="crm-website"
        name="website"
        label="Website"
        type="url"
        defaultValue={record?.website ?? ""}
        placeholder="https://example.com"
      />
      <NativeField
        id="crm-domain"
        name="domain"
        label="Domain"
        defaultValue={record?.domain ?? ""}
        placeholder="example.com"
      />
    </div>
  );
}

function DealTermsFields({
  record,
  defaultCurrency,
}: {
  record?: RecordDraft;
  defaultCurrency?: string | null;
}) {
  const [closeDate, setCloseDate] = useState(record?.expectedCloseDate ?? "");
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <NativeField
        id="crm-amount"
        name="amount"
        label="Amount"
        inputMode="decimal"
        pattern="[0-9]{1,15}(\.[0-9]{1,4})?"
        title="Use a positive amount or zero with up to four decimal places."
        defaultValue={record?.amount ?? ""}
      />
      <NativeField
        id="crm-currency"
        name="currency"
        label="Currency"
        pattern="[A-Z]{3}"
        title="Use a three-letter currency code, like USD."
        maxLength={3}
        defaultValue={(record ? record.currency : defaultCurrency) ?? ""}
        placeholder="Not set"
        description="Used only when an amount is entered."
      />
      <DateField
        label="Expected close"
        name="closeDate"
        value={closeDate}
        onChange={setCloseDate}
      />
    </div>
  );
}
