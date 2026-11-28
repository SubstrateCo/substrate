import { attachedWork } from "@substrate/contracts/messaging/references";

import { useState } from "react";
import { Platform, Share } from "react-native";

import { LinkRecordSheet } from "./link-record-sheet";
import { LinkedWorkList } from "./linked-work-list";
import { MessageActionsSheet, type MessageAction } from "./message-actions-sheet";
import { MessageAttachments } from "./message-attachments";
import { MessageBody } from "./message-body";
import { MessageEditSheet } from "./message-edit-sheet";
import { MessageReactions } from "./message-reactions";
import { MessageRow } from "./message-row";
import { ReactionPeopleSheet } from "./reaction-people-sheet";
import { ReactionPicker } from "./reaction-picker";
import { useMessageMutations } from "@/features/messaging/queries/use-message-mutations";
import { useMessagingApps } from "@/features/messaging/queries/use-reference-search";
import {
  linkedWorkTarget,
  referenceLabels,
  resolveReferences,
  type ResolvedReference,
} from "@/features/messaging/references/resolve-references";
import { displayText, partsFromBody } from "@/features/messaging/references/token-draft";
import type {
  Message,
  MessageContext,
  MessageSource,
  MessagingConversationTarget,
} from "@/features/messaging/types";
import { ConfirmSheet } from "@/features/records/ui/sheet";
import { ErrorState } from "@/features/records/ui/states";
import type { RecordTarget } from "@/lib/navigation";
import { captureToast } from "@/lib/toast";
import * as Clipboard from "expo-clipboard";
import {
  Building2,
  Copy,
  Link2,
  ListTodo,
  MessageSquareReply,
  MessagesSquare,
  Pencil,
  Share as ShareIcon,
  Trash2,
} from "lucide-react-native";

export type MessageNavigation = {
  onOpenRecord: (target: RecordTarget) => void;
  onOpenThread?: (threadId: string) => void;
  onOpenConversation?: (target: MessagingConversationTarget) => void;
  onOpenProfile: (actorId: string) => void;
  onCreateFromMessage?: (source: MessageSource) => void;
};

type Panel =
  | { kind: "actions" | "edit" | "delete" | "link" | "reaction-picker" }
  | { kind: "reactions"; emoji: string };

