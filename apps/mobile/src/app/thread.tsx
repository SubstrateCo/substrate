import { useState } from "react";
import { View } from "react-native";

import { useAuth } from "@/auth/provider";
import { AuthScreen } from "@/components/auth";
import { LoadingScreen } from "@/components/layout/loading-screen";
import { RecordPanel } from "@/components/layout/record-panel";
import { ThreadScreen } from "@/components/messaging";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { SourceMessageActionSheet } from "@/components/workspace/source-message-action";
import type { MessageSource } from "@/features/messaging/types";
import { firstParam } from "@/lib/navigation";
import { useRecordNavigation } from "@/lib/use-record-navigation";
import { Redirect, router, useLocalSearchParams } from "expo-router";

export default function ThreadRoute() {
  const auth = useAuth();
  const [sourceAction, setSourceAction] = useState<MessageSource>();
  const params = useLocalSearchParams<{
    organizationId?: string;
    conversationId?: string;
    threadId?: string;
  }>();
  const records = useRecordNavigation();
  const organizationId = firstParam(params.organizationId);
  const conversationId = firstParam(params.conversationId);
  const threadId = firstParam(params.threadId);

  function backToConversation() {
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: "/", params: { conversationId, tab: "messages" } });
  }

  if (auth.isPending) return <LoadingScreen />;
  if (!auth.session) return <AuthScreen onAuthenticated={() => auth.refresh()} />;
  if (!auth.session.user.emailVerified) {
    return <AuthScreen mode="verify" email={auth.session.user.email} />;
  }
  if (organizationId && auth.session.session.activeOrganizationId !== organizationId) {
    return (
      <Redirect
        href={{
          pathname: "/",
          params: { workspaceId: organizationId, conversationId, messageId: threadId },
        }}
      />
    );
  }
  if (!organizationId || !conversationId || !threadId) {
    return (
      <View className="flex-1 justify-center gap-4 bg-background px-6">
        <Text className="text-lg font-semibold">This thread link is incomplete</Text>
        <Button onPress={backToConversation}>
          <Text>Back to messages</Text>
        </Button>
      </View>
    );
  }
  return (
    <>
      <ThreadScreen
        organizationId={organizationId}
        conversationId={conversationId}
        threadId={threadId}
        onBack={backToConversation}
        onOpenRecord={(record) => records.openRecord(record)}
        onCreateFromMessage={setSourceAction}
        onOpenConversation={(destination) => {
          if (destination.threadId) {
            router.push({
              pathname: "/thread",
              params: {
                organizationId,
                conversationId: destination.conversationId,
                threadId: destination.threadId,
              },
            });
          } else {
            router.push({
              pathname: "/",
              params: { tab: "messages", conversationId: destination.conversationId },
            });
          }
        }}
      />
      {records.target && (
        <RecordPanel
          organizationId={organizationId}
          target={records.target}
          onOpenRecord={(record) => records.openRecord(record)}
          onClose={() => records.closeRecord()}
          onOpenConversation={(id, messageId) => {
            records.clearRecords();
            router.push({
              pathname: "/",
              params: { tab: "messages", conversationId: id, messageId },
            });
          }}
        />
      )}
      {sourceAction && (
        <SourceMessageActionSheet
          key={`${sourceAction.kind}:${sourceAction.messageId}`}
          source={sourceAction}
          onClose={() => setSourceAction(undefined)}
          onOpenRecord={(record) => records.openRecord(record)}
          onOpenConversation={(id, messageId) => {
            setSourceAction(undefined);
            router.push({
              pathname: "/",
              params: { tab: "messages", conversationId: id, messageId },
            });
          }}
        />
      )}
    </>
  );
}
