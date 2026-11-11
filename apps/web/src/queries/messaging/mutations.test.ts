import { QueryClient } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import { invalidateDirectMessage } from "./mutations";
import { expect, test } from "bun:test";

test("starting a DM refreshes conversations and cached profile DM targets only in its organization", async () => {
  const client = new QueryClient();
  const conversations = queryKeys.conversations("org");
  const profile = queryKeys.messagingProfile("org", "channel", "person");
  const untouched = [
    queryKeys.conversations("other"),
    queryKeys.messagingProfile("other", "channel", "person"),
    queryKeys.messages("org", "channel"),
    queryKeys.notifications("org"),
  ];
  client.setQueryData(conversations, []);
  client.setQueryData(profile, { directConversationId: null });
  for (const key of untouched) client.setQueryData(key, []);
  try {
    await invalidateDirectMessage(client, "org");
    expect(client.getQueryState(conversations)?.isInvalidated).toBe(true);
    expect(client.getQueryState(profile)?.isInvalidated).toBe(true);
    for (const key of untouched) expect(client.getQueryState(key)?.isInvalidated).toBe(false);
  } finally {
    client.clear();
  }
});