export function MessageItem({
  organizationId,
  conversationId,
  message,
  context,
  contextLoading,
  contextError,
  grouped,
  highlighted = false,
  canPost,
  navigation,
}: {
  organizationId: string;
  conversationId: string;
  message: Message;
  context?: MessageContext;
  contextLoading: boolean;
  contextError?: Error | null;
  grouped: boolean;
  highlighted?: boolean;
  canPost: boolean;
  navigation: MessageNavigation;
}) {
  const [panel, setPanel] = useState<Panel>();
  const { edit, remove, react, unlink } = useMessageMutations(organizationId, message.id);
  const references = resolveReferences(context);
  const deleted = !!message.deletedAt;
  const isRoot = !message.threadId;
  const apps = useMessagingApps(organizationId);
  const readable = deleted
    ? ""
    : displayText(partsFromBody(message.body, referenceLabels(references))).trim();

  const canOpen = (reference: ResolvedReference) => {
    const destination = reference.destination;
    if (!destination) return false;
    if (destination.type !== "conversation") return true;
    const { target } = destination;
    if (target.conversationId === conversationId)
      return !!target.threadId && !!navigation.onOpenThread;
    return !!navigation.onOpenConversation;
  };
  const open = (reference: ResolvedReference) => {
    const destination = reference.destination;
    if (!destination) return;
    if (destination.type === "record") navigation.onOpenRecord(destination.target);
    else if (destination.type === "profile") navigation.onOpenProfile(destination.actorId);
    else if (destination.target.conversationId === conversationId) {
      if (destination.target.threadId) navigation.onOpenThread?.(destination.target.threadId);
    } else navigation.onOpenConversation?.(destination.target);
  };

  const actions: MessageAction[] = [];
  if (isRoot && navigation.onOpenThread && !deleted)
    actions.push({
      label: "Reply in thread",
      icon: MessageSquareReply,
      onPress: () => navigation.onOpenThread?.(message.id),
    });
  const create = navigation.onCreateFromMessage;
  if (create && !deleted) {
    const source = { organizationId, conversationId, messageId: message.id };
    if (apps.enabled("tasks"))
      actions.push({
        label: "Create task",
        icon: ListTodo,
        onPress: () => create({ ...source, kind: "task" }),
      });
    if (apps.enabled("crm")) {
      actions.push({
        label: "Create CRM record",
        icon: Building2,
        onPress: () => create({ ...source, kind: "crm" }),
      });
      actions.push({
        label: "Log as interaction",
        icon: MessagesSquare,
        onPress: () => create({ ...source, kind: "interaction" }),
      });
    }
  }
  if (canPost && !deleted)
    actions.push({
      label: "Link existing record",
      icon: Link2,
      onPress: () => setPanel({ kind: "link" }),
    });
  if (readable)
    actions.push({
      label: "Copy text",
      icon: Copy,
      onPress: () => {
        const feedback = captureToast();
        void Clipboard.setStringAsync(readable).then(
          () => feedback.success("Copied"),
          () => feedback.error("Couldn't copy text"),
        );
      },
    });
  if (Platform.OS !== "web" && readable)
    actions.push({
      label: "Share text",
      icon: ShareIcon,
      onPress: () => void Share.share({ message: readable }).catch(() => undefined),
    });
  if (message.canModify) {
    actions.push({
      label: "Edit message",
      icon: Pencil,
      onPress: () => setPanel({ kind: "edit" }),
    });
    actions.push({
      label: "Delete message",
      icon: Trash2,
      destructive: true,
      onPress: () => setPanel({ kind: "delete" }),
    });
  }
  const canReact = !deleted && canPost;
  const hasActions = canReact || actions.length > 0;
  const reacted = new Set(
    message.reactions.filter((reaction) => reaction.reacted).map((reaction) => reaction.emoji),
  );

  return (
    <>
      <MessageRow
        message={message}
        grouped={grouped}
        highlighted={highlighted}
        onActions={hasActions ? () => setPanel({ kind: "actions" }) : undefined}
        onAuthor={
          message.authorActorEntityId
            ? () => navigation.onOpenProfile(message.authorActorEntityId!)
            : undefined
        }
        onThread={
          isRoot && navigation.onOpenThread
            ? () => navigation.onOpenThread?.(message.id)
            : undefined
        }
      >
        {message.body ? (
          <MessageBody
            body={message.body}
            references={references}
            loading={contextLoading}
            canOpen={canOpen}
            onOpen={open}
          />
        ) : null}
        <MessageAttachments
          attachments={message.attachments}
          target={{ organizationId, conversationId, messageId: message.id }}
        />
        <LinkedWorkList
          links={attachedWork(context?.links ?? [])}
          pending={unlink.isPending}
          targetFor={linkedWorkTarget}
          onOpen={navigation.onOpenRecord}
          onUnlink={(link) => unlink.mutate(link.entityId)}
        />
        {contextError && message.body.includes("@[") ? (
          <ErrorState compact error={contextError} noun="references" />
        ) : null}
        <MessageReactions
          reactions={message.reactions}
          disabled={!canReact || react.isPending}
          onToggle={(emoji) => react.mutate(emoji)}
          onShowPeople={(emoji) => setPanel({ kind: "reactions", emoji })}
        />
      </MessageRow>
      {panel?.kind === "actions" ? (
        <MessageActionsSheet
          preview={`${message.authorName}: ${readable || "Attachment"}`}
          canReact={canReact}
          reacted={reacted}
          actions={actions}
          onReact={(emoji) => react.mutate(emoji)}
          onMoreReactions={() => setPanel({ kind: "reaction-picker" })}
          onClose={() => setPanel(undefined)}
        />
      ) : null}
      {panel?.kind === "reaction-picker" && canReact ? (
        <ReactionPicker
          reacted={reacted}
          onClose={() => setPanel(undefined)}
          onPick={(emoji) => {
            setPanel(undefined);
            react.mutate(emoji);
          }}
        />
      ) : null}
      {panel?.kind === "edit" ? (
        <MessageEditSheet
          organizationId={organizationId}
          conversationId={conversationId}
          body={message.body}
          labels={referenceLabels(references)}
          hasAttachments={message.attachments.length > 0}
          pending={edit.isPending}
          error={edit.error}
          onSave={(body) => edit.mutate(body, { onSuccess: () => setPanel(undefined) })}
          onClose={() => setPanel(undefined)}
        />
      ) : null}
      {panel?.kind === "delete" ? (
        <ConfirmSheet
          title="Delete this message?"
          description="Everyone here sees that a message was deleted. Its text, files and links are removed."
          confirmLabel="Delete"
          destructive
          pending={remove.isPending}
          error={remove.error}
          onCancel={() => setPanel(undefined)}
          onConfirm={() => remove.mutate(undefined, { onSuccess: () => setPanel(undefined) })}
        />
      ) : null}
      {panel?.kind === "link" ? (
        <LinkRecordSheet
          organizationId={organizationId}
          messageId={message.id}
          linkedIds={(context?.links ?? []).map((link) => link.entityId)}
          onClose={() => setPanel(undefined)}
        />
      ) : null}
      {panel?.kind === "reactions" ? (
        <ReactionPeopleSheet
          organizationId={organizationId}
          messageId={message.id}
          emoji={panel.emoji}
          onClose={() => setPanel(undefined)}
        />
      ) : null}
      {react.error ? <ErrorState compact error={react.error} noun="the reaction" /> : null}
      {unlink.error ? <ErrorState compact error={unlink.error} noun="the record link" /> : null}
    </>
  );
}
