import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ErrorState } from "@startup-os/ui/feedback/error-state";
import { LoadingState } from "@startup-os/ui/feedback/loading-state";
import { isAccessFailure } from "@startup-os/ui/feedback/request-failure";
import { relatedContextOptions } from "@/queries/context/options";
import { messageHref } from "@/lib/context-links";

export function WorkDiscussions({
  organizationId,
  entityId,
  label = "Related context",
  children,
}: {
  organizationId: string;
  entityId: string;
  label?: string;
  children?: ReactNode;
}) {
  const related = useQuery(relatedContextOptions(organizationId, entityId));
  const rows = isAccessFailure(related.error) ? undefined : related.data;
  return (
    <section aria-label={label} className="space-y-3 border-t pt-4">
      <h3 className="font-semibold">{label}</h3>
      {children}
      {related.isPending && <LoadingState label="Loading related context" variant="compact" />}
      {related.error && (
        <ErrorState
          compact
          title="Couldn’t load related context"
          onRetry={() => void related.refetch()}
        />
      )}
      {!related.error && rows?.length === 0 && (
        <p className="text-sm text-muted-foreground">No accessible discussions linked yet.</p>
      )}
      {rows?.map((item) => (
        <div
          key={`${item.messageId}:${item.purpose}`}
          className="space-y-1 rounded-lg border p-3 text-sm"
        >
          <a
            className="font-medium underline"
            href={messageHref(organizationId, item.conversationId, item.messageId)}
          >
            {item.purpose === "source" ? "Created from a discussion" : "Related discussion"} ·{" "}
            {item.conversationName ?? "Direct conversation"}
          </a>
          <p className="text-muted-foreground">
            {item.authorName} · {new Date(item.createdAt).toLocaleString()}
          </p>
          <p className="line-clamp-3 whitespace-pre-wrap wrap-anywhere">
            {item.body.replace(/@\[[^\]]+\]/g, "[Reference]")}
          </p>
        </div>
      ))}
    </section>
  );
}
