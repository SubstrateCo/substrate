import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useState } from "react";

import { attachWork } from "@/api/context/links";
import {
  LinkMessageWork as LinkMessageWorkView,
  type LinkableWork,
} from "@/components/context/links/link-message-work-view";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { useSearchDebounce } from "@/hooks/use-search-debounce";
import { invalidateMessageWork } from "@/queries/context/mutations";
import { searchOptions } from "@/queries/context/search";
import { projectsQueryOptions } from "@/queries/tasks/options";
import { toast } from "sonner";

export function LinkMessageWork({
  organizationId,
  messageId,
  linkedIds,
  onClose,
}: {
  organizationId: string;
  messageId: string;
  linkedIds: string[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"task" | "project">("task");
  const search = useSearchDebounce(query, JSON.stringify([organizationId, kind]));
  const results = useQuery({
    ...searchOptions({ organizationId, query: search.query, kind, editable: true }),
    enabled: !search.pending,
  });
  const projects = useQuery({ ...projectsQueryOptions(organizationId), enabled: kind === "task" });
  const projectNames = new Map(
    (projects.data ?? []).map((project) => [project.entityId, project.name]),
  );
  const client = useQueryClient();
  const attach = useMutation({
    // The API links one item per request. Each request settles on its own, so earlier links stay.
    mutationFn: async (items: LinkableWork[]) => {
      const settled = await Promise.allSettled(
        items.map((item) => attachWork({ data: { organizationId, messageId, entityId: item.id } })),
      );
      const failures: { item: LinkableWork; error: Error }[] = [];
      const refreshes: Promise<unknown>[] = [];
      items.forEach((item, index) => {
        const result = settled[index]!;
        if (result.status === "fulfilled")
          refreshes.push(
            invalidateMessageWork(client, organizationId, messageId, item.id, item.projectEntityId),
          );
        else
          failures.push({
            item,
            error:
              result.reason instanceof Error ? result.reason : new Error(String(result.reason)),
          });
      });
      await Promise.all(refreshes);
      return failures;
    },
    onSuccess: (failures, items) => {
      if (!failures.length) {
        toast.success(items.length === 1 ? "Linked 1 item." : `Linked ${items.length} items.`);
        onClose();
        return;
      }
      const names = failures.map(({ item }) => `“${item.title}”`).join(", ");
      toast.error(
        actionErrorMessage(
          failures[0]!.error,
          `Couldn’t link ${names}. Check that you still have access.`,
        ),
      );
    },
  });
  return (
    <LinkMessageWorkView
      query={query}
      kind={kind}
      results={(search.pending ? [] : (results.data ?? [])).map((item) => ({
        id: item.id,
        kind,
        title: item.title,
        projectEntityId: item.projectEntityId ?? item.id,
        projectName:
          kind === "task" && item.projectEntityId
            ? projectNames.get(item.projectEntityId)
            : undefined,
      }))}
      linkedIds={new Set(linkedIds)}
      loading={search.pending || results.isPending}
      error={search.pending ? null : results.error}
      pending={attach.isPending}
      onQueryChange={setQuery}
      onKindChange={setKind}
      onRetry={() => {
        if (!search.pending) void results.refetch();
      }}
      onLink={(items) => {
        if (items.length) attach.mutate(items);
      }}
      onClose={onClose}
    />
  );
}
