import type { InteractionKind } from "@substrate/contracts/context/interactions";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { useState } from "react";

import { CrmResourceState } from "@/components/crm/crm-resource-state";
import { CrmSelect } from "@/components/crm/crm-select";
import { formText } from "@/components/crm/form-text";
import { FormMessage } from "@/components/feedback/form-message";
import { PendingButton } from "@/components/feedback/pending-button";
import { NativeField, NativeForm } from "@/components/forms/native-form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
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
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !mutation.isPending) onClose();
      }}
    >
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Record interaction from discussion</DialogTitle>
          <DialogDescription>
            Choose a linked message you can read. Confirm that this interaction belongs to this
            contact; a message author is not automatically a customer identity.
          </DialogDescription>
        </DialogHeader>
        <NativeForm
          pending={mutation.isPending}
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
          <DialogBody>
            <CrmResourceState
              pending={related.isPending}
              error={related.error}
              onRetry={() => void related.refetch()}
            />
            <CrmSelect
              label="Source message"
              value={messageId}
              onValueChange={setMessageId}
              optional
              options={sources.map((row) => ({
                value: row.messageId,
                label: `${row.authorName} · ${row.conversationName ?? "Discussion"} · ${formatDateTime(row.createdAt)}`,
              }))}
            />
            {source && (
              <Button variant="link" size="sm" asChild>
                <Link {...messageLink(organizationId, source.conversationId, source.messageId)}>
                  Review source message
                </Link>
              </Button>
            )}
            <CrmSelect
              label="Kind"
              value={kind}
              onValueChange={(next) => {
                const choice = publicationKinds.find((item) => item.value === next);
                if (choice) setKind(choice.value);
              }}
              options={publicationKinds}
            />
            <NativeField
              id="publication-occurred"
              name="occurredAt"
              label="Occurred at"
              type="datetime-local"
              required
            />
            <NativeField
              id="publication-summary"
              name="summary"
              label="Approved summary"
              required
              maxLength={10000}
              description="Write only the customer facts you approve for the contact’s readers. Source content is not copied automatically."
            />
            <div className="flex items-start gap-2">
              <Checkbox
                id="publication-consent"
                checked={consent}
                onCheckedChange={(checked) => setConsent(checked === true)}
              />
              <Label htmlFor="publication-consent">
                I approve this summary becoming visible to this contact’s readers. It can remain
                visible after the source message is restricted or deleted.
              </Label>
            </div>
            <FormMessage
              error={mutation.error}
              errorDescription="Couldn’t publish this interaction. Check your source and contact access, then try again."
            />
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" disabled={mutation.isPending} onClick={onClose}>
              Cancel
            </Button>
            <PendingButton
              type="submit"
              pending={mutation.isPending}
              pendingLabel="Recording…"
              disabled={!source || !consent || !!related.error}
            >
              Record interaction
            </PendingButton>
          </DialogFooter>
        </NativeForm>
      </DialogContent>
    </Dialog>
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
