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
  const send = () => {
    if (!pending && body.trim())
      onSend(body, () => setBody((current) => (current === body ? "" : current)));
  };
  return (
    <form
      onInvalidCapture={validation.onInvalid}
      onInputCapture={validation.onInput}
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
    >
      <fieldset disabled={pending} className="min-w-0 space-y-2">
        <Field data-invalid={Boolean(validation.errors[id])}>
          <FieldLabel htmlFor={id} className="sr-only">
            Add a comment
          </FieldLabel>
          <Textarea
            {...validation.inputProps(id)}
            id={id}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                send();
              }
            }}
            required
            maxLength={20000}
            placeholder="Leave a comment…"
            className="min-h-16"
          />
          <FieldError id={`${id}-error`}>{validation.errors[id]}</FieldError>
        </Field>
        <FormMessage error={error} />
        <div className="flex justify-end">
          <PendingButton
            size="sm"
            disabled={!body.trim()}
            pending={pending}
            pendingLabel="Posting comment."
          >
            Post comment
          </PendingButton>
        </div>
      </fieldset>
    </form>
  );
}
