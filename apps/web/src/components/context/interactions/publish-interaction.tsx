import type { InteractionKind } from "@substrate/contracts/context/interactions";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { useState } from "react";

import { CrmResourceState } from "@/components/crm/crm-resource-state";
import { formText } from "@/components/crm/form-text";
import { FormDialog } from "@/components/feedback/form-dialog";
import { NativeField } from "@/components/forms/native-form";
import { SelectField } from "@/components/forms/select-field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
import { formatDateTime } from "@/lib/format/date";
import { messageLink } from "@/lib/navigation/record-links";
import { resourceState } from "@/lib/resource-state";
import { useInteractionMutation } from "@/queries/context/interactions";
import { relatedContextOptions } from "@/queries/context/links";

export function PublishInteraction({
  organizationId,
  contactEntityId,
}: {
  organizationId: string;
  contactEntityId: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Record from discussion
      </Button>
      {open && (
        <PublicationEditor
          organizationId={organizationId}
          contactEntityId={contactEntityId}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function PublicationEditor({
  organizationId,
  contactEntityId,
  onClose,
}: {
  organizationId: string;
  contactEntityId: string;
  onClose: () => void;
}) {
  const related = useQuery(relatedContextOptions(organizationId, contactEntityId));
  const mutation = useInteractionMutation(organizationId);
  const [messageId, setMessageId] = useState("");
  const [kind, setKind] = useState<InteractionKind>("message");
  const [consent, setConsent] = useState(false);
  const seen = new Set<string>();
  const sources = (resourceState(related).data ?? []).filter((row) => {
    if (row.deletedAt || seen.has(row.messageId)) return false;
    seen.add(row.messageId);
    return true;
  });
  const source = sources.find((row) => row.messageId === messageId);
  return (
    <FormDialog
      title="Record interaction from discussion"
      description="Choose a linked message you can read. Confirm that this interaction belongs to this contact; a message author is not automatically a customer identity."
      size="lg"
      saveLabel="Create interaction"
      nativeValidation
      disabled={!source || !consent || !!related.error}
      pending={mutation.isPending}
      error={mutation.error}
      errorDescription="Couldn’t publish this interaction. Check your source access, then try again."
      onClose={onClose}
      onSubmit={(form) => {
        if (!source || !consent || related.error) return;
        mutation.mutate(
          {
            action: "publishInteraction",
            organizationId,
            contactEntityId,
            messageId: source.messageId,
            kind,
            occurredAt: new Date(formText(form, "occurredAt")).toISOString(),
            summary: formText(form, "summary"),
            consentToContactAudience: true,
          },
          { onSuccess: onClose },
        );
      }}
    >
      <CrmResourceState
        compact
        pending={related.isPending}
        error={related.error}
        onRetry={() => void related.refetch()}
      />
      <SelectField
        label="Source message"
        value={messageId}
        onChange={setMessageId}
        options={[
          { value: "", label: "None" },
          ...sources.map((row) => ({
            value: row.messageId,
            label: `${row.authorName} · ${row.conversationName ?? "Discussion"} · ${formatDateTime(row.createdAt)}`,
          })),
        ]}
      />
      {source && (
        <Button variant="link" size="sm" asChild>
          <Link {...messageLink(organizationId, source.conversationId, source.messageId)}>
            Review source message
          </Link>
        </Button>
      )}
      <SelectField label="Kind" value={kind} onChange={setKind} options={publicationKinds} />
      <NativeField
        id="publication-occurred"
        name="occurredAt"
        label="Occurred at"
        type="datetime-local"
        required
        missingMessage="Choose when it happened."
      />
      <NativeField
        id="publication-summary"
        name="summary"
        label="Approved summary"
        multiline
        required
        missingMessage="Enter the approved summary."
        maxLength={10000}
        description="Write only the customer facts you approve for everyone in the workspace. Source content is not copied automatically."
      />
      <Field orientation="horizontal">
        <Checkbox
          id="publication-consent"
          checked={consent}
          onCheckedChange={(checked) => setConsent(checked === true)}
        />
        <FieldContent>
          <FieldLabel htmlFor="publication-consent">
            I approve this summary becoming visible to everyone in the workspace. It can remain
            visible after the source message is restricted or deleted.
          </FieldLabel>
        </FieldContent>
      </Field>
    </FormDialog>
  );
}

const publicationKinds = [
  { value: "message", label: "Message" },
  { value: "email", label: "Email" },
  { value: "meeting", label: "Meeting" },
  { value: "call", label: "Call" },
  { value: "note", label: "Internal note" },
  { value: "other", label: "Other" },
] satisfies { value: InteractionKind; label: string }[];
