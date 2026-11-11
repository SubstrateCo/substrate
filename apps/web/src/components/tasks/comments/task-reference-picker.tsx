import { useQueries } from "@tanstack/react-query";

import { useState, type ComponentProps } from "react";

import { assignableActors } from "../assignee/assignable";
import type { ProjectDetail } from "../types";
import type { WorkspaceReference } from "@/components/messaging/references/entity-reference";
import {
  ReferencePicker,
  type ReferenceTab,
} from "@/components/messaging/references/reference-picker";
import type { ReferenceQuery } from "@/components/messaging/references/reference-query";
import { useSearchDebounce } from "@/hooks/use-search-debounce";
import { searchOptions } from "@/queries/context/search";

type Row = ComponentProps<typeof ReferencePicker>["results"][number];

const kinds = ["all", "person", "agent", "task", "project"] as const;
const workKinds = ["task", "project"] as const;
const mixedLimit = 5;

/**
 * The reference picker for a task comment. People and agents come from the project, because a
 * mentioned person must be able to open the task. Tasks and projects come from workspace search.
 */
export function TaskReferencePicker({
  organizationId,
  detail,
  activeReference,
  onInsert,
  onClose,
}: {
  organizationId: string;
  detail: ProjectDetail;
  activeReference: ReferenceQuery;
  onInsert: (token: string, reference: WorkspaceReference) => void;
  onClose: () => void;
}) {
  const { query } = activeReference;
  const [selection, setSelection] = useState<{ prefix: string; kind: ReferenceTab }>({
    prefix: activeReference.kind,
    kind: activeReference.kind,
  });
  const kind = selection.prefix === activeReference.kind ? selection.kind : activeReference.kind;
  if (selection.prefix !== activeReference.kind)
    setSelection({ prefix: activeReference.kind, kind });
  const debounced = useSearchDebounce(
    query,
    JSON.stringify([organizationId, detail.project.entityId, kind]),
  );
  const mixed = kind === "all";
  const searchKinds = workKinds.filter((candidate) => mixed || candidate === kind);
  const searches = useQueries({
    queries: searchKinds.map((searchKind) => ({
      ...searchOptions({
        organizationId,
        query: debounced.query,
        kind: searchKind,
        limit: mixed ? mixedLimit : undefined,
      }),
      enabled: !debounced.pending,
    })),
  });
  const needle = query.trim().toLowerCase();
  const actors = assignableActors(detail)
    .filter((actor) => actor.name.toLowerCase().includes(needle))
    .map((actor): Row => ({
      id: actor.entityId,
      kind: actor.type === "agent" ? "agent" : "person",
      title: actor.name,
      image: actor.image,
    }))
    .filter((actor) => mixed || actor.kind === kind);
  const work = searches.flatMap((result, index) =>
    (result.data ?? [])
      .slice(0, mixed ? mixedLimit : undefined)
      .map((row): Row => ({ ...row, kind: searchKinds[index]! })),
  );
  const loading = !!searchKinds.length && (debounced.pending || searches.some((s) => s.isPending));
  return (
    <ReferencePicker
      query={query}
      kind={kind}
      kinds={kinds}
      results={[...(mixed ? actors.slice(0, mixedLimit * 2) : actors), ...(loading ? [] : work)]}
      // People are local, so they show while tasks and projects load.
      loading={loading && !actors.length}
      error={loading ? null : (searches.find((result) => result.error)?.error ?? null)}
      onKindChange={(next) => setSelection({ prefix: activeReference.kind, kind: next })}
      onRetry={() => {
        if (!debounced.pending) for (const result of searches) void result.refetch();
      }}
      onInsert={onInsert}
      onClose={onClose}
    />
  );
}
