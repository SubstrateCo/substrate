import { useQuery } from "@tanstack/react-query";

import { useState } from "react";

import { mixedKinds, mixedLimit, referenceSearchInput } from "./reference-search";
import { narrowedSuggestions } from "./reference-suggestions";
import type { WorkspaceReference } from "@/components/messaging/references/entity-reference";
import {
  ReferencePickerView,
  type ReferenceTab,
} from "@/components/messaging/references/reference-picker-view";
import type { ReferenceQuery } from "@/components/messaging/references/reference-query";
import { useOrganizationApps } from "@/components/workspace/organization-apps-context";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { useSearchDebounce } from "@/hooks/use-search-debounce";
import { searchOptions } from "@/queries/context/search";

export function ReferencePicker({
  conversationId,
  activeReference,
  onInsert,
}: {
  conversationId: string;
  activeReference: ReferenceQuery;
  onInsert: (token: string, reference: WorkspaceReference) => void;
}) {
  const { organizationId } = useWorkspaceScope();
  const apps = useOrganizationApps();
  const tasks = apps.enabled("tasks");
  const mixed = mixedKinds(tasks);
  const kinds: ReferenceTab[] =
    activeReference.trigger === "#" ? ["channel", "thread"] : ["all", ...mixed];
  const query = activeReference.query;
  const [selection, setSelection] = useState<{ prefix: string; kind: ReferenceTab }>({
    prefix: activeReference.kind,
    kind: activeReference.kind,
  });
  // A new typed prefix ("@task:") replaces the tab the person picked.
  if (selection.prefix !== activeReference.kind)
    setSelection({ prefix: activeReference.kind, kind: activeReference.kind });
  const kind = kinds.includes(selection.kind) ? selection.kind : kinds[0]!;
  const rowKinds = kind === "all" ? mixed : [kind];
  // Only typing waits. A tab switch searches the settled text at once.
  const debounced = useSearchDebounce(query, JSON.stringify([organizationId, conversationId]));
  const result = useQuery({
    ...searchOptions(
      referenceSearchInput({ organizationId, conversationId, query: debounced.query }, kind, tasks),
    ),
    enabled: apps.ready && !debounced.pending,
    // A cached answer for this text shows at once. Otherwise the last answer, narrowed to rows
    // that still match, stays up until this one arrives.
    placeholderData: (previous) => narrowedSuggestions(previous, rowKinds, query),
  });
  const rows = (result.data ?? []).flatMap((row) => {
    const rowKind = rowKinds.find((item) => item === row.kind);
    return rowKind ? [{ ...row, kind: rowKind }] : [];
  });
  const settled = !debounced.pending && !!result.data && !result.isPlaceholderData;
  const error = debounced.pending ? null : result.error;
  return (
    <ReferencePickerView
      // A new query starts at the best option.
      key={query}
      query={query}
      kind={kind}
      kinds={kinds}
      results={rows}
      loading={!settled && !error && rows.length === 0}
      error={error}
      truncatedKinds={
        settled && kind === "all"
          ? mixed.filter((type) => rows.filter((row) => row.kind === type).length >= mixedLimit)
          : []
      }
      onKindChange={(kind) => setSelection({ prefix: activeReference.kind, kind })}
      onRetry={() => {
        if (!debounced.pending) void result.refetch();
      }}
      onInsert={onInsert}
    />
  );
}
