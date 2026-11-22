import { useQuery } from "@tanstack/react-query";

import { useState } from "react";

import type { WorkspaceReference } from "@/components/messaging/references/entity-reference";
import {
  ReferencePicker as ReferencePickerView,
  type ReferenceKind,
  type ReferenceTab,
} from "@/components/messaging/references/reference-picker";
import type { ReferenceQuery } from "@/components/messaging/references/reference-query";
import { useOrganizationApps } from "@/components/workspace/organization-apps";
import { useSearchDebounce } from "@/hooks/use-search-debounce";
import { searchOptions } from "@/queries/context/search";

// "All" lists the best few of each kind, people first.
const mixedLimit = 5;

export function ReferencePicker({
  organizationId,
  conversationId,
  activeReference,
  onInsert,
  onClose,
}: {
  organizationId: string;
  conversationId: string;
  activeReference: ReferenceQuery;
  onInsert: (token: string, reference: WorkspaceReference) => void;
  onClose: () => void;
}) {
  const parsed = activeReference;
  const apps = useOrganizationApps();
  const mixedKinds: Extract<ReferenceKind, "person" | "agent" | "task" | "project">[] =
    apps.enabled("tasks") ? ["person", "agent", "task", "project"] : ["person", "agent"];
  const kinds: ReferenceTab[] =
    parsed.trigger === "#" ? ["channel", "thread"] : ["all", ...mixedKinds];
  const query = parsed.query;
  const [selection, setSelection] = useState<{ prefix: string; kind: ReferenceTab }>({
    prefix: parsed.kind,
    kind: parsed.kind,
  });
  const selectedKind = selection.prefix === parsed.kind ? selection.kind : parsed.kind;
  const kind = kinds.includes(selectedKind) ? selectedKind : kinds[0]!;
  if (selection.prefix !== parsed.kind) setSelection({ prefix: parsed.kind, kind });
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
      query={query}
      kind={kind}
      kinds={kinds}
      results={debounced.pending ? [] : rows}
      loading={debounced.pending || result.isPending}
      error={debounced.pending ? null : result.error}
      onKindChange={(kind) => setSelection({ prefix: parsed.kind, kind })}
      onRetry={() => {
        if (!debounced.pending) void result.refetch();
      }}
      onInsert={(token, reference) => {
        if (!debounced.pending) onInsert(token, reference);
      }}
      onClose={onClose}
    />
  );
}
