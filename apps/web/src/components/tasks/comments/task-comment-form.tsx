import { useId, useState } from "react";

import { FormMessage } from "../../auth/form-message";
import { PendingButton } from "../../feedback/pending-button";
import { useNativeValidation } from "../../forms/use-native-validation";
import { Field, FieldLabel, FieldError } from "../../ui/field";
import { Textarea } from "../../ui/textarea";

export function TaskCommentForm({
  pending,
  error,
  onSend,
}: {
  pending: boolean;
  error?: Error | null;
  onSend: (body: string, onSuccess: () => void) => void;
}) {
  const id = useId();
  const [body, setBody] = useState("");
  const validation = useNativeValidation();
  return (
    <form
      className="space-y-2"
      onInvalidCapture={validation.onInvalid}
      onInputCapture={validation.onInput}
      onSubmit={(event) => {
        event.preventDefault();
        if (!pending && body.trim())
          onSend(body, () => setBody((current) => (current === body ? "" : current)));
      }}
    >
      <fieldset disabled={pending} className="min-w-0 space-y-2">
        <Field data-invalid={Boolean(validation.errors[id])}>
          <FieldLabel htmlFor={id}>Add a comment</FieldLabel>
          <Textarea
            {...validation.inputProps(id)}
            id={id}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            required
            maxLength={20000}
            placeholder="Write a comment…"
          />
          <FieldError id={`${id}-error`}>{validation.errors[id]}</FieldError>
        </Field>
        <FormMessage error={error} />
        <PendingButton disabled={!body.trim()} pending={pending} pendingLabel="Posting comment…">
          Post comment
        </PendingButton>
      </fieldset>
    </form>
  );
}
