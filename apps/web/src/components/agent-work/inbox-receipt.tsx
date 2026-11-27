import type { AgentWorkItemView } from "@substrate/contracts/agent-work";

import { InboxReceiptView } from "./inbox-receipt-view";
import { PendingReply } from "./pending-reply";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { itemStatus, queuedOrb, type ItemContext } from "@/lib/agent-work/status";
import { useDiscardItem, useResendItem, useSendNow } from "@/queries/agent-work/mutations";
import { toast } from "sonner";

export function InboxReceipt({
  item,
  context,
  asReply = false,
}: {
  item: AgentWorkItemView;
  context: ItemContext;
  /** The message the agent's next turn starts from: a queued reply row stands in for the reply. */
  asReply?: boolean;
}) {
  const { userId, organizationId } = useWorkspaceScope();
  const sendNow = useSendNow(userId, organizationId);
  const resend = useResendItem(userId, organizationId);
  const discard = useDiscardItem(userId, organizationId);
  const status = itemStatus(item, context);
  if (asReply)
    return (
      <PendingReply
        name={context.agentName}
        orb={queuedOrb}
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
      onResend={
        status.uncertain
          ? () =>
              resend.mutate(item.id, {
                onError: (error) =>
                  toast.error(actionErrorMessage(error, "We couldn’t resend the message.")),
              })
          : undefined
      }
      onDiscard={
        status.uncertain
          ? () =>
              discard.mutate(item.id, {
                onError: (error) =>
                  toast.error(actionErrorMessage(error, "We couldn’t discard the message.")),
              })
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
