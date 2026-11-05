import { readMessaging, writeMessaging } from "@startup-os/auth/messaging";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders, setResponseHeader } from "@tanstack/react-start/server";
import {
  conversationInput,
  membersInput,
  messageInput,
  messageListInput,
  reactionInput,
  workspaceInput,
} from "@/lib/messaging-input";

export const listConversations = createServerFn({ method: "GET" })
  .validator(workspaceInput)
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "no-store");
    return readMessaging(getRequestHeaders(), { ...data, action: "conversations" });
  });

export const listMessages = createServerFn({ method: "GET" })
  .validator(messageListInput)
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "no-store");
    return readMessaging(getRequestHeaders(), { ...data, action: "messages" });
  });

export const createConversation = createServerFn({ method: "POST" })
  .validator(conversationInput)
  .handler(async ({ data }) => writeMessaging(getRequestHeaders(), { ...data, action: "create" }));

export const sendMessage = createServerFn({ method: "POST" })
  .validator(messageInput)
  .handler(async ({ data }) => writeMessaging(getRequestHeaders(), { ...data, action: "send" }));

export const toggleReaction = createServerFn({ method: "POST" })
  .validator(reactionInput)
  .handler(async ({ data }) => writeMessaging(getRequestHeaders(), { ...data, action: "react" }));

export const addMembers = createServerFn({ method: "POST" })
  .validator(membersInput)
  .handler(async ({ data }) =>
    writeMessaging(getRequestHeaders(), { ...data, action: "addMembers" }),
  );
