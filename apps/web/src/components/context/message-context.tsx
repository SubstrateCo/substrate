import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@startup-os/ui/primitives/button";
import { FormMessage } from "@startup-os/ui/auth/form-message";
import { ErrorState } from "@startup-os/ui/feedback/error-state";
import { LoadingState } from "@startup-os/ui/feedback/loading-state";
import { messageLinksOptions } from "@/queries/context/options";
import { workHref } from "@/lib/context-links";
import { detachWork } from "@/server/context";
import { queryKeys } from "@/queries/keys";

export function MessageContext({
  organizationId,
  messageId,
}: {
  organizationId: string;
  messageId: string;
}) {
  const links = useQuery(messageLinksOptions(organizationId, messageId));
  const client = useQueryClient();
  const remove = useMutation({
    mutationFn: (entityId: string) => detachWork({ data: { organizationId, messageId, entityId } }),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.organization(organizationId) }),
  });
  return (
    <div className="mt-2 space-y-2">
      {links.isPending && <LoadingState label="Loading linked work" variant="compact" />}
      {links.error && (
        <ErrorState
          compact
          title="Couldn’t load linked work"
          onRetry={() => void links.refetch()}
        />
      )}
      {!links.error &&
        links.data?.map((link) => (
          <div
            key={`${link.entityId}:${link.purpose}`}
            className="flex flex-wrap items-center gap-2 text-xs"
          >
            <a
              className="rounded border bg-accent px-2 py-1 underline"
              href={workHref(
                organizationId,
                link.projectEntityId,
                link.entityType === "task" ? link.entityId : undefined,
              )}
            >
              {link.title}
              {link.statusName ? ` · ${link.statusName}` : ""}
            </a>
            <span>{link.purpose === "source" ? "Created here" : "Linked work"}</span>
            {link.canRemove && (
              <Button
                size="xs"
                variant="ghost"
                disabled={remove.isPending}
                onClick={() => remove.mutate(link.entityId)}
              >
                Unlink {link.title}
              </Button>
            )}
          </div>
        ))}
      <FormMessage
        error={remove.error}
        errorDescription="Couldn’t remove this link. Check that you still have access."
      />
    </div>
  );
}
