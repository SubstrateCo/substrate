import { useState } from "react";
import { View } from "react-native";

import { SourceTaskForm } from "@/components/tasks/source-task-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Text } from "@/components/ui/text";
import type { MessageSource } from "@/features/messaging/types";
import { MessageToCrmSheet, PublishInteractionSheet } from "@/features/records";
import type { RecordTarget } from "@/lib/navigation";

export function SourceMessageActionSheet({
  source,
  onClose,
  onOpenRecord,
  onOpenConversation,
}: {
  source: MessageSource;
  onClose: () => void;
  onOpenRecord: (record: RecordTarget) => void;
  onOpenConversation: (conversationId: string, messageId?: string) => void;
}) {
  const [crmKind, setCrmKind] = useState<"account" | "contact" | "deal">();
  function created(record: RecordTarget) {
    onClose();
    onOpenRecord(record);
  }

  if (source.kind === "task") {
    return (
      <SourceTaskForm
        organizationId={source.organizationId}
        messageId={source.messageId}
        onOpenRecord={created}
        onClose={onClose}
      />
    );
  }
  if (source.kind === "interaction") {
    return (
      <PublishInteractionSheet
        organizationId={source.organizationId}
        messageId={source.messageId}
        onOpenConversation={onOpenConversation}
        onClose={onClose}
        onPublished={(id) => created({ kind: "interaction", id })}
      />
    );
  }
  if (crmKind) {
    return (
      <MessageToCrmSheet
        organizationId={source.organizationId}
        messageId={source.messageId}
        kind={crmKind}
        onCreated={created}
        onClose={onClose}
      />
    );
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create CRM record</DialogTitle>
          <DialogDescription>
            Choose what this message is about. Its source will stay linked.
          </DialogDescription>
        </DialogHeader>
        <View className="gap-2">
          <Button variant="outline" onPress={() => setCrmKind("contact")}>
            <Text>Contact</Text>
          </Button>
          <Button variant="outline" onPress={() => setCrmKind("account")}>
            <Text>Account</Text>
          </Button>
          <Button variant="outline" onPress={() => setCrmKind("deal")}>
            <Text>Deal</Text>
          </Button>
        </View>
      </DialogContent>
    </Dialog>
  );
}
