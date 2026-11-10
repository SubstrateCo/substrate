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
  onDirtyChange,
}: {
  canComment: boolean;
  comments: Comment[];
  loading?: boolean;
  error?: Error | null;
  pending?: boolean;
  actionError?: Error | null;
  onRetry: () => void;
  onSend: (body: string, onSuccess: () => void) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const unavailable = isAccessFailure(error);
  return (
    <section aria-label="Task comments" className="space-y-3 border-t pt-5">
      <h3 className="flex h-7 items-center gap-1.5 text-xs font-medium text-muted-foreground">
        Comments
        {!!comments.length && !unavailable && (
          <span className="font-normal tabular-nums">{comments.length}</span>
        )}
      </h3>
      {loading && <LoadingState label="Loading comments" variant="messages" rows={2} />}
      {error && (
        <ErrorState
          compact
          title={unavailable ? "Comments unavailable" : "Couldn't load comments"}
          onRetry={onRetry}
        />
      )}
      {!unavailable && !!comments.length && (
        <ul className="space-y-4">
          {comments.map((comment) => (
            <TaskComment key={comment.id} comment={comment} />
          ))}
        </ul>
      )}
      {!loading && !error && !comments.length && !canComment && (
        <p className="text-sm text-muted-foreground">No comments yet.</p>
      )}
      {canComment && !unavailable && (
        <TaskCommentForm
          pending={pending}
          error={actionError}
          onSend={onSend}
          onDirtyChange={onDirtyChange}
        />
      )}
    </section>
  );
}
