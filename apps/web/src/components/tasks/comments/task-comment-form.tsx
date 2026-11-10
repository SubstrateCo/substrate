import { useId, useRef, useState } from "react";

import { FormMessage } from "../../auth/form-message";
import { PendingButton } from "../../feedback/pending-button";
import { useNativeValidation } from "../../forms/use-native-validation";
import { Field, FieldLabel, FieldError } from "../../ui/field";
import { Textarea } from "../../ui/textarea";

export function TaskCommentForm({
  pending,
  error,
  onSend,
  onDirtyChange,
}: {
  pending: boolean;
  error?: Error | null;
  onSend: (body: string, onSuccess: () => void) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const id = useId();
  const [body, setBody] = useState("");
  const currentBody = useRef("");
  const validation = useNativeValidation();
  const send = () => {
    if (!pending && body.trim())
      onSend(body, () => {
        if (currentBody.current !== body) return;
        currentBody.current = "";
        setBody("");
        onDirtyChange(false);
      });
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
            onChange={(event) => {
              currentBody.current = event.target.value;
              setBody(event.target.value);
              onDirtyChange(Boolean(event.target.value));
            }}
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
