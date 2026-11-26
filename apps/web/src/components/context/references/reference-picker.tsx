import { useQuery } from "@tanstack/react-query";

import { useState } from "react";

import type { WorkspaceReference } from "@/components/messaging/references/entity-reference";
import {
  ReferencePickerView,
  type ReferenceKind,
  type ReferenceTab,
} from "@/components/messaging/references/reference-picker-view";
import type { ReferenceQuery } from "@/components/messaging/references/reference-query";
import { useOrganizationApps } from "@/components/workspace/organization-apps-context";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { useSearchDebounce } from "@/hooks/use-search-debounce";
import { searchOptions } from "@/queries/context/search";

// "All" lists the best few of each kind, people first.
const mixedLimit = 5;

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
  const mixedKinds: Extract<ReferenceKind, "person" | "agent" | "task" | "project">[] =
    apps.enabled("tasks") ? ["person", "agent", "task", "project"] : ["person", "agent"];
  const kinds: ReferenceTab[] =
    activeReference.trigger === "#" ? ["channel", "thread"] : ["all", ...mixedKinds];
  const query = activeReference.query;
  const [selection, setSelection] = useState<{ prefix: string; kind: ReferenceTab }>({
    prefix: activeReference.kind,
    kind: activeReference.kind,
  });
  // A new typed prefix ("@task:") replaces the tab the person picked.
  if (selection.prefix !== activeReference.kind)
    setSelection({ prefix: activeReference.kind, kind: activeReference.kind });
  const kind = kinds.includes(selection.kind) ? selection.kind : kinds[0]!;
  const debounced = useSearchDebounce(
    query,
    JSON.stringify([organizationId, conversationId, kind]),
  );
  // "All" asks for each kind's first page in one request; the server groups them in this order.
  const result = useQuery({
    ...searchOptions({
      organizationId,
      conversationId,
      query: debounced.query,
      ...(kind === "all" ? { kinds: mixedKinds, limit: mixedLimit } : { kind }),
    }),
    enabled: apps.ready && !debounced.pending,
  });
  const rows = (result.data ?? []).flatMap((row) => {
    const rowKind = kind === "all" ? mixedKinds.find((mixed) => mixed === row.kind) : kind;
    return rowKind ? [{ ...row, kind: rowKind }] : [];
  });
  return (
    <ReferencePickerView
      // A new query starts at the first option.
      key={query}
      query={query}
      kind={kind}
      kinds={kinds}
      results={debounced.pending ? [] : rows}
      loading={debounced.pending || result.isPending}
      error={debounced.pending ? null : result.error}
      onKindChange={(kind) => setSelection({ prefix: activeReference.kind, kind })}
      onRetry={() => {
        if (!debounced.pending) void result.refetch();
      }}
      onInsert={(token, reference) => {
        if (!debounced.pending) onInsert(token, reference);
      }}
    />
  );
}
