import type { AgentWorkItemView } from "@substrate/contracts/agent-work";

import { useQuery } from "@tanstack/react-query";

import { InboxReceiptView } from "./inbox-receipt-view";
import { PendingReply } from "./pending-reply";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { itemStatus, queuedMood, type ItemContext } from "@/lib/agent-work/status";
import { useDiscardItem, useResendItem, useSendNow } from "@/queries/agent-work/mutations";
import { agentAvatarQueryOptions } from "@/queries/agents/catalog";
import { toast } from "sonner";

export function InboxReceipt({
  item,
  agentId,
  context,
  asReply = false,
}: {
  item: AgentWorkItemView;
  agentId: string;
  context: ItemContext;
  asReply?: boolean;
}) {
  const { userId, organizationId } = useWorkspaceScope();
  const sendNow = useSendNow(userId, organizationId);
  const resend = useResendItem(userId, organizationId);
  const discard = useDiscardItem(userId, organizationId);
  const status = itemStatus(item, context);
  const { data: avatar } = useQuery(agentAvatarQueryOptions(userId, agentId));
  if (asReply)
    return (
      <PendingReply
        name={context.agentName}
        avatar={avatar ?? null}
        mood={queuedMood}
        tone={status.tone}
        status={
          <span role="status" className="truncate text-xs text-muted-foreground tabular-nums">
            {status.label}
          </span>
        }
        line="Hasn’t started yet"
      />
    );
  return (
    <InboxReceiptView
      label={status.label}
      tone={status.tone}
      sending={sendNow.isPending}
      resolving={resend.isPending || discard.isPending}
      uncertain={
        status.uncertain
          ? {
              onResend: () =>
                resend.mutate(item.id, {
                  onError: (error) =>
                    toast.error(actionErrorMessage(error, "We couldn’t resend the message.")),
                }),
              onDiscard: () =>
                discard.mutate(item.id, {
                  onError: (error) =>
                    toast.error(actionErrorMessage(error, "We couldn’t discard the message.")),
                }),
            }
          : undefined
      }
      onSendNow={
        status.sendNow
          ? () =>
              sendNow.mutate(item.id, {
                onError: (error) =>
                  toast.error(actionErrorMessage(error, "We couldn’t send this now. Try again.")),
              })
          : undefined
      }
    />
  );
}
