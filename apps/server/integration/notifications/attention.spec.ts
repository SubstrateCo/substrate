import { attentionSummary } from "@substrate/contracts/attention";

import { appOrigin } from "../test-support/environment";
import { test } from "../test-support/fixtures";
import { expect } from "@playwright/test";

test("attention is private to the signed-in account and includes inactive workspaces", async ({
  actors,
  workspace,
  request,
}) => {
  const [owner, member] = await workspace(actors.owner, actors.member);
  const summary = async () => {
    const response = await member.request.get("/api/v1/attention");
    expect(response.ok()).toBe(true);
    return attentionSummary.parse((await response.json()).data).count;
  };
  const before = await summary();
  const outsiderBefore = await actors.outsider.request.get("/api/v1/attention");
  expect(outsiderBefore.ok()).toBe(true);
  const outsiderSummary = (await outsiderBefore.json()).data;
  const created = await owner.request.post("/api/v1/messaging/conversations", {
    headers: { origin: appOrigin },
    data: { organizationId: owner.organizationId, kind: "dm", emails: [member.email] },
  });
  expect(created.ok()).toBe(true);
  const conversation = (await created.json()).data;
  const sent = await owner.request.post("/api/v1/messaging/messages", {
    headers: { origin: appOrigin },
    data: {
      organizationId: owner.organizationId,
      conversationId: conversation.id,
      body: "Please review this",
    },
  });
  expect(sent.ok()).toBe(true);
  expect(await summary()).toBe(before + 1);
  await workspace(member);
  expect(await summary()).toBe(before + 1);
  expect((await request.get("/api/v1/attention")).status()).toBe(401);
  const foreign = await actors.outsider.request.get("/api/v1/attention");
  expect(foreign.ok()).toBe(true);
  expect((await foreign.json()).data).toEqual(outsiderSummary);
});
