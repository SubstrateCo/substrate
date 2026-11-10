import { useState } from "react";

import { FormMessage } from "../../auth/form-message";
import { PendingButton } from "../../feedback/pending-button";
import { useNativeValidation } from "../../forms/use-native-validation";
import { Button } from "../../ui/button";
import { Checkbox } from "../../ui/checkbox";
import { Field, FieldDescription, FieldError, FieldLabel } from "../../ui/field";
import { Input } from "../../ui/input";
import { parseRecipientEmails } from "@/lib/messaging/recipients";

export function AddMembersForm({
  onSubmit,
  pending = false,
  error,
  onClose,
}: {
  onSubmit: (emails: string[], shareHistory: boolean) => void;
  pending?: boolean;
  error?: Error | null;
  onClose: () => void;
}) {
  const [emails, setEmails] = useState("");
  const [emailError, setEmailError] = useState("");
  const [shareHistory, setShareHistory] = useState(false);
  const validation = useNativeValidation();
  const fieldError = validation.errors["add-member-emails"] || emailError;
  return (
    <form
      className="space-y-3 border-b bg-muted/30 p-4"
      onInvalidCapture={validation.onInvalid}
      onInputCapture={validation.onInput}
      onSubmit={(event) => {
        event.preventDefault();
        if (pending) return;
        let recipients: string[];
        try {
          recipients = parseRecipientEmails(emails);
          if (!recipients.length) {
            setEmailError("Enter an email address.");
            event.currentTarget.querySelector<HTMLInputElement>("#add-member-emails")?.focus();
            return;
          }
        } catch (error) {
          setEmailError(error instanceof Error ? error.message : "Enter complete email addresses.");
          event.currentTarget.querySelector<HTMLInputElement>("#add-member-emails")?.focus();
          return;
        }
        onSubmit(recipients, shareHistory);
      }}
    >
      <Field data-invalid={Boolean(fieldError)}>
        <FieldLabel htmlFor="add-member-emails">Add people by exact email address</FieldLabel>
        <Input
          aria-invalid={Boolean(fieldError)}
          aria-describedby={
            fieldError
              ? "add-member-emails-description add-member-emails-error"
              : "add-member-emails-description"
          }
          id="add-member-emails"
          placeholder="alex@company.com, sam@partner.com"
          value={emails}
          onChange={(event) => {
            setEmails(event.target.value);
            setEmailError("");
          }}
          disabled={pending}
        />
        <FieldDescription id="add-member-emails-description">
          Workspace members are added directly. External people receive invitations and must
          consent. Partner channels require organization approval. Separate emails with commas.
        </FieldDescription>
        <FieldError id="add-member-emails-error">{fieldError}</FieldError>
      </Field>
      <Field orientation="horizontal">
        <Checkbox
          id="add-sharing-history"
          checked={shareHistory}
          onCheckedChange={(value) => setShareHistory(value === true)}
          disabled={pending}
        />
        <FieldLabel htmlFor="add-sharing-history">
          For external invitations, I approve sharing the full conversation history.
        </FieldLabel>
      </Field>
      <FormMessage
        error={error}
        errorDescription="We couldn’t add these people. Check their email addresses and try again."
      />
      <div className="flex gap-2">
        <PendingButton type="submit" pending={pending} pendingLabel="Adding…">
          Add members
        </PendingButton>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
