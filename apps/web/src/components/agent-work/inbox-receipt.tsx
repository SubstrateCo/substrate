import type { AgentInboxItemView } from "@startup-os/contracts/agent-work";

import { InboxReceiptView } from "./inbox-receipt-view";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { itemStatus, type ItemContext } from "@/lib/agent-work/status";
import { useLocalWorkActions } from "@/queries/agent-work/mutations";
import { toast } from "sonner";

export function InboxReceipt({
  userId,
  organizationId,
  item,
  context,
}: {
  userId: string;
  organizationId: string;
  item: AgentInboxItemView;
  context: ItemContext;
}) {
  const { sendNow, resend, discard } = useLocalWorkActions(userId, organizationId);
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
