import { useMutation, useQueryClient } from "@tanstack/react-query";

import { invalidateCrmWrite } from "../crm/mutations";
import { createCrmFromMessage } from "@/api/context/crm-from-message";
import { messageRecordInput, type MessageRecordDraft } from "@/api/context/crm-from-message-input";

export function useCreateCrmFromMessage(organizationId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      messageId,
      requestId,
      draft,
    }: {
      messageId: string;
      requestId: string;
      draft: MessageRecordDraft;
    }) => createCrmFromMessage({ data: messageRecordInput(messageId, requestId, draft) }),
    onSuccess: () => invalidateCrmWrite(client, organizationId),
  });
}
