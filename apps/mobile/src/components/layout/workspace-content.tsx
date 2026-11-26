import { useQuery } from "@tanstack/react-query";

import { useState } from "react";
import { View } from "react-native";

import { LoadingScreen } from "./loading-screen";
import { RecordPanel } from "./record-panel";
import { WorkspaceShell, type WorkspaceTab } from "./workspace-shell";
import { api } from "@/api/client";
import { readResult } from "@/api/result";
import { NavigationSurface } from "@/components/gestures/navigation-surface";
import { ConversationList, MessagingScreen } from "@/components/messaging";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { SourceMessageActionSheet } from "@/components/workspace/source-message-action";
import type { MessageSource } from "@/features/messaging/types";
import type { MessagingConversationTarget } from "@/features/messaging/types";
import { CrmScreen, TasksScreen } from "@/features/records";
import { firstParam, type RecordTarget } from "@/lib/navigation";
import { useRecordNavigation } from "@/lib/use-record-navigation";
import { queryKeys } from "@/queries/keys";
import { router, useLocalSearchParams } from "expo-router";

type WorkspaceContentProps = {
  organizationId: string;
  userId: string;
  workspaceName: string;
  onWorkspaceMenu: () => void;
};

export function WorkspaceContent({
  organizationId,
  userId,
  workspaceName,
  onWorkspaceMenu,
}: WorkspaceContentProps) {
  const params = useLocalSearchParams<{
    conversationId?: string;
    messageId?: string;
    tab?: string;
    record?: string;
  }>();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sourceAction, setSourceAction] = useState<MessageSource>();
  const records = useRecordNavigation();
  const tabParam = firstParam(params.tab);
  const tab: WorkspaceTab = tabParam === "tasks" || tabParam === "crm" ? tabParam : "messages";
  const conversationId = firstParam(params.conversationId);
  const apps = useQuery({
    queryKey: queryKeys.detail({ userId, organizationId }, "organizations", "apps"),
    queryFn: ({ signal }) =>
      readResult(api.organizations.apps.$get({ query: { organizationId } }, { init: { signal } })),
    retry: false,
  });

  function openRecord(record: RecordTarget) {
    setDrawerOpen(false);
    records.openRecord(record);
  }

  function selectConversation(id: string) {
    setDrawerOpen(false);
    records.clearRecords();
    router.setParams({
      conversationId: id,
      tab: "messages",
      record: undefined,
      messageId: undefined,
    });
  }

  function showThread(threadId: string, resolvedConversationId = conversationId) {
    if (!resolvedConversationId) return;
    router.push({
      pathname: "/thread",
      params: { organizationId, conversationId: resolvedConversationId, threadId },
    });
  }

  function openConversation(destination: MessagingConversationTarget) {
    if (destination.threadId) {
      showThread(destination.threadId, destination.conversationId);
    } else {
      router.push({
        pathname: "/",
        params: { tab: "messages", conversationId: destination.conversationId },
      });
    }
  }

  const enabled = tab !== "tasks" || apps.data?.enabledApps.includes("tasks");
  let content;
  if (apps.isPending) {
    content = <LoadingScreen />;
  } else if (apps.isError) {
    content = (
      <View className="flex-1 items-start justify-center gap-4 px-6">
        <Text className="text-lg font-semibold">Couldn’t open this workspace</Text>
        <Text className="text-muted-foreground">{apps.error.message}</Text>
        <Button variant="outline" onPress={() => apps.refetch()}>
          <Text>Try again</Text>
        </Button>
      </View>
    );
  } else if (!enabled) {
    content = (
      <View className="flex-1 justify-center gap-2 px-6">
        <Text className="text-lg font-semibold">This app isn’t enabled</Text>
        <Text className="text-muted-foreground">Ask a workspace administrator to enable it.</Text>
      </View>
    );
  } else if (tab === "tasks") {
    content = <TasksScreen organizationId={organizationId} onOpenRecord={openRecord} />;
  } else if (tab === "crm") {
    content = (
      <CrmScreen
        organizationId={organizationId}
        onOpenRecord={openRecord}
        crmEnabled={apps.data.enabledApps.includes("crm")}
      />
    );
  } else {
    content = (
      <MessagingScreen
        organizationId={organizationId}
        conversationId={conversationId}
        targetMessageId={firstParam(params.messageId)}
        onOpenConversations={() => setDrawerOpen(true)}
        onOpenThread={showThread}
        onOpenRecord={openRecord}
        onOpenConversation={openConversation}
        onCreateFromMessage={setSourceAction}
      />
    );
  }

  return (
    <>
      <WorkspaceShell
        workspaceName={workspaceName}
        onBack={router.canGoBack() ? () => router.back() : undefined}
        tab={tab}
        onTab={(nextTab) => {
          records.clearRecords();
          router.setParams({ tab: nextTab });
        }}
        onOpenConversations={() => setDrawerOpen(true)}
        onWorkspaceMenu={onWorkspaceMenu}
        blocked={drawerOpen || !!records.target || !!sourceAction}
        tasksEnabled={apps.data?.enabledApps.includes("tasks") ?? false}
        crmEnabled={apps.data?.enabledApps.includes("crm") ?? false}
      >
        {content}
      </WorkspaceShell>
      {drawerOpen && (
        <NavigationSurface side="left" onClose={() => setDrawerOpen(false)}>
          {(close) => (
            <ConversationList
              organizationId={organizationId}
              selectedId={conversationId}
              onSelect={(id) => close(() => selectConversation(id))}
              onClose={() => close()}
            />
          )}
        </NavigationSurface>
      )}
      {records.target && (
        <RecordPanel
          organizationId={organizationId}
          target={records.target}
          onOpenRecord={openRecord}
          onClose={() => records.closeRecord()}
          onOpenConversation={(id, messageId) => {
            records.clearRecords();
            router.setParams({ tab: "messages", conversationId: id, messageId });
          }}
        />
      )}
      {sourceAction && (
        <SourceMessageActionSheet
          key={`${sourceAction.kind}:${sourceAction.messageId}`}
          source={sourceAction}
          onClose={() => setSourceAction(undefined)}
          onOpenRecord={openRecord}
          onOpenConversation={(id, messageId) => {
            setSourceAction(undefined);
            router.setParams({ tab: "messages", conversationId: id, messageId });
          }}
        />
      )}
    </>
  );
}
