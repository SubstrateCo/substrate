import { useSearch } from "@tanstack/react-router";

import { useRef, useState, type RefObject } from "react";
import { flushSync } from "react-dom";

import { LinkMessageWork } from "../../context/links/link-message-work";
import { MessageContext, type MessageContextState } from "../../context/references/message-context";
import { ReferencedMessageBody } from "../../context/references/referenced-message-body";
import { EditMessageComposer } from "./edit-message-composer";
import { messageAttachmentUrl, messageAttachmentPreviewUrl } from "@/api/files/attachments";
import type { Message } from "@/api/messaging/requests";
import { useAgentWorkMood } from "@/components/agent-work/agent-work-context";
import {
  AgentWorkBadge,
  AgentWorkSlot,
  AgentWorkStatus,
} from "@/components/agent-work/agent-work-slot";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { useStateDialog } from "@/components/feedback/use-state-dialog";
import { MessageAttachments } from "@/components/messaging/messages/attachments/message-attachments";
import { LinkedMessage } from "@/components/messaging/messages/linked-message";
import { messageAuthorName } from "@/components/messaging/messages/message-author";
import { MessageItem as MessageItemView } from "@/components/messaging/messages/message-item-view";
import { MessageReaction } from "@/components/messaging/messages/reactions/message-reaction";
import { ReactionPeopleDialog } from "@/components/messaging/messages/reactions/reaction-people-dialog";
import { PersonCardProvider } from "@/components/messaging/people/person-card-slot";
import { PersonHoverCard } from "@/components/messaging/people/person-hover-card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { useCopyText } from "@/hooks/use-copy-text";
import { useRecordUrl } from "@/hooks/use-record-url";
import { messageLink } from "@/lib/navigation/record-links";
import { useMessageMutations } from "@/queries/messaging/message-mutations";
import { useToggleReaction } from "@/queries/messaging/reactions";
import { Copy, Ellipsis, Link2, Pencil, Smile, Trash2 } from "lucide-react";
import { toast } from "sonner";

type MessageDialog = { kind: "link" } | { kind: "delete" } | { kind: "reactions"; emoji: string };

