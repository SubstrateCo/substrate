import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useRef } from "react";

import { ReferencePicker } from "../context/reference-picker";
import { sendMessage } from "@/api/messaging";
import { queryKeys } from "@/queries/keys";
import { Composer as ComposerView } from "@/ui/messaging/composer";

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
    onSuccess: () => {
      request.current = null;
      return queryClient.invalidateQueries({ queryKey: queryKeys.organization(organizationId) });
    },
  });
  return (
    <ComposerView
      draftKey={`${organizationId}:${conversationId}:${threadId ?? "channel"}`}
      label={label}
      renderReferences={(query, onInsert, onClose) => (
        <ReferencePicker
          key={query}
          organizationId={organizationId}
          conversationId={conversationId}
          initialQuery={query}
          onInsert={onInsert}
          onClose={onClose}
        />
      )}
      pending={send.isPending}
      error={send.error}
      onSend={(body, onSuccess) => send.mutate(body, { onSuccess })}
    />
  );
}
