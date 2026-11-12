import { addAgent, callTool, createAgent, threadTurn } from "./test-support/agent-work";
import { conversation, test, visit } from "./test-support/fixtures";
import { expect } from "@playwright/test";
import { z } from "zod";

test("an owner shares an agent, a member calls it, and the owner approves from Needs you", async ({
  actors,
  client,
}) => {
  test.setTimeout(30_000);
  const owner = actors.sender;
  const agent = await createAgent(owner);
  const channel = await conversation(owner, [actors.member.email]);
  await addAgent(owner, channel.id, agent.id);
  const admin = await client(owner);
  await visit(admin, undefined, "/agents", { agentId: agent.id, section: "run" });
  await admin.page.getByRole("radio", { name: "Ask me first", exact: true }).click();
  const settings = admin.page.getByRole("region", { name: "Who can call this agent", exact: true });
  await settings.getByRole("button", { name: "Save", exact: true }).click();
  const confirm = admin.page.getByRole("dialog");
  await expect(confirm.getByText(/works with your full access/)).toBeVisible();
  await confirm.getByRole("button", { name: "Allow calls", exact: true }).click();
  await expect(confirm).toHaveCount(0);

  const caller = await client(actors.member);
  await visit(caller, channel.id);
  const composer = caller.page.getByRole("textbox", { name: /Message/ }).first();
  await composer.fill("@agent:Research");
  const option = caller.page.getByRole("option").filter({ hasText: agent.name });
  await expect(option.getByText("Calls need the owner’s approval")).toBeVisible();
  await option.click();
  await composer.press("End");
  await composer.pressSequentially(" please summarize");
  await composer.press("Enter");
  await expect(
    caller.page.getByText(`${agent.name} · Waiting for approval`, { exact: true }),
  ).toBeVisible();
  await visit(admin, undefined, "/agents");
  const needs = admin.page.getByRole("list", { name: "Needs you" });
  await expect(
    needs.getByText(`${actors.member.name} wants to call ${agent.name}`, { exact: true }),
  ).toBeVisible();
  await needs.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(
    needs.getByText(`${actors.member.name} wants to call ${agent.name}`, { exact: true }),
  ).toHaveCount(0);
  await expect(
    caller.page.getByText(`${agent.name} · Waiting for a reply`, { exact: true }),
  ).toBeVisible();
  await expect(caller.page.getByText(`${agent.name} · Answered`, { exact: true })).toHaveCount(0);
  const mine = await actors.member.request.get("/api/v1/agent-work/calls/mine", {
    params: { organizationId: actors.member.organizationId, conversationId: channel.id },
  });
  expect(mine.ok(), await mine.text()).toBe(true);
  const { data } = z
    .object({ data: z.array(z.object({ invocationId: z.uuid(), messageId: z.uuid() })).length(1) })
    .parse(await mine.json());
  const call = data[0]!;
  await callTool(
    owner,
    agent.id,
    {
      ...threadTurn(channel.id, call.messageId, agent.installationId),
      invocationIds: [call.invocationId],
    },
    "reply",
    { body: "Here is the summary." },
  );
  await expect(caller.page.getByText(`${agent.name} · Answered`, { exact: true })).toBeVisible();
  await visit(admin, undefined, "/agents", { agentId: agent.id, section: "calls" });
  await expect(admin.page.getByText("Call approved", { exact: true })).toBeVisible();
});
