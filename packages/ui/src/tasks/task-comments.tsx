import { useId, useState } from "react";
import { Button } from "../primitives/button";
import { Label } from "../primitives/label";
import { Textarea } from "../primitives/textarea";
import { Spinner } from "../primitives/spinner";
import { FormMessage } from "../auth/form-message";
import { LoadingState } from "../feedback/loading-state";
import { ErrorState } from "../feedback/error-state";
import { isAccessFailure } from "../feedback/request-failure";
import type { TaskComment } from "./types";

export function TaskComments({
  canComment,
  comments,
  loading = false,
  error,
  pending = false,
  actionError,
  onRetry,
  onSend,
}: {
  canComment: boolean;
  comments: TaskComment[];
  loading?: boolean;
  error?: Error | null;
  pending?: boolean;
  actionError?: Error | null;
  onRetry: () => void;
  onSend: (body: string, onSuccess: () => void) => void;
}) {
  const id = useId();
  const [body, setBody] = useState("");
  const unavailable = isAccessFailure(error);
  return (
    <section aria-label="Task comments" className="space-y-4 border-t pt-4">
      <h3 className="font-semibold">Comments</h3>
      {loading && <LoadingState label="Loading comments" variant="messages" rows={2} />}
      {error && (
        <ErrorState
          compact
          title={unavailable ? "Comments unavailable" : "Couldn’t load comments"}
          onRetry={onRetry}
        />
      )}
      {!unavailable &&
        comments.map((comment) => (
          <article key={comment.id} className="rounded-lg border p-3">
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <strong className="text-foreground">{comment.authorName}</strong>
              <time dateTime={new Date(comment.createdAt).toISOString()}>
                {new Date(comment.createdAt).toLocaleString()}
              </time>
            </div>
            <p className="mt-2 text-sm whitespace-pre-wrap wrap-break-word">{comment.body}</p>
          </article>
        ))}
      {!loading && !error && !comments.length && (
        <p className="text-sm text-muted-foreground">No comments yet.</p>
      )}
      {canComment && !unavailable && (
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!pending) onSend(body, () => setBody(""));
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
          <FormMessage error={actionError} />
          <Button disabled={pending || !body.trim()}>
            {pending && <Spinner />}
            {pending ? "Posting comment…" : "Post comment"}
          </Button>
        </form>
      )}
    </section>
  );
}
