import type { CrmTimelineMode } from "@substrate/contracts/crm/input";

import { useInfiniteQuery } from "@tanstack/react-query";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { crmQueries } from "@/features/records/crm-queries";
import { formatDateTime, interactionKindLabels } from "@/features/records/format";
import type { OnOpenRecord } from "@/features/records/types";
import { DetailSection, Row, Segments } from "@/features/records/ui/rows";
import { SectionQuery } from "@/features/records/ui/states";
import type { QueryScope } from "@/queries/keys";

export function InteractionRollup({
  scope,
  entityId,
  kind,
  onOpenRecord,
}: {
  scope: QueryScope;
  entityId: string;
  kind: "account" | "deal";
  onOpenRecord: OnOpenRecord;
}) {
  const [mode, setMode] = useState<CrmTimelineMode>(kind === "deal" ? "linked" : "participants");
  const query = useInfiniteQuery(crmQueries.timeline(scope, entityId, mode));
  const rows = query.data?.pages.flat() ?? [];
  return (
    <DetailSection title="Customer interactions" count={rows.length || undefined}>
      <Segments
        label="Interaction scope"
        value={mode}
        onChange={setMode}
        options={[
          { value: "linked", label: "Explicitly linked" },
          { value: "participants", label: "Related contacts" },
        ]}
      />
      <Text className="px-4 py-2 text-xs text-muted-foreground">
        {mode === "linked"
          ? "Interactions explicitly linked to this record."
          : "Readable interactions from related contacts and explicit links. A touch does not mean it advanced this deal."}
      </Text>
      <SectionQuery
        pending={query.isPending}
        error={query.error}
        noun="customer interactions"
        onRetry={() => void query.refetch()}
        emptyText={rows.length ? null : "No interactions in this view."}
      >
        {rows.map((row) => (
          <Row
            key={row.entityId}
            title={row.summary}
            subtitle={`${interactionKindLabels[row.kind]} · ${formatDateTime(row.occurredAt)}`}
            chevron
            onPress={() => onOpenRecord({ kind: "interaction", id: row.entityId })}
          />
        ))}
        {query.hasNextPage ? (
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            disabled={query.isFetchingNextPage}
            onPress={() => void query.fetchNextPage()}
          >
            <Text>{query.isFetchingNextPage ? "Loading…" : "Show older interactions"}</Text>
          </Button>
        ) : null}
      </SectionQuery>
    </DetailSection>
  );
}
