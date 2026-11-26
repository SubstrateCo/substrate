import { api } from "@/api/client";
import { readResult } from "@/api/result";

const messaging = api.messaging;
const init = (signal?: AbortSignal) => ({ init: { signal } });

export type MessagePageQuery = {
  organizationId: string;
  conversationId: string;
  threadId?: string;
  beforeMessageId?: string;
  aroundMessageId?: string;
  /** Returns only messages newer than this one, in the same timeline or thread. */
  afterMessageId?: string;
};

export const listMessages = (query: MessagePageQuery, signal?: AbortSignal) =>
  readResult(messaging.messages.$get({ query }, init(signal)));
export const sendMessage = (json: {
  organizationId: string;
  conversationId: string;
  threadId?: string;
  body: string;
  attachmentFileIds?: string[];
  requestId: string;
}) => readResult(messaging.messages.$post({ json }));
export const editMessage = (json: { organizationId: string; messageId: string; body: string }) =>
  readResult(messaging.messages.edit.$post({ json }));
export const deleteMessage = (json: { organizationId: string; messageId: string }) =>
  readResult(messaging.messages.delete.$post({ json }));
export const toggleReaction = (json: {
  organizationId: string;
  messageId: string;
  emoji: string;
}) => readResult(messaging.reactions.$post({ json }));
export const listReactions = (
  query: {
    organizationId: string;
    messageId: string;
    emoji?: string;
    afterActorId?: string;
    limit: number;
  },
  signal?: AbortSignal,
) =>
  readResult(
    messaging.reactions.$get({ query: { ...query, limit: String(query.limit) } }, init(signal)),
  );
