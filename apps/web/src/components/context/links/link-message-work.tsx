import { useQuery } from "@tanstack/react-query";

import { useState } from "react";

import {
  LinkMessageWork as LinkMessageWorkView,
  type LinkableWork,
} from "@/components/context/links/link-message-work-view";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { useSearchDebounce } from "@/hooks/use-search-debounce";
import { resourceState } from "@/lib/resource-state";
import { useAttachMessageWork } from "@/queries/context/link-mutations";
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
  const attach = useAttachMessageWork<LinkableWork>(organizationId, messageId);
  const onSuccess = (failures: { item: LinkableWork; error: Error }[], items: LinkableWork[]) => {
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
  };
  return (
    <LinkMessageWorkView
      state={resourceState(results).status}
      query={query}
      kind={kind}
      results={(search.pending ? [] : (resourceState(results).data ?? [])).map((item) => ({
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
        if (items.length) attach.mutate(items, { onSuccess });
      }}
      onClose={onClose}
    />
  );
}
