import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useRef } from "react";

import { ReferencePicker } from "../../context/references/reference-picker";
import { sendMessage } from "@/api/messaging/requests";
import { Composer as ComposerView } from "@/components/messaging/composer/composer-view";
import { invalidateSentMessage } from "@/queries/messaging/mutations";

export function Composer({
  organizationId,
  conversationId,
  threadId,
  label,
}: {
  organizationId: string;
  conversationId: string;
  threadId?: string;
  label: string;
}) {
  const queryClient = useQueryClient();
  const request = useRef<{ id: string; body: string } | null>(null);
  const send = useMutation({
    mutationFn: async (body: string) => {
      if (!request.current || request.current.body !== body)
        request.current = { id: crypto.randomUUID(), body };
      return sendMessage({
        data: { organizationId, conversationId, threadId, body, requestId: request.current.id },
      });
    },
    onSuccess: (_, body) => {
      request.current = null;
      return invalidateSentMessage(queryClient, organizationId, conversationId, body, threadId);
    },
  });
  return (
    <ComposerView
      draftKey={`${organizationId}:${conversationId}:${threadId ?? "channel"}`}
      label={label}
      renderReferences={(activeReference, onInsert, onClose) => (
        <ReferencePicker
          organizationId={organizationId}
          conversationId={conversationId}
          activeReference={activeReference}
          onInsert={onInsert}
          onClose={onClose}
        />
      )}
      pending={send.isPending}
      error={send.error}
      onSend={(body, onSuccess) => {
        void send
          .mutateAsync(body)
          .then(onSuccess)
          .catch(() => {});
      }}
    />
  );
}
