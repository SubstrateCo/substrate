import type { TaskComment as Comment } from "./types";

export function TaskComment({ comment }: { comment: Comment }) {
  return (
    <article className="rounded-lg border p-3">
      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        <strong className="text-foreground">{comment.authorName}</strong>
        <time dateTime={new Date(comment.createdAt).toISOString()}>
          {new Date(comment.createdAt).toLocaleString()}
        </time>
      </div>
      <p className="mt-2 text-sm wrap-break-word whitespace-pre-wrap">{comment.body}</p>
    </article>
  );
}
