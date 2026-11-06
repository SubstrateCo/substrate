import { useId, useState } from "react";

import { FormMessage } from "../auth/form-message";
import { PendingButton } from "../feedback/pending-button";
import { Label } from "../primitives/label";
import { Textarea } from "../primitives/textarea";

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
  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!pending && body.trim())
          onSend(body, () => setBody((current) => (current === body ? "" : current)));
      }}
    >
      <fieldset disabled={pending} className="min-w-0 space-y-2">
        <Label htmlFor={id}>Add a comment</Label>
        <Textarea
          id={id}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          required
          maxLength={20000}
          placeholder="Write a comment…"
        />
        <FormMessage error={error} />
        <PendingButton disabled={!body.trim()} pending={pending} pendingLabel="Posting comment…">
          Post comment
        </PendingButton>
      </fieldset>
    </form>
  );
}
