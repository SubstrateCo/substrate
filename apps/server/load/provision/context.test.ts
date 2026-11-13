import { crmWrite } from "@substrate/contracts/crm/input";
import { messageInput } from "@substrate/contracts/messaging/input";

import type { Account } from "./client";
import { context } from "./context";
import { seedRequest } from "./fixture";
import { request } from "@playwright/test";
import { expect, test } from "bun:test";
import type { z } from "zod";

test("context seed resumes linked follow-ups and discussions with stable request keys", async () => {
  const organizationId = seedRequest("organization");
  const projectEntityId = seedRequest("project");
  const taskEntityId = seedRequest("task");
  const discussionId = seedRequest("discussion");
  const dealEntityId = seedRequest("deal");
  const followUps = new Map<
    string,
    Extract<z.output<typeof crmWrite>, { action: "createFollowUp" }>
  >();
  const messages = new Map<string, z.output<typeof messageInput>>();
  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      let data:
        | { entityId: string }
        | { tasks: { title: string; entityId: string }[] }
        | { conversationId: string }
        | { id: string };
      if (url.pathname === "/api/v1/crm/mutations") {
        const input = crmWrite.parse(await req.json());
        expect(input).toMatchObject({
          organizationId,
          action: "createFollowUp",
          entityId: dealEntityId,
          projectEntityId,
          consentToTaskAudience: true,
        });
        if (input.action !== "createFollowUp") return new Response(null, { status: 400 });
        const previous = followUps.get(input.requestId);
        if (previous) expect(input).toEqual(previous);
        followUps.set(input.requestId, input);
        data = { entityId: taskEntityId };
      } else if (url.pathname === "/api/v1/tasks/project") {
        expect(url.searchParams.get("projectEntityId")).toBe(projectEntityId);
        data = { tasks: [{ title: "Customer rollout step 1", entityId: taskEntityId }] };
      } else if (url.pathname === "/api/v1/tasks/discussion") {
        expect(await req.json()).toEqual({ organizationId, projectEntityId, taskEntityId });
        data = { conversationId: discussionId };
      } else if (url.pathname === "/api/v1/messaging/messages") {
        const input = messageInput.parse(await req.json());
        expect(input).toMatchObject({ organizationId, conversationId: discussionId });
        expect(input.body).toContain(`@[task:${taskEntityId}]`);
        const previous = messages.get(input.requestId!);
        if (previous) expect(input).toEqual(previous);
        messages.set(input.requestId!, input);
        data = { id: seedRequest(input.requestId!) };
      } else return new Response(null, { status: 404 });
      return Response.json({ success: true, data });
    },
  });
  const client = await request.newContext({ baseURL: server.url.origin });
  const member: Account = {
    client,
    email: "load@load.test",
    name: "Load",
    userId: "load",
    organizationId,
    crm: {
      accountEntityId: seedRequest("account"),
      contactEntityId: seedRequest("contact"),
      dealEntityId,
      projectEntityId,
    },
  };
  try {
    await context([member], seedRequest("channel"));
    await context([member], seedRequest("channel"));
    expect(followUps.size).toBe(4);
    expect(messages.size).toBe(6);
    expect(member.workspace).toEqual({
      conversationId: seedRequest("channel"),
      projectEntityId,
      taskEntityId,
      discussionId,
    });
  } finally {
    await client.dispose();
    await server.stop(true);
  }
});
