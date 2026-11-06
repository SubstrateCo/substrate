import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Input } from "@startup-os/ui/primitives/input";
import { Button } from "@startup-os/ui/primitives/button";
import { FormMessage } from "@startup-os/ui/auth/form-message";
import { LoadingState } from "@startup-os/ui/feedback/loading-state";
import { ErrorState } from "@startup-os/ui/feedback/error-state";
import { searchOptions } from "@/queries/context/options";
import { attachWork } from "@/api/context";
import { queryKeys } from "@/queries/keys";

export function LinkMessageWork({
  organizationId,
  messageId,
  onClose,
}: {
  organizationId: string;
  messageId: string;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"task" | "project">("task");
  const results = useQuery(searchOptions({ organizationId, query, kind, editable: true }));
  const client = useQueryClient();
  const attach = useMutation({
    mutationFn: (entityId: string) => attachWork({ data: { organizationId, messageId, entityId } }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: queryKeys.organization(organizationId) });
      onClose();
    },
  });
  return (
    <section aria-label="Link existing work" className="space-y-3 rounded-lg border p-3">
      <h3 className="font-semibold">Link existing work</h3>
      <p className="text-xs text-muted-foreground">
        Only people with access can open this item. Linking does not share it.
      </p>
      <div className="flex gap-2">
        <Button size="xs" aria-pressed={kind === "task"} onClick={() => setKind("task")}>
          Tasks
        </Button>
        <Button size="xs" aria-pressed={kind === "project"} onClick={() => setKind("project")}>
          Projects
        </Button>
      </div>
      <Input
        aria-label="Search work to link"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {results.isPending && <LoadingState label="Searching work" variant="compact" />}
      {results.error && (
        <ErrorState compact title="Couldn’t search work" onRetry={() => void results.refetch()} />
      )}
      {!results.error && results.data?.length === 0 && <p>No editable work found.</p>}
      <ul>
        {results.data?.map((item) => (
          <li key={item.id}>
            <Button
              variant="ghost"
              disabled={attach.isPending}
              onClick={() => attach.mutate(item.id)}
            >
              {item.title}
            </Button>
          </li>
        ))}
      </ul>
      <FormMessage
        error={attach.error}
        errorDescription="Couldn’t link this item. Check that you still have access."
      />
      <Button size="xs" variant="outline" onClick={onClose}>
        Cancel
      </Button>
    </section>
  );
}
