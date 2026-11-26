import type { CrmActivity } from "@substrate/contracts/crm/activity";

import { useInfiniteQuery } from "@tanstack/react-query";

import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { formatDateTime } from "@/features/records/format";
import { recordQueries } from "@/features/records/queries";
import { DetailSection } from "@/features/records/ui/rows";
import { SectionQuery } from "@/features/records/ui/states";
import type { QueryScope } from "@/queries/keys";
import { History } from "lucide-react-native";

const actionLabels: Record<CrmActivity["action"], string> = {
  created: "created this record",
  updated: "updated",
  stage_changed: "moved the deal",
  owner_changed: "changed the owner",
  discussion_linked: "linked a discussion",
  discussion_unlinked: "unlinked a discussion",
  context_linked: "linked a record",
  context_unlinked: "unlinked a record",
  interaction_created: "logged an interaction",
  interaction_updated: "edited an interaction",
  interaction_deleted: "deleted an interaction",
  follow_up_created: "created a follow-up",
  shared: "shared this record",
  unshared: "removed access",
  archived: "archived this record",
  restored: "restored this record",
};

const fieldLabels: Partial<Record<CrmActivity["changedFields"][number], string>> = {
  displayName: "name",
  givenName: "first name",
  familyName: "last name",
  primaryContact: "primary contact",
  expectedCloseDate: "close date",
  lostReason: "lost reason",
  occurredAt: "time",
  endedAt: "end time",
};

function describe(item: CrmActivity) {
  const base = actionLabels[item.action];
  if (!item.changedFields.length) return base;
  return `${base} ${item.changedFields.map((field) => fieldLabels[field] ?? field).join(", ")}`;
}

/** Who changed the record and when. */
export function CrmActivityLog({ scope, entityId }: { scope: QueryScope; entityId: string }) {
  const query = useInfiniteQuery(recordQueries.crmActivity(scope, entityId));
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <DetailSection title="Activity">
      <SectionQuery
        pending={query.isPending}
        error={query.data ? null : query.error}
        noun="activity"
        onRetry={() => void query.refetch()}
        emptyText={items.length ? null : "No activity yet."}
      >
        <View className="py-1">
          {items.map((item) => (
            <View key={item.id} className="flex-row gap-3 px-4 py-2">
              <Icon as={History} className="mt-0.5 size-3.5 text-muted-foreground" />
              <View className="flex-1">
                <Text className="text-sm">
                  <Text className="text-sm font-medium">{item.actor.displayName}</Text>{" "}
                  {describe(item)}
                </Text>
                <Text className="text-xs text-muted-foreground">
                  {formatDateTime(item.createdAt)}
                </Text>
              </View>
            </View>
          ))}
          {query.hasNextPage ? (
            <Button
              variant="ghost"
              size="sm"
              className="self-start"
              disabled={query.isFetchingNextPage}
              onPress={() => void query.fetchNextPage()}
            >
              <Text>{query.isFetchingNextPage ? "Loading…" : "Show older"}</Text>
            </Button>
          ) : null}
        </View>
      </SectionQuery>
    </DetailSection>
  );
}
