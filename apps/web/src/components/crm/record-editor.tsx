import { useState } from "react";

import { CrmSelect } from "./crm-select";
import type { CrmKind } from "./crm-types";
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
  stageId?: string;
  amount?: string | null;
  currency?: string | null;
  expectedCloseDate?: string | null;
  version?: number;
  contactEntityIds?: string[];
  primaryContactEntityId?: string | null;
};

export function RecordEditor({
  kind,
  organizationId,
  record,
  accounts,
  contacts,
  stages,
  defaultCurrency,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  kind: CrmKind;
  organizationId: string;
  record?: RecordDraft;
  accounts: { value: string; label: string }[];
  contacts: { value: string; label: string }[];
  stages: { value: string; label: string }[];
  pending: boolean;
  error: Error | null;
  defaultCurrency?: string | null;
  onClose: () => void;
  onSubmit: (write: RecordWrite) => void;
}) {
  const singular = { accounts: "account", contacts: "contact", deals: "deal" }[kind];
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
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{record ? `Edit ${singular}` : `New ${singular}`}</DialogTitle>
          <DialogDescription>
            {record
              ? "Update this record without changing its access."
              : "Records start with your access. Linking a customer does not share either record."}
          </DialogDescription>
        </DialogHeader>
        <NativeForm pending={pending} onSubmit={submit}>
          <DialogBody>
            <NativeField
              id="crm-name"
              name="name"
              label={kind === "deals" ? "Title" : "Name"}
              defaultValue={record?.name ?? record?.displayName ?? record?.title ?? ""}
              required
              maxLength={kind === "contacts" ? 1000 : 300}
            />
            {kind === "accounts" && (
              <div className="grid grid-cols-2 gap-4">
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
            )}
            {kind === "deals" && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <CustomerPicker
                    organizationId={organizationId}
                    kind="accounts"
                    label="Account"
                    value={accountId}
                    onChange={setAccountId}
                    initialLabel={accounts.find((account) => account.value === accountId)?.label}
                  />
                  <CustomerPicker
                    organizationId={organizationId}
                    kind="contacts"
                    label="Primary contact"
                    value={contactId}
                    onChange={setContactId}
                    initialLabel={contacts.find((contact) => contact.value === contactId)?.label}
                  />
                </div>
                <CrmSelect
                  label="Stage"
                  value={stageId}
                  onValueChange={setStageId}
                  options={stages}
                  disabled={!!record}
                />
                <div className="grid grid-cols-3 gap-4">
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
                  <NativeField
                    id="crm-close"
                    name="closeDate"
                    label="Expected close"
                    type="date"
                    defaultValue={record?.expectedCloseDate ?? ""}
                  />
                </div>
              </>
            )}
            <NativeField
              id="crm-summary"
              name="summary"
              label={kind === "contacts" ? "Notes" : "Summary"}
              defaultValue={record?.summary ?? record?.notes ?? ""}
              maxLength={20000}
            />
            <FormMessage
              error={validation ?? error}
              errorDescription="Couldn’t save this record. Refresh it and try again."
            />
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" disabled={pending} onClick={onClose}>
              Cancel
            </Button>
            <PendingButton type="submit" pending={pending} pendingLabel="Saving…">
              {record ? "Save" : `Create ${singular}`}
            </PendingButton>
          </DialogFooter>
        </NativeForm>
      </DialogContent>
    </Dialog>
  );
}
