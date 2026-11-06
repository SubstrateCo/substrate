import { useId, useState } from "react";
import { Label } from "../primitives/label";
import { Textarea } from "../primitives/textarea";
import { PendingButton } from "../feedback/pending-button";
import { FormMessage } from "../auth/form-message";

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
      <Label htmlFor={id}>Add a comment</Label>
      <Textarea
        id={id}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        required
        maxLength={20000}
      />
      <FormMessage error={error} />
      <PendingButton disabled={!body.trim()} pending={pending} pendingLabel="Posting comment…">
        Post comment
      </PendingButton>
    </form>
  );
}
