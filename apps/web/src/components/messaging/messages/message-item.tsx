import { useSearch } from "@tanstack/react-router";

import { useEffect, useRef, useState, type RefObject } from "react";

import { LinkMessageWork } from "../../context/links/link-message-work";
import { MessageContext, type MessageContextState } from "../../context/references/message-context";
import { ReferencedMessageBody } from "../../context/references/referenced-message-body";
import { EditMessageComposer } from "./edit-message-composer";
import { messageAttachmentUrl, messageAttachmentPreviewUrl } from "@/api/files/attachments";
import type { Message } from "@/api/messaging/requests";
import {
  AgentWorkBadge,
  AgentWorkSlot,
  AgentWorkStatus,
} from "@/components/agent-work/agent-work-slot";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { LinkedMessage } from "@/components/messaging/messages/linked-message";
import { MessageAttachments } from "@/components/messaging/messages/message-attachments";
import { MessageItem as MessageItemView } from "@/components/messaging/messages/message-item-view";
import { MessageReaction } from "@/components/messaging/messages/message-reaction";
import { ReactionPeopleDialog } from "@/components/messaging/messages/reaction-people-dialog";
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
import { useCopyText } from "@/hooks/use-copy-text";
import { useRecordUrl } from "@/hooks/use-record-url";
import { messageLink } from "@/lib/navigation/record-links";
import { useMessageMutations } from "@/queries/messaging/message-mutations";
import { useToggleReaction } from "@/queries/messaging/reactions";
import { Copy, Ellipsis, Link2, Pencil, Smile, Trash2 } from "lucide-react";
import { toast } from "sonner";

export function MessageItem({
  message,
  grouped = false,
  threadRoot = false,
  organizationId,
  onThread,
  context,
  canPost = true,
}: {
  message: Message;
  grouped?: boolean;
  threadRoot?: boolean;
  organizationId: string;
  onThread?: (id: string) => void;
  context: MessageContextState;
  canPost?: boolean;
}) {
  const linked = useSearch({ strict: false, select: (search) => search.messageId === message.id });
  // A thread's root heads its own pane, so it is not marked as the link target there.
  const highlighted = linked && !threadRoot;
  const [linking, setLinking] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { remove } = useMessageMutations(organizationId, message.conversationId, message.id);
  const actionsTrigger = useRef<HTMLButtonElement>(null);
  // The toolbar is hidden while editing, so focus returns to its trigger once it renders again.
  const restoreActionsFocus = useRef(false);
  useEffect(() => {
    if (editing || !restoreActionsFocus.current) return;
    restoreActionsFocus.current = false;
    actionsTrigger.current?.focus();
  }, [editing]);
  const [reactionsEmoji, setReactionsEmoji] = useState<string | null>(null);
  const reactionsTrigger = useRef<HTMLElement | null>(null);
  const reaction = useToggleReaction(organizationId, message.conversationId, message.id);
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
          <PersonHoverCard
            organizationId={organizationId}
            conversationId={message.conversationId}
            actorId={actorId}
            name={name}
          >
            {trigger}
          </PersonHoverCard>
        )}
      >
        <MessageItemView
          message={message}
          renderReaction={(item) => (
            <MessageReaction
              organizationId={organizationId}
              message={message}
              reaction={item}
              onReact={canPost ? react : undefined}
              pending={reaction.isPending}
              onViewAll={(emoji, trigger) => {
                reactionsTrigger.current = trigger;
                setReactionsEmoji(emoji);
              }}
            />
          )}
          grouped={grouped && !highlighted}
          highlighted={highlighted}
          editor={
            canPost && editing && !message.deletedAt ? (
              <EditMessageComposer
                organizationId={organizationId}
                message={message}
                context={context}
                onClose={() => {
                  restoreActionsFocus.current = true;
                  setEditing(false);
                }}
              />
            ) : undefined
          }
          body={
            <>
              <ReferencedMessageBody
                organizationId={organizationId}
                context={context}
                body={message.body}
              />
              <MessageAttachments
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
              organizationId={organizationId}
              message={message}
              canPost={canPost}
              trigger={actionsTrigger}
              onReactions={() => {
                reactionsTrigger.current = actionsTrigger.current;
                setReactionsEmoji("");
              }}
              onLink={() => setLinking(true)}
              onEdit={() => setEditing(true)}
              onDelete={() => {
                remove.reset();
                setDeleting(true);
              }}
            />
          }
          avatarBadge={<AgentWorkBadge messageId={message.id} />}
          status={
            message.authorType === "agent" ? <AgentWorkStatus messageId={message.id} /> : undefined
          }
          onThread={onThread}
          onReact={canPost ? react : undefined}
          pending={reaction.isPending}
        >
          {!message.deletedAt && (
            <MessageContext
              organizationId={organizationId}
              messageId={message.id}
              context={context}
            />
          )}
          <AgentWorkSlot messageId={message.id} fromAgent={message.authorType === "agent"} />
          {canPost && deleting && (
            <ConfirmDialog
              destructive
              title="Delete message?"
              description="The text and files will be removed. Replies, thread links, and linked work will remain with a deleted message placeholder."
              confirmLabel="Delete message"
              pending={remove.isPending}
              error={remove.error}
              errorDescription="Your message couldn’t be deleted. Try again."
              onConfirm={() => remove.mutate(undefined, { onSuccess: () => setDeleting(false) })}
              onClose={() => setDeleting(false)}
              onRestoreFocus={() => actionsTrigger.current?.focus()}
            />
          )}
          {canPost && linking && (
            <LinkMessageWork
              organizationId={organizationId}
              messageId={message.id}
              linkedIds={context.data?.links.map((link) => link.entityId) ?? []}
              onClose={() => setLinking(false)}
              onRestoreFocus={() => actionsTrigger.current?.focus()}
            />
          )}
          {reactionsEmoji !== null && (
            <ReactionPeopleDialog
              organizationId={organizationId}
              message={message}
              initialEmoji={reactionsEmoji}
              onClose={() => setReactionsEmoji(null)}
              restoreFocus={() => reactionsTrigger.current?.focus()}
            />
          )}
        </MessageItemView>
      </PersonCardProvider>
    </LinkedMessage>
  );
}

function MessageActionsMenu({
  organizationId,
  message,
  canPost,
  trigger,
  onReactions,
  onLink,
  onEdit,
  onDelete,
}: {
  organizationId: string;
  message: Message;
  canPost: boolean;
  trigger: RefObject<HTMLButtonElement | null>;
  onReactions: () => void;
  onLink: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
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
              size="icon-sm"
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