export function MessageItem({
  message,
  grouped = false,
  threadRoot = false,
  onThread,
  unreadReplies,
  context,
  canPost = true,
}: {
  message: Message;
  grouped?: boolean;
  threadRoot?: boolean;
  onThread?: (id: string) => void;
  unreadReplies?: number;
  context: MessageContextState;
  canPost?: boolean;
}) {
  const { organizationId } = useWorkspaceScope();
  const linked = useSearch({ strict: false, select: (search) => search.messageId === message.id });
  // A top-level target opens as the root of the thread pane, which already marks it.
  const highlighted = linked && !threadRoot && !!message.threadId;
  const [editing, setEditing] = useState(false);
  const { remove } = useMessageMutations(organizationId, message.conversationId, message.id);
  const actionsTrigger = useRef<HTMLButtonElement>(null);
  const {
    value: dialog,
    open,
    close,
    restoreFocus,
  } = useStateDialog<MessageDialog>(actionsTrigger);
  const reaction = useToggleReaction(organizationId, message.conversationId, message.id);
  const workMood = useAgentWorkMood(message.id);
  const react = (emoji: string) =>
    reaction.mutate(emoji, {
      onError: (error) =>
        toast.error(
          actionErrorMessage(error, "Your reaction couldn’t be saved. Try selecting it again."),
        ),
    });
  return (
    <LinkedMessage highlighted={highlighted}>
      <PersonCardProvider
        render={(actorId, name, trigger) => (
          <PersonHoverCard conversationId={message.conversationId} actorId={actorId} name={name}>
            {trigger}
          </PersonHoverCard>
        )}
      >
        <MessageItemView
          message={message}
          renderReaction={(item) => (
            <MessageReaction
              message={message}
              reaction={item}
              onReact={canPost ? react : undefined}
              pending={reaction.isPending}
              onViewAll={(emoji, trigger) => open({ kind: "reactions", emoji }, trigger)}
            />
          )}
          grouped={grouped && !highlighted}
          highlighted={highlighted}
          editor={
            canPost && editing && !message.deletedAt ? (
              <EditMessageComposer
                message={message}
                context={context}
                onClose={() => {
                  // The toolbar is hidden while editing, so it renders before focus returns to it.
                  flushSync(() => setEditing(false));
                  actionsTrigger.current?.focus();
                }}
              />
            ) : undefined
          }
          body={
            <>
              <ReferencedMessageBody context={context} body={message.body} />
              <MessageAttachments
                sender={{
                  name: messageAuthorName(message),
                  image: message.authorImage,
                  avatar: message.authorAvatar,
                  agent: message.authorType === "agent",
                  createdAt: message.createdAt,
                }}
                attachments={message.attachments}
                previewHref={(attachment) =>
                  messageAttachmentPreviewUrl({
                    organizationId,
                    conversationId: message.conversationId,
                    messageId: message.id,
                    attachmentId: attachment.id,
                  })
                }
                href={(attachment) =>
                  messageAttachmentUrl({
                    organizationId,
                    conversationId: message.conversationId,
                    messageId: message.id,
                    attachmentId: attachment.id,
                  })
                }
              />
            </>
          }
          actions={
            <MessageActionsMenu
              message={message}
              canPost={canPost}
              trigger={actionsTrigger}
              onReactions={() => open({ kind: "reactions", emoji: "" }, actionsTrigger.current)}
              onLink={() => open({ kind: "link" }, actionsTrigger.current)}
              onEdit={() => setEditing(true)}
              onDelete={() => {
                remove.reset();
                open({ kind: "delete" }, actionsTrigger.current);
              }}
            />
          }
          authorMood={workMood ?? undefined}
          avatarBadge={<AgentWorkBadge messageId={message.id} />}
          status={
            message.authorType === "agent" ? <AgentWorkStatus messageId={message.id} /> : undefined
          }
          onThread={onThread}
          unreadReplies={unreadReplies}
          onReact={canPost ? react : undefined}
          pending={reaction.isPending}
        >
          {!message.deletedAt && <MessageContext messageId={message.id} context={context} />}
          <AgentWorkSlot messageId={message.id} fromAgent={message.authorType === "agent"} />
          {canPost && dialog?.kind === "delete" && (
            <ConfirmDialog
              destructive
              title="Delete message?"
              description="The text and files will be removed. Replies, thread links, and linked work will remain with a deleted message placeholder."
              confirmLabel="Delete message"
              pending={remove.isPending}
              error={remove.error}
              errorDescription="Your message couldn’t be deleted. Try again."
              onConfirm={() => remove.mutate(undefined, { onSuccess: close })}
              onClose={close}
              onRestoreFocus={restoreFocus}
            />
          )}
          {canPost && dialog?.kind === "link" && (
            <LinkMessageWork
              messageId={message.id}
              linkedIds={context.data?.links.map((link) => link.entityId) ?? []}
              onClose={close}
              onRestoreFocus={restoreFocus}
            />
          )}
          {dialog?.kind === "reactions" && (
            <ReactionPeopleDialog
              message={message}
              initialEmoji={dialog.emoji}
              onClose={close}
              restoreFocus={restoreFocus}
            />
          )}
        </MessageItemView>
      </PersonCardProvider>
    </LinkedMessage>
  );
}

function MessageActionsMenu({
  message,
  canPost,
  trigger,
  onReactions,
  onLink,
  onEdit,
  onDelete,
}: {
  message: Message;
  canPost: boolean;
  trigger: RefObject<HTMLButtonElement | null>;
  onReactions: () => void;
  onLink: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { organizationId } = useWorkspaceScope();
  const recordUrl = useRecordUrl();
  const copyText = useCopyText();
  // The inline editor opens once the menu has closed. While the menu is open, its focus trap
  // would pull focus back from the editor.
  const editAfterClose = useRef(false);
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              ref={trigger}
              type="button"
              size="icon"
              variant="ghost"
              aria-label="More message actions"
            >
              <Ellipsis aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>More message actions</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="end"
        onCloseAutoFocus={(event) => {
          if (!editAfterClose.current) return;
          editAfterClose.current = false;
          event.preventDefault();
          onEdit();
        }}
      >
        {!!message.reactions.length && (
          <DropdownMenuItem onSelect={onReactions}>
            <Smile aria-hidden="true" /> View reactions
          </DropdownMenuItem>
        )}
        {canPost && !message.deletedAt && (
          <DropdownMenuItem onSelect={onLink}>
            <Link2 aria-hidden="true" /> Link work or CRM
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onSelect={() => {
            const link = messageLink(organizationId, message.conversationId, message.id);
            copyText.mutate(recordUrl(link), {
              onSuccess: () => toast.success("Link copied"),
              onError: () => toast.error("Couldn't copy link"),
            });
          }}
        >
          <Copy aria-hidden="true" /> Copy message link
        </DropdownMenuItem>
        {canPost && message.canModify && (
          <>
            <DropdownMenuItem
              onSelect={() => {
                editAfterClose.current = true;
              }}
            >
              <Pencil aria-hidden="true" /> Edit message
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              <Trash2 aria-hidden="true" /> Delete message
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
