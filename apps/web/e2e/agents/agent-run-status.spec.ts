import { addAgent, callTool, createAgent, threadTurn } from "../test-support/agent-work";
import { conversation, post, test, visit } from "../test-support/fixtures";
import { localAgentWork } from "../test-support/local-agent-work";
import { captureScreenshot } from "../test-support/screenshots";
import { expect } from "@playwright/test";

test("one owner-only run status follows its source visibility and keeps run controls", async ({
  actors,
  client,
}) => {
  test.setTimeout(30_000);
  const owner = actors.sender;
  const agent = await createAgent(owner, "Jarvis");
  const channel = await conversation(owner, [actors.member.email]);
  await addAgent(owner, channel.id, agent.id);
  await post(owner, "messaging/messages", {
    conversationId: channel.id,
    body: "The launch checklist is ready for review. Please check the open risks before Friday.",
  });
  const root = await post<{ id: string }>(owner, "messaging/messages", {
    conversationId: channel.id,
    body: "Summarize the launch risks and suggest the next steps.",
  });
  const user = await client(owner);
  await localAgentWork(user, { agentId: agent.id, conversationId: channel.id, messageId: root.id });
  await visit(user, channel.id);
  const inline = user.page.getByRole("region", { name: "Jarvis reply", exact: true });
  const floating = user.page.getByRole("status", { name: "Agent status", exact: true });
  await expect(inline.getByRole("button", { name: /Jarvis is working/ })).toBeVisible();
  await expect(inline).toBeInViewport({ ratio: 1 });
  await expect(inline.getByRole("button", { name: "Stop run", exact: true })).toBeVisible();
  await expect(inline.getByRole("button", { name: "Stop run", exact: true })).toHaveAttribute(
    "data-variant",
    "destructive-ghost",
  );
  await expect(floating).toHaveCount(0);
  await inline.getByLabel("Only visible to you", { exact: true }).hover();
  await expect(user.page.getByRole("tooltip", { name: "Only visible to you" })).toBeVisible();
  await user.page.mouse.move(0, 0);
  await user.page.keyboard.press("Escape");
  await expect(user.page.getByRole("tooltip")).toHaveCount(0);
  await captureScreenshot(user.page, "agent-run-status-inline");

  // Make the source leave the viewport without changing its turn or access.
  for (let index = 0; index < 40; index++) {
    await post(owner, "messaging/messages", {
      conversationId: channel.id,
      body: `Launch review update ${index + 1}: the team is checking milestones, dependencies, and owner sign-off.`,
    });
  }
  await user.page
    .getByRole("article")
    .filter({ hasText: "Launch review update 40:" })
    .scrollIntoViewIfNeeded();
  await expect(inline).not.toBeInViewport();
  await expect(floating.getByRole("button", { name: /Jarvis is working/ })).toBeVisible();
  await expect(floating.getByRole("button", { name: "Stop run", exact: true })).toHaveAttribute(
    "data-variant",
    "destructive-ghost",
  );
  await captureScreenshot(user.page, "agent-run-status-offscreen");
  await inline.scrollIntoViewIfNeeded();
  await expect(floating).toHaveCount(0);
  await inline.getByRole("button", { name: /Open transcript/ }).click();
  await expect(user.page.getByRole("complementary", { name: "Agent transcript" })).toBeVisible();
  await user.page.getByRole("button", { name: "Close transcript", exact: true }).click();
  await inline.getByRole("button", { name: "Stop run", exact: true }).hover();
  await expect(user.page.getByRole("tooltip", { name: "Stop run", exact: true })).toBeVisible();
  await inline.getByRole("button", { name: "Stop run", exact: true }).click();
  await expect(inline.getByRole("button", { name: "Stop run", exact: true })).toBeDisabled();
  await expect(inline.getByRole("button", { name: "Stop run", exact: true })).toHaveAttribute(
    "aria-busy",
    "true",
  );
  await user.page.evaluate(() => window.dispatchEvent(new Event("e2e:finish-stop-agent-work")));
  await expect(inline.getByRole("button", { name: /Jarvis · Stopped/ })).toBeVisible();
  await expect(inline.getByRole("button", { name: "Stop run", exact: true })).toHaveCount(0);
  await expect(floating).toHaveCount(0);

  const member = await client(actors.member);
  await visit(member, channel.id);
  await expect(
    member.page.getByText("Summarize the launch risks and suggest the next steps."),
  ).toBeVisible();
  await expect(member.page.getByRole("region", { name: "Jarvis reply", exact: true })).toHaveCount(
    0,
  );
  await expect(member.page.getByRole("status", { name: "Agent status", exact: true })).toHaveCount(
    0,
  );
});

