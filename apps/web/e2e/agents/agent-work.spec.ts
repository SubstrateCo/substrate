import {
  addAgent,
  callTool,
  claimTurn,
  createAgent,
  finishTurn,
  proposeTool,
  startTurn,
} from "../test-support/agent-work";
import { conversation, post, test, visit } from "../test-support/fixtures";
import { detail, project } from "../test-support/tasks";
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
  const turn = await startTurn(owner, agent, channel.id, root);
  const device = { organizationId: owner.organizationId, installationId: agent.installationId };
  const headers = { "x-substrate-installation": agent.installationId };
  const openedResponse = await owner.request.post("/api/v1/agent-work/device/requests", {
    headers,
    data: {
      ...device,
      turnId: turn.context.turnId,
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
  await expect(user.page.getByRole("link", { name: "Agents, needs you" })).toHaveCount(0);
});

test("agent messages and task activity retain attribution and source links", async ({
  actors,
  client,
}) => {
  test.setTimeout(30_000);
  const owner = actors.sender;
  const agent = await createAgent(owner);
  const [channel, created] = await Promise.all([conversation(owner), project(owner)]);
  await addAgent(owner, channel.id, agent.id);
  const root = await ownerMessage(owner, channel.id, "Please report progress");
  const turn = await startTurn(owner, agent, channel.id, root);
  const user = await client(owner);
  await visit(user, channel.id);
  // Interactive turns may post at the top level of the conversation they came from.
  const reply = await callTool(owner, turn, "reply", {
    body: "Agent progress report",
    to: { conversationId: channel.id },
  });
  const article = user.page.getByRole("article").filter({ hasText: "Agent progress report" });
  await expect(article.getByText(agent.name, { exact: true })).toBeVisible();
  await expect(article.getByText("Agent", { exact: true })).toBeVisible();
  await expect(article.getByText("External", { exact: true })).toHaveCount(0);
  const task = await callTool(owner, turn, "create_task", {
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
  const discussion = await callTool(owner, turn, "get_task_discussion", {
    taskId: task.id,
  });
  await callTool(owner, turn, "reply", {
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
  const reply = await callTool(owner, await startTurn(owner, agent, channel.id, root), "reply", {
    body: "I need one detail first.",
    ask: { question: "Blue or green?", options: [{ label: "Blue" }, { label: "Green" }] },
  });
  expect(reply.questionId).not.toBeNull();

  // The first window shows the question under the agent's reply in the thread.
  const thread = await client(owner);
  await visit(thread, channel.id, "/messages", { messageId: reply.messageId });
  const pane = thread.page.getByRole("complementary", { name: "Thread" });
  const card = pane.getByRole("region", { name: "The agent has a question" });
  await expect(card.getByText("Blue or green?")).toBeVisible();
  // Async questions wait for the owner; they show no deadline.
  await expect(card.getByText(/Expires in/)).toHaveCount(0);

  // While the question is open, a member sees the agent's published reply and nothing of the
  // owner's agent work, neither in the thread nor on the Agents rail button.
  const member = await client(actors.member);
  await visit(member, channel.id, "/messages", { messageId: reply.messageId });
  const memberPane = member.page.getByRole("complementary", { name: "Thread" });
  await expect(memberPane.getByText("I need one detail first.")).toBeVisible();
  await expect(memberPane.getByText("Blue or green?")).toHaveCount(0);
  await expect(
    member.page
      .getByRole("navigation", { name: "Apps" })
      .getByRole("link", { name: "Agents", exact: true }),
  ).toBeVisible();

  // The second window answers from Needs you, which reads only the server.
  const inbox = await client(owner);
  await visit(inbox, undefined, "/agents");
  await expect(inbox.page.getByRole("link", { name: "Agents, needs you" })).toBeVisible();
  const needsYou = inbox.page.getByRole("list", { name: "Needs you" });
  await expect(needsYou.getByRole("link", { name: `In ${channel.name}` })).toBeVisible();
  await needsYou.getByRole("radio", { name: /Blue/ }).click();
  await needsYou.getByRole("button", { name: "Submit" }).click();
  await expect(inbox.page.getByRole("heading", { name: "Nothing needs you" })).toBeVisible();
  await expect(inbox.page.getByRole("link", { name: "Agents", exact: true })).toBeVisible();

  // The first window updates through the realtime hint.
  await expect(pane.getByText("Answered: Blue")).toBeVisible();
  await expect(card).toHaveCount(0);

  // The member's open window gets no agent-work hint and shows no answer.
  await expect(memberPane.getByText(/Answered:/)).toHaveCount(0);
});

test("the owner approves an agent's deletion; the task is deleted only after approval", async ({
  actors,
  client,
}) => {
  test.setTimeout(30_000);
  const owner = actors.sender;
  const agent = await createAgent(owner);
  const [channel, created] = await Promise.all([conversation(owner), project(owner)]);
  await addAgent(owner, channel.id, agent.id);
  const root = await ownerMessage(owner, channel.id, "Clean up the launch project");
  const turn = await startTurn(owner, agent, channel.id, root);
  const title = `Old checklist ${crypto.randomUUID()}`;
  const task = await callTool(owner, turn, "create_task", {
    projectId: created.entityId,
    title,
  });
  // Every deletion waits for the owner, so the server stores the call as a proposal.
  await proposeTool(owner, turn, "delete_task", { taskId: task.id });
  const taskIds = async () =>
    (await detail(owner, created.entityId)).tasks.map((entry) => entry.entityId);
  expect(await taskIds()).toContain(task.id);

  const approver = await client(owner);
  await visit(approver, undefined, "/agents");
  const proposal = approver.page.getByRole("region", { name: `${agent.name} proposes` });
  // The preview names the exact task and its project from the owner's own reads.
  await expect(proposal.getByText("Delete a task and its subtasks")).toBeVisible();
  await expect(proposal.getByRole("link", { name: title, exact: true })).toBeVisible();
  await expect(proposal.getByRole("link", { name: created.name, exact: true })).toBeVisible();
  await proposal.getByRole("button", { name: "Approve" }).click();
  await expect(approver.page.getByRole("heading", { name: "Nothing needs you" })).toBeVisible();

  await expect.poll(taskIds).not.toContain(task.id);
});

test("the owner approves an agent's routine and reviews its work from a browser", async ({
  actors,
  client,
}) => {
  test.setTimeout(30_000);
  const owner = actors.sender;
  const agent = await createAgent(owner);
  const dm = await post<{ id: string }>(owner, "messaging/conversations", {
    kind: "dm",
    agentIds: [agent.id],
  });
  const source = await ownerMessage(owner, dm.id, "Send me a summary every weekday morning");
  const turn = await claimTurn(owner, agent, {
    id: source.id,
    conversationId: dm.id,
    threadId: null,
  });
  const name = `Morning summary ${crypto.randomUUID()}`;
  // A routine the agent writes waits for the owner's approval before it runs.
  await callTool(owner, turn, "create_routine", {
    name,
    prompt: "Summarize yesterday's open threads.",
    cron: "0 9 * * 1-5",
    timezone: "UTC",
  });
  await finishTurn(owner, turn, { status: "completed", outcome: "silent" });

  // The browser runs no agent, so routines and activity come from the server.
  const user = await client(owner);
  await visit(user, undefined, "/agents", { agentId: agent.id, section: "routines" });
  const routines = user.page.getByRole("list", { name: "Routines", exact: true });
  await expect(routines.getByText("Needs your approval", { exact: true })).toBeVisible();
  await routines.getByRole("button", { name: `Approve ${name}`, exact: true }).click();
  await expect(routines.getByText("Needs your approval", { exact: true })).toHaveCount(0);
  await expect(user.page.getByText(`${name} approved.`)).toBeVisible();

  await user.page.getByRole("tab", { name: "Activity", exact: true }).click();
  const activity = user.page.getByRole("list", { name: "Activity", exact: true });
  await expect(activity.getByText("Checked in", { exact: true })).toBeVisible();
});
