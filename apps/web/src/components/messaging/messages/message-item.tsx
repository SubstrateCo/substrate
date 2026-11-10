import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";

import { useRef, useState } from "react";

import { LinkMessageWork } from "../../context/links/link-message-work";
import { MessageContext, type MessageContextState } from "../../context/references/message-context";
import { ReferencedMessageBody } from "../../context/references/referenced-message-body";
import { toggleReaction } from "@/api/messaging/requests";
import type { Message } from "@/api/messaging/requests";
import {
  AgentWorkBadge,
  AgentWorkSlot,
  AgentWorkStatus,
} from "@/components/agent-work/agent-work-slot";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { LinkedMessage } from "@/components/messaging/messages/linked-message";
import { MessageItem as MessageItemView } from "@/components/messaging/messages/message-item-view";
import { PersonCardProvider } from "@/components/messaging/people/person-card-slot";
import { PersonHoverCard } from "@/components/messaging/people/person-hover-card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { messageHref } from "@/lib/navigation/record-links";
import { queryKeys } from "@/queries/keys";
import { Copy, Ellipsis, Link2 } from "lucide-react";
import { toast } from "sonner";

export function MessageItem({
  message,
  grouped = false,
  threadRoot = false,
  organizationId,
  onThread,
  context,
}: {
  message: Message;
  grouped?: boolean;
  threadRoot?: boolean;
  organizationId: string;
  onThread?: (id: string) => void;
  context: MessageContextState;
}) {
  const queryClient = useQueryClient();
  const linked = useSearch({
    strict: false,
    select: (search) => search.messageId === message.id,
  });
  // A thread's root heads its own pane, so it is not marked as the link target there.
  const highlighted = linked && !threadRoot;
  const [linking, setLinking] = useState(false);
  const actionsTrigger = useRef<HTMLButtonElement>(null);
  const reaction = useMutation({
    onError: (error) =>
      toast.error(
        actionErrorMessage(error, "Your reaction couldn’t be saved. Try selecting it again."),
      ),
    mutationFn: async (emoji: string) =>
      toggleReaction({ data: { organizationId, messageId: message.id, emoji } }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.messages(organizationId, message.conversationId).slice(0, -1),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.messageTargets(organizationId, message.conversationId),
        }),
      ]),
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
          grouped={grouped && !highlighted}
          highlighted={highlighted}
          body={
            <ReferencedMessageBody
              organizationId={organizationId}
              conversationId={message.conversationId}
              context={context}
              body={message.body}
            />
          }
          actions={
            <>
              <DropdownMenu>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button
                        ref={actionsTrigger}
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
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setLinking(true)}>
                    <Link2 aria-hidden="true" /> Link existing work
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      const href = messageHref(organizationId, message.conversationId, message.id);
                      void navigator.clipboard
                        .writeText(new URL(href, window.location.origin).href)
                        .then(
                          () => toast.success("Link copied"),
                          () => toast.error("Couldn’t copy link"),
                        );
                    }}
                  >
                    <Copy aria-hidden="true" /> Copy message link
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          }
          avatarBadge={<AgentWorkBadge messageId={message.id} />}
          status={
            message.authorType === "agent" ? <AgentWorkStatus messageId={message.id} /> : undefined
          }
          onThread={onThread}
          onReact={(emoji) => reaction.mutate(emoji)}
          pending={reaction.isPending}
        >
          <MessageContext
            organizationId={organizationId}
            messageId={message.id}
            context={context}
          />
          <AgentWorkSlot messageId={message.id} fromAgent={message.authorType === "agent"} />
          {linking && (
            <LinkMessageWork
              organizationId={organizationId}
              messageId={message.id}
              linkedIds={context.data?.links.map((link) => link.entityId) ?? []}
              onClose={() => {
                setLinking(false);
                requestAnimationFrame(() => actionsTrigger.current?.focus());
              }}
            />
          )}
        </MessageItemView>
      </PersonCardProvider>
    </LinkedMessage>
  );
}
