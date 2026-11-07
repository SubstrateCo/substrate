import { ErrorState } from "../../feedback/error-state";
import { LoadingState } from "../../feedback/loading-state";
import { isAccessFailure } from "../../feedback/request-failure";
import type { TaskComment as Comment } from "../types";
import { TaskComment } from "./task-comment";
import { TaskCommentForm } from "./task-comment-form";

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
  comments: Comment[];
  loading?: boolean;
  error?: Error | null;
  pending?: boolean;
  actionError?: Error | null;
  onRetry: () => void;
  onSend: (body: string, onSuccess: () => void) => void;
}) {
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
        comments.map((comment) => <TaskComment key={comment.id} comment={comment} />)}
      {!loading && !error && !comments.length && (
        <p className="text-sm text-muted-foreground">No comments yet.</p>
      )}
      {canComment && !unavailable && (
        <TaskCommentForm pending={pending} error={actionError} onSend={onSend} />
      )}
    </section>
  );
}
