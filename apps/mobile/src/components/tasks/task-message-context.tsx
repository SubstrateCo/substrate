import { useQuery } from "@tanstack/react-query";

import { recordRequests } from "@/features/records/requests";
import { DetailSection, Row } from "@/features/records/ui/rows";
import { SectionQuery } from "@/features/records/ui/states";
import { queryKeys, type QueryScope } from "@/queries/keys";

const labels = {
  source: "Source",
  mention: "Mention",
  association: "Linked",
  discussion: "Discussion",
};

export function TaskMessageContext({
  scope,
  entityId,
  onOpenConversation,
}: {
  scope: QueryScope;
  entityId: string;
  onOpenConversation?: (conversationId: string, messageId?: string) => void;
}) {
  const query = useQuery({
    queryKey: [...queryKeys.detail(scope, "tasks", entityId), "related-messages"],
    queryFn: ({ signal }) =>
      recordRequests.relatedMessages(
        { organizationId: scope.organizationId, entityId },
        { signal },
      ),
    retry: false,
  });
  const rows = query.error ? [] : (query.data ?? []);
  return (
    <DetailSection title="Related messages" count={rows.length || undefined}>
      <SectionQuery
        pending={query.isPending}
        error={query.error}
        noun="related messages"
        onRetry={() => void query.refetch()}
        emptyText={rows.length ? null : "No messages you can read reference this record."}
      >
        {rows.map((row) => (
          <Row
            key={`${row.messageId}:${row.purpose}`}
            title={row.deletedAt ? "Deleted message" : row.body.split("\n")[0] || "Message"}
            subtitle={[labels[row.purpose], row.authorName, row.conversationName]
              .filter(Boolean)
              .join(" · ")}
            chevron={!!onOpenConversation}
            onPress={
              onOpenConversation
                ? () => onOpenConversation(row.conversationId, row.messageId)
                : undefined
            }
          />
        ))}
      </SectionQuery>
    </DetailSection>
  );
}
