import { messageInput } from "@substrate/contracts/messaging/input";

import type { Account } from "./client";
import { seedRequest } from "./fixture";
import { notifications } from "./notifications";
import { request } from "@playwright/test";
import { expect, test } from "bun:test";
import type { z } from "zod";

test("notification seed mentions actual recipient actors from another joined organization member and resumes", async () => {
  const organizationId = "organization";
  const conversationId = seedRequest("general");
  const actors = [0, 1].map((index) => ({
    actorId: seedRequest(`person-${index}`),
    userId: `auth-user-${index}`,
    organizationId,
    type: "human",
  }));
  const messages = new Map<string, z.output<typeof messageInput>>();
  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      if (req.method === "GET")
        return Response.json({ success: true, data: [{ id: conversationId, members: actors }] });
      expect(url.pathname).toBe("/api/v1/messaging/messages");
      const input = messageInput.parse(await req.json());
      const sender = actors.find((row) => row.userId === req.headers.get("X-User"))!;
      const recipient = actors.find((row) => input.body.includes(`@[person:${row.actorId}]`))!;
      expect(recipient.userId).not.toBe(sender.userId);
      expect(input.organizationId).toBe(organizationId);
      expect(input.conversationId).toBe(conversationId);
      const previous = messages.get(input.requestId!);
      if (previous) expect(input).toEqual(previous);
      messages.set(input.requestId!, input);
      return Response.json({ success: true, data: { id: seedRequest(input.requestId!) } });
    },
  });
  const members: Account[] = await Promise.all(
    actors.map(async (actor, index) => ({
      client: await request.newContext({
        baseURL: server.url.origin,
        extraHTTPHeaders: { "X-User": actor.userId },
      }),
      email: `load-${index}@load.test`,
      name: `Load ${index}`,
      userId: actor.userId,
      organizationId,
    })),
  );
  try {
    await notifications(members, conversationId);
    const sources = members.map((row) => row.notification);
    await notifications(members, conversationId);
    expect(members.map((row) => row.notification)).toEqual(sources);
    expect(messages.size).toBe(2);
    for (const [index, member] of members.entries()) {
      expect(member.actorEntityId).toBe(actors[index]!.actorId);
      expect(member.notification).toMatchObject({
        conversationId,
        senderUserId: actors[1 - index]!.userId,
        senderActorEntityId: actors[1 - index]!.actorId,
      });
    }
    const result = await notifications([members[0]!], conversationId).then(
      () => "unexpected success",
      (error: Error) => error.message,
    );
    expect(result).toContain("at least two");
  } finally {
    await Promise.all(members.map((row) => row.client.dispose()));
    await server.stop(true);
  }
});
