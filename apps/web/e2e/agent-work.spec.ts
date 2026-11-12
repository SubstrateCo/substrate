import { addAgent, callTool, createAgent, threadTurn } from "./test-support/agent-work";
import { conversation, post, test, visit } from "./test-support/fixtures";
import { detail, project } from "./test-support/tasks";
import { expect } from "@playwright/test";
import { z } from "zod";

async function ownerMessage(
  actor: Parameters<typeof conversation>[0],
  conversationId: string,
  body: string,
) {
  return post<{ id: string }>(actor, "messaging/messages", { conversationId, body });
}

test("an undelivered native answer stays visible after the agent stops waiting", async ({
  actors,
  client,
}) => {
  const owner = actors.sender;
  const agent = await createAgent(owner);
  const channel = await conversation(owner);
  await addAgent(owner, channel.id, agent.id);
  const root = await ownerMessage(owner, channel.id, "Please check the files");
  const turn = threadTurn(channel.id, root.id, agent.installationId);
  const device = { organizationId: owner.organizationId, installationId: agent.installationId };
  const headers = { "x-substrate-installation": agent.installationId };
  const openedResponse = await owner.request.post("/api/v1/agent-work/device/requests", {
    headers,
    data: {
      ...device,
      userAgentId: agent.id,
      sessionKey: turn.sessionKey,
      turnId: turn.turnId,
      epoch: 1,
      kind: "permission",
      mode: "blocking",
      nativeRequestId: "check-files",
      anchorMessageId: root.id,
      conversationId: channel.id,
      payload: {
        type: "approval",
        title: "Allow reading files?",
        detail: "Read the launch notes",
        options: [{ id: "once", label: "Allow once", style: "approve" }],
      },
    },
  });
  expect(openedResponse.ok(), await openedResponse.text()).toBe(true);
  const { data: opened } = z
    .object({ data: z.object({ id: z.uuid() }) })
    .parse(await openedResponse.json());
  const user = await client(owner);
  await visit(user, channel.id);
  const card = user.page.getByRole("region", { name: "Allow reading files?", exact: true });
  await card.getByRole("button", { name: "Allow once", exact: true }).click();
  await expect(user.page.getByText("· Answered: Allow once", { exact: true })).toBeVisible();
  const closed = await owner.request.post("/api/v1/agent-work/device/requests/close", {
    headers,
    data: {
      ...device,
      requestId: opened.id,
      status: "orphaned",
    },
  });
  expect(closed.ok(), await closed.text()).toBe(true);
  await expect(
    user.page.getByText(
      "· Your answer arrived after the agent stopped waiting · Answered: Allow once",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(card).toHaveCount(0);
  await expect(user.page.getByRole("button", { name: "Agents, needs you" })).toHaveCount(0);
});

test("agent messages and task activity retain attribution and source links", async ({
  actors,
  client,
}) => {
  test.setTimeout(30_000);
  const owner = actors.sender;
  const agent = await createAgent(owner);
  const [channel, created] = await Promise.all([conversation(owner), project(owner)]);
  const root = await ownerMessage(owner, channel.id, "Please report progress");
  const turn = threadTurn(channel.id, root.id, agent.installationId);
  const user = await client(owner);
  await visit(user, channel.id);
  // Interactive turns may post at the top level of the conversation they came from.
  const reply = await callTool(owner, agent.id, turn, "reply", {
    body: "Agent progress report",
    to: { conversationId: channel.id },
  });
  const article = user.page.getByRole("article").filter({ hasText: "Agent progress report" });
  await expect(article.getByText(agent.name, { exact: true })).toBeVisible();
  await expect(article.getByText("Agent", { exact: true })).toBeVisible();
  await expect(article.getByText("External", { exact: true })).toHaveCount(0);
  const task = await callTool(owner, agent.id, turn, "create_task", {
    projectId: created.entityId,
    title: "Agent follow-up",
    sourceMessageId: reply.messageId,
  });
  await visit(user, undefined, "/tasks", { projectId: created.entityId, taskId: task.id });
  const activity = user.page.getByRole("region", { name: "Task activity", exact: true });
  await expect(activity.getByText("Agent", { exact: true }).first()).toBeVisible();
  await expect(
    user.page.getByRole("link", {
      name: `Created from a discussion · ${channel.name}`,
      exact: true,
    }),
  ).toBeVisible();
  const discussion = await callTool(owner, agent.id, turn, "get_task_discussion", {
    taskId: task.id,
  });
  await callTool(owner, agent.id, turn, "reply", {
    body: "Agent investigation notes",
    to: { conversationId: discussion.conversationId },
  });
  await user.page.getByRole("link", { name: "View full conversation", exact: true }).click();
  const notes = user.page.getByRole("article").filter({ hasText: "Agent investigation notes" });
  await expect(notes.getByText(agent.name, { exact: true })).toBeVisible();
  await expect(notes.getByText("Agent", { exact: true })).toBeVisible();
  await expect(notes.getByText("External", { exact: true })).toHaveCount(0);
  expect(new URL(user.page.url()).searchParams.get("conversationId")).toBe(
    discussion.conversationId,
  );
});

test("the owner answers an agent's question from another window; members see only the reply", async ({
  actors,
  client,
}) => {
  test.setTimeout(30_000);
  const owner = actors.sender;
  const agent = await createAgent(owner);
  const channel = await conversation(owner, [actors.member.email]);
  await addAgent(owner, channel.id, agent.id);
  const root = await ownerMessage(owner, channel.id, "Which color should the launch use?");
  const reply = await callTool(
    owner,
    agent.id,
    threadTurn(channel.id, root.id, agent.installationId),
    "reply",
    {
      body: "I need one detail first.",
      ask: { question: "Blue or green?", options: [{ label: "Blue" }, { label: "Green" }] },
    },
  );
  expect(reply.questionId).not.toBeNull();

  // The first window shows the question under the agent's reply in the thread.
  const thread = await client(owner);
  await visit(thread, channel.id, "/dashboard", { messageId: reply.messageId });
  const pane = thread.page.getByRole("complementary", { name: "Thread" });
  const card = pane.getByRole("region", { name: "The agent has a question" });
  await expect(card.getByText("Blue or green?")).toBeVisible();
  // Async questions wait for the owner; they show no deadline.
  await expect(card.getByText(/Expires in/)).toHaveCount(0);

  // While the question is open, a member sees the agent's published reply and nothing of the
  // owner's agent work, neither in the thread nor on the Agents rail button.
  const member = await client(actors.member);
  await visit(member, channel.id, "/dashboard", { messageId: reply.messageId });
  const memberPane = member.page.getByRole("complementary", { name: "Thread" });
  await expect(memberPane.getByText("I need one detail first.")).toBeVisible();
  await expect(memberPane.getByText("Blue or green?")).toHaveCount(0);
  await expect(
    member.page
      .getByRole("navigation", { name: "Apps" })
      .getByRole("button", { name: "Agents", exact: true }),
  ).toBeVisible();

  // The second window answers from Needs you, which reads only the server.
  const inbox = await client(owner);
  await visit(inbox, undefined, "/agents");
  await expect(inbox.page.getByRole("button", { name: "Agents, needs you" })).toBeVisible();
  const needsYou = inbox.page.getByRole("list", { name: "Needs you" });
  await expect(needsYou.getByRole("link", { name: `In ${channel.name}` })).toBeVisible();
  await needsYou.getByRole("radio", { name: /Blue/ }).click();
  await needsYou.getByRole("button", { name: "Submit" }).click();
  await expect(inbox.page.getByRole("heading", { name: "Nothing needs you" })).toBeVisible();
  await expect(inbox.page.getByRole("button", { name: "Agents", exact: true })).toBeVisible();

  // The first window updates through the realtime hint.
  await expect(pane.getByText("Answered: Blue")).toBeVisible();
  await expect(card).toHaveCount(0);

  // The member's open window gets no agent-work hint and shows no answer.
  await expect(memberPane.getByText(/Answered:/)).toHaveCount(0);
});

test("the owner approves the exact proposed message; it posts as the agent and links back to its approval", async ({
  actors,
  client,
}) => {
  test.setTimeout(30_000);
  const owner = actors.sender;
  const agent = await createAgent(owner);
  const [origin, target] = await Promise.all([conversation(owner), conversation(owner)]);
  const root = await ownerMessage(owner, origin.id, "Share the update with the team");
  const body = `Launch moves to **Friday** ${crypto.randomUUID()}`;
  await callTool(owner, agent.id, threadTurn(origin.id, root.id, agent.installationId), "propose", {
    summary: "Post the launch date in the team channel.",
    action: { type: "reply_elsewhere", input: { conversationId: target.id, body } },
  });

  const watcher = await client(owner);
  await visit(watcher, target.id);
  const approver = await client(owner);
  await visit(approver, undefined, "/agents");
  const proposal = approver.page.getByRole("region", { name: `${agent.name} proposes` });
  await expect(proposal.getByText("Post the launch date in the team channel.")).toBeVisible();
  // The preview names the target and renders the exact body.
  await expect(proposal.getByText(target.name, { exact: true })).toBeVisible();
  await expect(proposal.getByText("Friday", { exact: true })).toBeVisible();
  await proposal.getByRole("button", { name: "Approve" }).click();
  await expect(approver.page.getByRole("heading", { name: "Nothing needs you" })).toBeVisible();

  const posted = watcher.page
    .getByRole("article")
    .filter({ hasText: body.replace("**Friday**", "Friday") });
  await expect(posted.getByText(agent.name, { exact: true })).toBeVisible();
  await expect(posted.getByText("Agent", { exact: true })).toBeVisible();
  await expect(posted.getByText("You approved this")).toBeVisible();
  await expect(posted.getByRole("link", { name: `from ${origin.name}` })).toBeVisible();
});

test("a declined proposal changes nothing", async ({ actors, client }) => {
  const owner = actors.sender;
  const agent = await createAgent(owner);
  const [origin, created] = await Promise.all([conversation(owner), project(owner)]);
  const root = await ownerMessage(owner, origin.id, "Track this");
  await callTool(owner, agent.id, threadTurn(origin.id, root.id, agent.installationId), "propose", {
    summary: "Create a follow-up task.",
    action: { type: "create_task", input: { projectId: created.entityId, title: "Never created" } },
  });
  const user = await client(owner);
  await visit(user, undefined, "/agents");
  const proposal = user.page.getByRole("region", { name: `${agent.name} proposes` });
  await expect(proposal.getByText("Never created")).toBeVisible();
  await proposal.getByRole("button", { name: "Decline" }).click();
  await expect(user.page.getByRole("heading", { name: "Nothing needs you" })).toBeVisible();
  await visit(user, undefined, "/tasks", { projectId: created.entityId });
  await expect(user.page.getByText("Never created")).toHaveCount(0);
  expect((await detail(owner, created.entityId)).tasks).toEqual([]);
});
