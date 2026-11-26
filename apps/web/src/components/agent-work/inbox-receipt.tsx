import type { AgentWorkItemView } from "@substrate/contracts/agent-work";

import { InboxReceiptView } from "./inbox-receipt-view";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { itemStatus, type ItemContext } from "@/lib/agent-work/status";
import { useDiscardItem, useResendItem, useSendNow } from "@/queries/agent-work/mutations";
import { toast } from "sonner";

export function InboxReceipt({ item, context }: { item: AgentWorkItemView; context: ItemContext }) {
  const { userId, organizationId } = useWorkspaceScope();
  const sendNow = useSendNow(userId, organizationId);
  const resend = useResendItem(userId, organizationId);
  const discard = useDiscardItem(userId, organizationId);
  const status = itemStatus(item, context);
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
