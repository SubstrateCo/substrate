import type { CompletedUpload, UploadTicket } from "@substrate/contracts/files/input";
import type { ServiceResult } from "@substrate/contracts/result";

import { addAgent, callTool, createAgent, readTool, threadTurn } from "../test-support/agent-work";
import { conversation, post, test, visit, type Actor } from "../test-support/fixtures";
import { project, share } from "../test-support/tasks";
import { expect, type APIResponse } from "@playwright/test";

// A 1x1 PNG.
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
  "base64",
);

async function data<T>(response: APIResponse) {
  expect(response.ok(), await response.text()).toBe(true);
  const result: ServiceResult<T> = await response.json();
  if (!result.success) throw new Error(result.error.message);
  return result.data;
}

/** Uploads bytes through the real signed storage flow and returns the file ID. */
async function upload(actor: Actor, filename: string, contentType: string, bytes: Buffer) {
  const ticket = await data<UploadTicket>(
    await actor.request.post("/api/v1/files/uploads", {
      data: { purpose: "file", filename, contentType, size: bytes.length },
    }),
  );
  const put = await actor.request.put(ticket.uploadUrl, { headers: ticket.headers, data: bytes });
  expect(put.ok(), "The signed upload accepts the bytes").toBe(true);
  return (
    await data<CompletedUpload>(
      await actor.request.post(`/api/v1/files/uploads/${ticket.uploadId}/complete`),
    )
  ).fileId;
}

test("an agent files a bug from a screenshot message, and the task shows the screenshot to readers of the message", async ({
  actors,
  client,
}) => {
  test.setTimeout(60_000);
  const owner = actors.sender;
  const agent = await createAgent(owner);
  const [channel, created] = await Promise.all([conversation(owner), project(owner)]);
  await addAgent(owner, channel.id, agent.id);
  const fileId = await upload(owner, "icons.png", "image/png", png);
  const report = await post<{ id: string; attachments: { id: string }[] }>(
    owner,
    "messaging/messages",
    {
      conversationId: channel.id,
      body: "File a bug: human and agent icons look the same",
      attachmentFileIds: [fileId],
    },
  );
  const turn = threadTurn(channel.id, report.id, agent.installationId);

  // The agent sees the screenshot on the message and can look at it.
  const thread = await readTool(owner, agent.id, turn, "read_thread", { messageId: report.id });
  const [screenshot] = thread.root.attachments;
  expect(screenshot).toEqual({
    file: {
      type: "message_attachment",
      messageId: report.id,
      attachmentId: report.attachments[0]!.id,
    },
    filename: "icons.png",
    contentType: "image/png",
    size: png.length,
  });
  const read = await readTool(owner, agent.id, turn, "read_file", { file: screenshot!.file });
  expect(read.content).toMatchObject({ kind: "image", mimeType: "image/webp" });

  // The task it files keeps the screenshot through its source message.
  const task = await callTool(owner, agent.id, turn, "create_task", {
    projectId: created.entityId,
    title: "Make human and agent icons distinct",
    sourceMessageId: report.id,
  });
  expect(task.sourceAttachments).toEqual([screenshot]);

  const user = await client(owner);
  await visit(user, undefined, "/tasks", { projectId: created.entityId, taskId: task.id });
  const source = user.page.getByRole("region", { name: "Source message files", exact: true });
  const image = source.getByRole("img", { name: "icons.png", exact: true });
  await expect(image).toBeVisible();
  await expect
    .poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth))
    .toBe(1);
  await expect(source.getByRole("link", { name: "Open source message" })).toBeVisible();

  // A project member who cannot open the private channel does not see the screenshot.
  await share(owner, created.entityId, actors.member.name, "view");
  const member = await client(actors.member);
  await visit(member, undefined, "/tasks", { projectId: created.entityId, taskId: task.id });
  await expect(
    member.page.getByRole("heading", { name: "Make human and agent icons distinct" }),
  ).toBeVisible();
  await expect(
    member.page.getByRole("region", { name: "Task attachments", exact: true }),
  ).toBeVisible();
  await expect(
    member.page.getByRole("region", { name: "Source message files", exact: true }),
  ).toHaveCount(0);
  await expect(member.page.getByRole("img", { name: "icons.png" })).toHaveCount(0);
});
