import { useState } from "react";

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
  /** The account's name, shown in the picker before its options load. */
  accountName?: string;
  stageId?: string;
  amount?: string | null;
  currency?: string | null;
  expectedCloseDate?: string | null;
  version?: number;
  contactEntityIds?: string[];
  primaryContactEntityId?: string | null;
  /** The primary contact's name, shown in the picker before its options load. */
  primaryContactName?: string;
};

export function RecordEditor({
  kind,
  record: openedRecord,
  defaultCurrency,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  kind: CrmKind;
  record?: RecordDraft;
  pending: boolean;
  error: Error | null;
  defaultCurrency?: string | null;
  onClose: () => void;
  onSubmit: (write: RecordWrite) => void;
}) {
  const { organizationId } = useWorkspaceScope();
  const singular = singularLabels[kind];
  // Keep the record as opened, so a refetch does not change the version this edit expects.
  const [record] = useState(openedRecord);
  // Creators load the pipeline before they open the editor, so the first stage is ready here.
  const { options: stages } = useActiveStages(organizationId, kind === "deals");
  const [accountId, setAccountId] = useState(record?.accountEntityId ?? "");
  const [contactId, setContactId] = useState(record?.primaryContactEntityId ?? "");
  const [stageId, setStageId] = useState(record?.stageId ?? stages.at(0)?.value ?? "");
  const [validation, setValidation] = useState<string | null>(null);
  const [requestId] = useState(() => crypto.randomUUID());
  function submit(form: FormData) {
    const text = (name: string) => formText(form, name);
    const entityId = record?.entityId;
    if (kind === "accounts") {
      const fields = {
        organizationId,
        name: text("name"),
        website: text("website") || null,
        domain: text("domain") || null,
        summary: text("summary"),
      };
      onSubmit(
        entityId
          ? { action: "updateAccount", entityId, ...fields }
          : { action: "createAccount", requestId, ...fields },
      );
    } else if (kind === "contacts") {
      const fields = { organizationId, displayName: text("name"), notes: text("summary") || null };
      onSubmit(
        entityId
          ? { action: "updateContact", entityId, ...fields }
          : { action: "createContact", ...fields },
      );
    } else {
      if (!entityId && !accountId && !contactId) {
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
        entityId
          ? { action: "updateDeal", entityId, expectedVersion: record.version ?? 1, ...fields }
          : { action: "createDeal", requestId, ...fields },
      );
    }
  }
  return (
    <FormDialog
      title={record ? `Edit ${singular}` : `New ${singular}`}
      description={
        record
          ? "Update this record without changing its access."
          : "Records start with your access. Linking a customer does not share either record."
      }
      size={kind === "deals" ? "lg" : "default"}
      saveLabel={record ? "Save" : `Create ${singular}`}
      nativeValidation
      pending={pending}
      error={validation ?? error}
      errorDescription="Couldn’t save this record. Refresh it and try again."
      onClose={onClose}
      onSubmit={submit}
    >
      <RecordNameField kind={kind} record={record} />
      {kind === "accounts" && <AccountFields record={record} />}
      {kind === "deals" && (
        <>
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
        </>
      )}
      <NativeField
        id="crm-summary"
        name="summary"
        label={kind === "contacts" ? "Notes" : "Summary"}
        multiline
        defaultValue={record?.summary ?? record?.notes ?? ""}
        maxLength={20000}
      />
    </FormDialog>
  );
}

const missingName = {
  accounts: "Enter an account name.",
  contacts: "Enter a contact name.",
  deals: "Enter a deal title.",
} satisfies Record<CrmKind, string>;

function RecordNameField({ kind, record }: { kind: CrmKind; record?: RecordDraft }) {
  return (
    <NativeField
      id="crm-name"
      name="name"
      label={kind === "deals" ? "Title" : "Name"}
      defaultValue={record?.name ?? record?.displayName ?? record?.title ?? ""}
      required
      missingMessage={missingName[kind]}
      maxLength={kind === "contacts" ? 1000 : 300}
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
