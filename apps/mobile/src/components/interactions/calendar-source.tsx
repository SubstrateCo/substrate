import { useQuery } from "@tanstack/react-query";

import { Linking } from "react-native";

import { Text } from "@/components/ui/text";
import { useWorkspaceApps } from "@/features/records/apps";
import { formatDateTime } from "@/features/records/format";
import { calendarRecordURL } from "@/features/records/record-url";
import { recordRequests } from "@/features/records/requests";
import { DetailSection, Row } from "@/features/records/ui/rows";
import { SectionQuery } from "@/features/records/ui/states";
import { captureToast } from "@/lib/toast";
import { queryKeys, type QueryScope } from "@/queries/keys";

export function openCalendarConnection(organizationId: string, entityId: string) {
  const feedback = captureToast();
  try {
    const url = calendarRecordURL(organizationId, entityId, process.env.EXPO_PUBLIC_WEB_URL);
    void Linking.openURL(url).catch(() => feedback.error("Couldn't open the web calendar."));
  } catch {
    feedback.error("Calendar opens on the web. No workspace web address is configured.");
  }
}

export function CalendarSource({
  scope,
  interactionId,
}: {
  scope: QueryScope;
  interactionId: string;
}) {
  const apps = useWorkspaceApps(scope);
  const query = useQuery({
    queryKey: [...queryKeys.detail(scope, "interactions", interactionId), "calendar-source"],
    queryFn: ({ signal }) =>
      recordRequests.interactionSources(scope.organizationId, [interactionId], { signal }),
    enabled: apps.enabled("calendar"),
    retry: false,
  });
  const source = query.data?.[interactionId];
  return (
    <DetailSection title="Source calendar event">
      {!apps.enabled("calendar") ? (
        <Text className="px-4 py-3 text-sm text-muted-foreground">
          Calendar is not enabled in this workspace.
        </Text>
      ) : (
        <SectionQuery
          pending={query.isPending}
          error={query.error}
          noun="source event"
          onRetry={() => void query.refetch()}
          emptyText={source ? null : "The source event was removed or you cannot read it."}
        >
          {source ? (
            <Row
              title={source.title || "Untitled meeting"}
              subtitle={`${formatDateTime(source.startsAt)} · Opens the authorized web calendar`}
              chevron
              onPress={() => openCalendarConnection(scope.organizationId, source.entityId)}
            />
          ) : null}
        </SectionQuery>
      )}
    </DetailSection>
  );
}
