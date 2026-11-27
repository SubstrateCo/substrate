import {
  addAgent,
  agentMention,
  callTool,
  claimTurn,
  createAgent,
  finishTurn,
} from "../test-support/agent-work";
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
  const mention = await agentMention(owner, channel.id, agent.id);
  const root = await post<{ id: string }>(owner, "messaging/messages", {
    conversationId: channel.id,
    body: `${mention} Summarize the launch risks and suggest the next steps.`,
  });
  const turn = await claimTurn(owner, agent, {
    id: root.id,
    conversationId: channel.id,
    threadId: null,
  });
  // A browser has no bridge: the server's work shows here, and Stop goes to the server.
  const user = await client(owner);
  await visit(user, channel.id);
  const inline = user.page.getByRole("region", { name: "Jarvis reply", exact: true });
  const floating = user.page.getByRole("status", { name: "Agent status", exact: true });
  const timeline = user.page.getByRole("log", { name: "Messages", exact: true });
  const composer = user.page.getByRole("textbox", { name: /^Message / });
  await expect(inline.getByRole("button", { name: /Working ·/ })).toBeVisible();
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
  const before = { timeline: await timeline.boundingBox(), composer: await composer.boundingBox() };
  await expect(floating.getByRole("button", { name: /Working ·/ })).toBeVisible();
  await expect(floating.getByRole("button", { name: "Stop run", exact: true })).toHaveAttribute(
    "data-variant",
    "destructive-ghost",
  );
  // The notice floats over the timeline: the timeline and the composer keep their place.
  expect(await timeline.boundingBox()).toEqual(before.timeline);
  expect(await composer.boundingBox()).toEqual(before.composer);
  await captureScreenshot(user.page, "agent-run-status-offscreen");
  await floating.getByRole("button", { name: "Show Jarvis’s work", exact: true }).click();
  await expect(inline).toBeInViewport();
  await expect(floating).toHaveCount(0);
  // The summary comes from the server; the timeline stays on the home desktop.
  await inline.getByRole("button", { name: /Open transcript/ }).click();
  const transcript = user.page.getByRole("complementary", { name: "Agent transcript" });
  await expect(transcript).toBeVisible();
  await expect(transcript.getByText("The transcript is on another desktop")).toBeVisible();
  await user.page.getByRole("button", { name: "Close transcript", exact: true }).click();
  await inline.getByRole("button", { name: "Stop run", exact: true }).hover();
  await expect(user.page.getByRole("tooltip", { name: "Stop run", exact: true })).toBeVisible();
  await inline.getByRole("button", { name: "Stop run", exact: true }).click();
  await expect(inline.getByRole("button", { name: "Stop run", exact: true })).toBeDisabled();
  await expect(inline.getByRole("button", { name: "Stop run", exact: true })).toHaveAttribute(
    "aria-busy",
    "true",
  );
  // The home desktop sees the stopping turn and ends it.
  await finishTurn(owner, turn, { status: "cancelled", interruption: "stop" });
  await expect(inline.getByRole("button", { name: /^Stopped/ })).toBeVisible();
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
  const mention = await agentMention(owner, channel.id, agent.id);
  const user = await client(owner);
  await visit(user, channel.id);
  const timeline = user.page.getByRole("log", { name: "Messages", exact: true });
  // The server queues the message as it posts. Its receipt arrives with the realtime hint.
  const body = "Please review the release checklist next.";
  await post(owner, "messaging/messages", {
    conversationId: channel.id,
    body: `${mention} ${body}`,
  });
  const pending = user.page.getByRole("region", { name: "Jarvis reply", exact: true });
  await expect(pending.getByText("Queued", { exact: true })).toBeVisible();
  expect(await timeline.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(
    true,
  );
  await expect(pending.getByText("Queued", { exact: true })).toBeInViewport({ ratio: 1 });
  await expect
    .poll(() =>
      timeline.evaluate(
        (element) => element.scrollHeight - element.scrollTop - element.clientHeight,
      ),
    )
    .toBeLessThanOrEqual(1);
  await captureScreenshot(user.page, "agent-queued-status-last-message");
});

