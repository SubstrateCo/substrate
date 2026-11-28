import { useQuery } from "@tanstack/react-query";

import { Icon } from "@/components/ui/icon";
import { crmQueries } from "@/features/records/crm/crm-queries";
import { formatDateTime } from "@/features/records/format";
import type { OnOpenConversation } from "@/features/records/types";
import { DetailSection, Row } from "@/features/records/ui/rows";
import { SectionQuery } from "@/features/records/ui/states";
import type { QueryScope } from "@/queries/keys";
import { MessageSquare } from "lucide-react-native";

const purposeLabels = {
  source: "Source",
  mention: "Mention",
  association: "Linked",
  discussion: "Discussion",
} as const;

export function RecordDiscussions({
  scope,
  entityId,
  onOpenConversation,
}: {
  scope: QueryScope;
  entityId: string;
  onOpenConversation?: OnOpenConversation;
}) {
  const query = useQuery(crmQueries.relatedMessages(scope, entityId));
  const rows = query.data ?? [];
  return (
    <DetailSection title="Discussions" count={rows.length || undefined}>
      <SectionQuery
        pending={query.isPending}
        error={query.error}
        noun="discussions"
        onRetry={() => void query.refetch()}
        emptyText={rows.length ? null : "No messages you can read mention this record."}
      >
        {rows.map((row) => (
          <Row
            key={`${row.messageId}:${row.purpose}`}
            title={row.deletedAt ? "Deleted message" : row.body.split("\n")[0] || "Message"}
            subtitle={[
              purposeLabels[row.purpose],
              row.authorName,
              row.conversationName,
              formatDateTime(row.createdAt),
            ]
              .filter(Boolean)
              .join(" · ")}
            leading={<Icon as={MessageSquare} className="size-4 text-muted-foreground" />}
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
