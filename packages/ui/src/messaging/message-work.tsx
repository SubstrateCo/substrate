import { ArrowUpRight, CircleCheck, FolderKanban, Unlink } from "lucide-react";
import { Button } from "../primitives/button";
import { FormMessage } from "../auth/form-message";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";

export type MessageWorkLink = {
  entityId: string;
  entityType: "task" | "project";
  title: string;
  href: string;
  statusName?: string | null;
  purpose: string;
  canRemove: boolean;
};

export function MessageWork({
  links,
  loading = false,
  error,
  onRetry,
  onRemove,
  removing = false,
  removeError,
}: {
  links: MessageWorkLink[];
  loading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
  onRemove?: (entityId: string) => void;
  removing?: boolean;
  removeError?: Error | null;
}) {
  if (!loading && !error && links.length === 0 && !removeError) return null;
  return (
    <section aria-label="Linked work" className="mt-3 max-w-lg space-y-2">
      {loading && <LoadingState label="Loading linked work" variant="compact" />}
      {error && <ErrorState compact title="Couldn’t load linked work" onRetry={onRetry} />}
      {links.map((link) => {
        const Icon = link.entityType === "task" ? CircleCheck : FolderKanban;
        return (
          <div
            key={`${link.entityId}:${link.purpose}`}
            className="flex min-w-0 items-center rounded-lg border bg-card text-card-foreground shadow-surface"
          >
            <div className="flex min-w-0 flex-1 items-center gap-3 p-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <Icon aria-hidden="true" className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span>{link.entityType === "task" ? "Task" : "Project"}</span>
                  <span>·</span>
                  <span>{link.purpose === "source" ? "Created here" : "Linked work"}</span>
                </span>
                <span className="block text-sm font-medium wrap-anywhere">{link.title}</span>
                {link.statusName && (
                  <span className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span aria-hidden="true" className="size-1.5 rounded-full bg-primary" />
                    {link.statusName}
                  </span>
                )}
              </span>
            </div>
            <Button asChild size="icon-xs" variant="ghost" className="mr-2 shrink-0">
              <a
                href={link.href}
                aria-label={`Open ${link.title}`}
                title={`Open ${link.entityType}`}
              >
                <ArrowUpRight aria-hidden="true" className="size-3.5" />
              </a>
            </Button>
            {link.canRemove && onRemove && (
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                className="mr-2 shrink-0"
                aria-label={`Unlink ${link.title}`}
                title="Unlink work"
                disabled={removing}
                onClick={() => onRemove(link.entityId)}
              >
                <Unlink aria-hidden="true" className="size-3.5" />
              </Button>
            )}
          </div>
        );
      })}
      <FormMessage
        error={removeError}
        errorDescription="Couldn’t remove this link. Check that you still have access."
      />
    </section>
  );
}