test("a queued status expanding the last message stays fully visible at the bottom", async ({
  actors,
  client,
}) => {
  test.setTimeout(30_000);
  const owner = actors.sender;
  const agent = await createAgent(owner, "Jarvis");
  const channel = await conversation(owner);
  await addAgent(owner, channel.id, agent.id);
  for (let index = 0; index < 40; index++) {
    await post(owner, "messaging/messages", {
      conversationId: channel.id,
      body: `Launch planning note ${index + 1}: confirm the rollout checklist with each team.`,
    });
  }
  const body = "Please review the release checklist next.";
  const root = await post<{ id: string }>(owner, "messaging/messages", {
    conversationId: channel.id,
    body,
  });
  const user = await client(owner);
  await localAgentWork(user, {
    agentId: agent.id,
    conversationId: channel.id,
    messageId: root.id,
    queued: true,
  });
  await visit(user, channel.id);
  const message = user.page.getByRole("article").filter({ hasText: body });
  const timeline = user.page.getByRole("log", { name: "Messages", exact: true });
  expect(await timeline.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(
    true,
  );
  await expect(message).toBeInViewport({ ratio: 1 });
  await expect
    .poll(() =>
      timeline.evaluate(
        (element) => element.scrollHeight - element.scrollTop - element.clientHeight,
      ),
    )
    .toBeLessThanOrEqual(1);
  // The desktop accepts the message after it has already appeared in the timeline.
  await user.page.evaluate(() => window.dispatchEvent(new Event("e2e:queue-agent-work")));
  await expect(message.getByText("Queued", { exact: true })).toBeVisible();
  await expect(message.getByText("Queued", { exact: true })).toBeInViewport({ ratio: 1 });
  await expect
    .poll(() =>
      timeline.evaluate(
        (element) => element.scrollHeight - element.scrollTop - element.clientHeight,
      ),
    )
    .toBeLessThanOrEqual(1);
  await captureScreenshot(user.page, "agent-queued-status-last-message");
});

test("finished work moves to the published result and keeps its existing transcript link", async ({
  actors,
  client,
}) => {
  const owner = actors.sender;
  const agent = await createAgent(owner, "Jarvis");
  const channel = await conversation(owner);
  await addAgent(owner, channel.id, agent.id);
  const root = await post<{ id: string }>(owner, "messaging/messages", {
    conversationId: channel.id,
    body: "Review the launch risks.",
  });
  const user = await client(owner);
  await localAgentWork(user, { agentId: agent.id, conversationId: channel.id, messageId: root.id });
  await visit(user, channel.id);
  await expect(user.page.getByRole("button", { name: /Jarvis is working/ })).toBeVisible();
  const reply = await callTool(
    owner,
    agent.id,
    threadTurn(channel.id, root.id, agent.installationId),
    "reply",
    {
      body: "The main risk is the pending security review. Confirm an owner and finish it before Friday.",
      to: { conversationId: channel.id },
    },
  );
  await user.page.evaluate((messageId) => {
    window.dispatchEvent(new CustomEvent("e2e:finish-agent-work", { detail: messageId }));
  }, reply.messageId);
  const result = user.page
    .getByRole("article")
    .filter({ hasText: "The main risk is the pending security review." });
  await expect(result.getByRole("button", { name: /Worked for/ })).toBeVisible();
  await expect(user.page.getByRole("region", { name: "Jarvis reply", exact: true })).toHaveCount(0);
  await expect(user.page.getByRole("status", { name: "Agent status", exact: true })).toHaveCount(0);
  await expect(result.getByRole("button", { name: "Stop run", exact: true })).toHaveCount(0);
  await result.getByRole("button", { name: /Open transcript/ }).click();
  await expect(user.page.getByRole("link", { name: "The reply", exact: true })).toBeVisible();
});
