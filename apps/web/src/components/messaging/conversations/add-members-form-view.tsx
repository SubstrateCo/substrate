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
  agents = [],
  agentsError,
}: {
  onSubmit: (emails: string, agentActorIds: string[]) => void;
  agents?: { id: string; name: string }[];
  agentsError?: Error | null;
  pending?: boolean;
  error?: Error | null;
  onClose: () => void;
}) {
  const [emails, setEmails] = useState("");
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [emailError, setEmailError] = useState("");
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
        try {
          if (!parseRecipientEmails(emails).length && !selectedAgents.length) {
            setEmailError("Enter an email address or choose an agent.");
            event.currentTarget.querySelector<HTMLInputElement>("#add-member-emails")?.focus();
            return;
          }
        } catch (error) {
          setEmailError(error instanceof Error ? error.message : "Enter complete email addresses.");
          event.currentTarget.querySelector<HTMLInputElement>("#add-member-emails")?.focus();
          return;
        }
        onSubmit(emails, selectedAgents);
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
          Include people from any workspace who already have an account. Separate email addresses
          with commas.
        </FieldDescription>
        <FieldError id="add-member-emails-error">{fieldError}</FieldError>
      </Field>
      {agents.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Add your agents</legend>
          <p className="text-xs text-muted-foreground">
            Selected agents can read and send messages in this conversation.
          </p>
          {agents.map((agent) => (
            <label key={agent.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                disabled={pending}
                checked={selectedAgents.includes(agent.id)}
                onCheckedChange={(checked) =>
                  setSelectedAgents((current) =>
                    checked === true
                      ? [...current, agent.id]
                      : current.filter((id) => id !== agent.id),
                  )
                }
              />
              {agent.name}
              <span className="rounded border px-1.5 py-0.5 text-xs text-muted-foreground">
                Agent
              </span>
            </label>
          ))}
        </fieldset>
      )}
      {agentsError && (
        <p role="alert" className="text-sm text-destructive">
          Could not load agents. Close and reopen this form to retry.
        </p>
      )}
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