test("quiet agent work stays in its own message row between human messages", async ({
  actors,
  client,
}) => {
  const owner = actors.sender;
  const agent = await createAgent(owner, "Jarvis");
  const channel = await conversation(owner, [actors.member.email]);
  await addAgent(owner, channel.id, agent.id);
  const mention = await agentMention(owner, channel.id, agent.id);
  const root = await post<{ id: string }>(owner, "messaging/messages", {
    conversationId: channel.id,
    body: `${mention} Check the release notes.`,
  });
  const turn = await claimTurn(owner, agent, {
    id: root.id,
    conversationId: channel.id,
    threadId: null,
  });
  const user = await client(owner);
  await visit(user, channel.id);
  const pending = user.page.getByRole("region", { name: "Jarvis reply", exact: true });
  await expect(pending.getByRole("button", { name: /Working ·/ })).toBeVisible();
  await post(actors.member, "messaging/messages", {
    conversationId: channel.id,
    body: "We still need the desktop app.",
  });
  await post(owner, "messaging/messages", {
    conversationId: channel.id,
    body: "Yes, let the agent decide.",
  });
  await finishTurn(owner, turn, { status: "completed", outcome: "silent" });
  await expect(pending.getByText("Checked · nothing to report", { exact: true })).toBeVisible();
  // Agent work is a sibling row, not nested in any user's article.
  await expect(user.page.getByRole("article").filter({ has: pending })).toHaveCount(0);
  await expect(pending.getByRole("article")).toHaveCount(1);
  await expect(pending.getByText("We still need the desktop app.")).toHaveCount(0);
  await expect(pending.getByText("Yes, let the agent decide.")).toHaveCount(0);
  const followUp = user.page.getByRole("article").filter({ hasText: "Yes, let the agent decide." });
  await expect(followUp.getByText(owner.name, { exact: true })).toBeVisible();
  const agentBox = await pending.boundingBox();
  const memberBox = await user.page
    .getByRole("article")
    .filter({ hasText: "We still need the desktop app." })
    .boundingBox();
  expect(agentBox!.y + agentBox!.height).toBeLessThanOrEqual(memberBox!.y);
});

test("finished work moves to the published result and keeps its existing transcript link", async ({
  actors,
  client,
}) => {
  const owner = actors.sender;
  const agent = await createAgent(owner, "Jarvis");
  const channel = await conversation(owner);
  await addAgent(owner, channel.id, agent.id);
  const mention = await agentMention(owner, channel.id, agent.id);
  const root = await post<{ id: string }>(owner, "messaging/messages", {
    conversationId: channel.id,
    body: `${mention} Review the launch risks.`,
  });
  const turn = await claimTurn(owner, agent, {
    id: root.id,
    conversationId: channel.id,
    threadId: null,
  });
  // The agent's home desktop: its bridge serves the transcript the server doesn't keep.
  const user = await client(owner);
  await localAgentWork(user, {
    agentId: agent.id,
    turnId: turn.context.turnId,
    text: "Checked the launch plan.",
  });
  await visit(user, channel.id);
  const pending = user.page.getByRole("region", { name: "Jarvis reply", exact: true });
  await expect(pending.getByRole("button", { name: /Working ·/ })).toBeVisible();
  const pendingName = await pending.getByText("Jarvis", { exact: true }).boundingBox();
  const reply = await callTool(owner, turn, "reply", {
    body: "The main risk is the pending security review. Confirm an owner and finish it before Friday.",
    to: { conversationId: channel.id },
  });
  expect(reply.messageId).toBeTruthy();
  const result = user.page
    .getByRole("article")
    .filter({ hasText: "The main risk is the pending security review." });
  // The reply takes the pending row's place: its byline stays where the row's was.
  await expect(result.getByRole("button", { name: /Working ·/ })).toBeVisible();
  const replyName = await result.getByText("Jarvis", { exact: true }).boundingBox();
  expect(Math.abs(replyName!.y - pendingName!.y)).toBeLessThanOrEqual(4);
  expect(Math.abs(replyName!.x - pendingName!.x)).toBeLessThanOrEqual(1);
  await finishTurn(owner, turn, { status: "completed", outcome: "replied" });
  await expect(result.getByRole("button", { name: /Worked for/ })).toBeVisible();
  await expect(user.page.getByRole("region", { name: "Jarvis reply", exact: true })).toHaveCount(0);
  await expect(user.page.getByRole("status", { name: "Agent status", exact: true })).toHaveCount(0);
  await expect(result.getByRole("button", { name: "Stop run", exact: true })).toHaveCount(0);
  await result.getByRole("button", { name: /Open transcript/ }).click();
  await expect(user.page.getByRole("link", { name: "The reply", exact: true })).toBeVisible();
  await expect(user.page.getByText("Checked the launch plan.")).toBeVisible();
});
