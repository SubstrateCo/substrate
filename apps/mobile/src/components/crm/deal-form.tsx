import { useQuery } from "@tanstack/react-query";

import { useState } from "react";

import { RecordPickerField } from "./record-picker";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { removeDealContact, selectDealPrimary } from "@/features/records/crm/deal-contacts";
import { recordQueries } from "@/features/records/queries";
import type { DealDetail } from "@/features/records/requests";
import { dateFieldValid, DateField, SelectField, TextField } from "@/features/records/ui/fields";
import { Row } from "@/features/records/ui/rows";
import { FormSheet } from "@/features/records/ui/sheet";
import type { QueryScope } from "@/queries/keys";

export type DealDraft = {
  title: string;
  accountEntityId: string | null;
  contactEntityIds: string[];
  primaryContactEntityId: string | null;
  stageId: string;
  amount: string | null;
  currency: string | null;
  expectedCloseDate: string | null;
  summary: string;
};

export function DealForm({
  scope,
  deal,
  initialAccount,
  pending,
  error,
  onSubmit,
  onClose,
}: {
  scope: QueryScope;
  deal?: DealDetail;
  initialAccount?: { entityId: string; name: string };
  pending: boolean;
  error: Error | null;
  onSubmit: (draft: DealDraft) => void;
  onClose: () => void;
}) {
  const stages = useQuery(recordQueries.pipeline(scope));
  const settings = useQuery({ ...recordQueries.crmSettings(scope), enabled: !deal });
  const primary = deal?.contacts.find((row) => row.isPrimary)?.contact;
  const [title, setTitle] = useState(deal?.deal.title ?? "");
  const [accountId, setAccountId] = useState(
    deal?.deal.accountEntityId ?? initialAccount?.entityId ?? null,
  );
  const [participants, setParticipants] = useState(() => ({
    ids: deal?.contacts.map((row) => row.contact.entityId) ?? [],
    primary: primary?.entityId ?? null,
  }));
  const [contactNames, setContactNames] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      (deal?.contacts ?? []).map(({ contact }) => [contact.entityId, contact.displayName]),
    ),
  );
  const contactId = participants.primary;
  const [stageId, setStageId] = useState<string | null>(deal?.deal.stageId ?? null);
  const [amount, setAmount] = useState(deal?.deal.amount ?? "");
  const [currency, setCurrency] = useState<string | null>(deal ? deal.deal.currency : null);
  const [close, setClose] = useState(deal?.deal.expectedCloseDate ?? "");
  const [summary, setSummary] = useState(deal?.deal.summary ?? "");
  const openStages = (stages.data ?? []).filter((stage) => !stage.retired);
  const chosenStage = stageId ?? openStages.at(0)?.id ?? null;
  const chosenCurrency = (
    currency ?? (deal ? "" : (settings.data?.defaultCurrency ?? ""))
  ).toUpperCase();
  const amountValue = amount.trim();
  const validAmount = amountValue === "" || /^\d{1,15}(\.\d{1,4})?$/.test(amountValue);
  const validCurrency = amountValue === "" || /^[A-Z]{3}$/.test(chosenCurrency);
  const hasCustomer = !!deal || !!accountId || participants.ids.length > 0;
  const initialCurrency = deal ? deal.deal.currency : settings.data?.defaultCurrency;
  const dirty =
    title !== (deal?.deal.title ?? "") ||
    accountId !== (deal?.deal.accountEntityId ?? initialAccount?.entityId ?? null) ||
    contactId !== (primary?.entityId ?? null) ||
    JSON.stringify(participants.ids) !==
      JSON.stringify(deal?.contacts.map((row) => row.contact.entityId) ?? []) ||
    amount !== (deal?.deal.amount ?? "") ||
    chosenCurrency !== (initialCurrency ?? "").toUpperCase() ||
    (!deal && stageId !== null) ||
    close !== (deal?.deal.expectedCloseDate ?? "") ||
    summary !== (deal?.deal.summary ?? "");
  return (
    <FormSheet
      title={deal ? "Edit deal" : "New deal"}
      description={
        deal
          ? "Change the stage or outcome from the deal's Move action."
          : "Link an account or a contact. Linking doesn't share either record."
      }
      saveLabel={deal ? "Save" : "Create"}
      dirty={dirty}
      pending={pending}
      canSave={
        !!title.trim() &&
        !!chosenStage &&
        validAmount &&
        validCurrency &&
        hasCustomer &&
        dateFieldValid(close)
      }
      error={error ?? stages.error}
      onClose={onClose}
      onSave={() => {
        if (!chosenStage) return;
        onSubmit({
          title: title.trim(),
          accountEntityId: accountId,
          contactEntityIds: participants.ids,
          primaryContactEntityId: contactId,
          stageId: chosenStage,
          amount: amountValue || null,
          currency: amountValue ? chosenCurrency : null,
          expectedCloseDate: close || null,
          summary,
        });
      }}
    >
      <TextField
        label="Title"
        value={title}
        onChange={setTitle}
        maxLength={300}
        autoFocus={!deal}
      />
      <RecordPickerField
        scope={scope}
        kind="accounts"
        label="Account"
        value={accountId}
        initialLabel={deal?.deal.accountEntityId ? deal.account.name : initialAccount?.name}
        onChange={(value) => setAccountId(value)}
      />
      <RecordPickerField
        scope={scope}
        kind="contacts"
        label="Primary contact"
        value={contactId}
        initialLabel={primary?.displayName}
        onChange={(value, name) => {
          setParticipants((current) => selectDealPrimary(current, value));
          if (value && name) setContactNames((current) => ({ ...current, [value]: name }));
        }}
        description={hasCustomer ? undefined : "Choose an account or a contact."}
      />
      <RecordPickerField
        scope={scope}
        kind="contacts"
        label="Additional contact"
        value={null}
        allowNone={false}
        onChange={(value, name) => {
          if (!value) return;
          setParticipants((current) => ({
            ...current,
            ids: current.ids.includes(value) ? current.ids : [...current.ids, value],
          }));
          if (name) setContactNames((current) => ({ ...current, [value]: name }));
        }}
        description="Participants do not gain access to this deal."
      />
      {participants.ids.map((id) => (
        <Row
          key={id}
          title={contactNames[id] ?? "Contact"}
          subtitle={id === contactId ? "Primary contact" : undefined}
          trailing={
            <Button
              variant="ghost"
              size="sm"
              accessibilityLabel={`Remove ${contactNames[id] ?? "contact"} from deal`}
              onPress={() => setParticipants((current) => removeDealContact(current, id))}
            >
              <Text>Remove</Text>
            </Button>
          }
        />
      ))}
      {deal ? null : (
        <SelectField
          label="Stage"
          value={chosenStage}
          onChange={setStageId}
          loading={stages.isPending}
          placeholder={stages.isPending ? "Loading stages…" : "Choose a stage"}
          choices={openStages.map((stage) => ({ value: stage.id, label: stage.name }))}
        />
      )}
      <TextField
        label="Amount"
        value={amount}
        onChange={setAmount}
        keyboardType="decimal-pad"
        placeholder="0.00"
        error={validAmount ? null : "Use a positive number with up to four decimals."}
      />
      <TextField
        label="Currency"
        value={chosenCurrency}
        onChange={(value) => setCurrency(value.toUpperCase())}
        autoCapitalize="characters"
        maxLength={3}
        placeholder="USD"
        description="Needed only with an amount."
        error={validCurrency ? null : "Use a three-letter code, like USD."}
      />
      <DateField label="Expected close" value={close} onChange={setClose} />
      <TextField
        label="Summary"
        value={summary}
        onChange={setSummary}
        multiline
        maxLength={20000}
      />
    </FormSheet>
  );
}
