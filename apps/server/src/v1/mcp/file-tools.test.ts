import { fileTextPage } from "@substrate/contracts/agent-tools/tools";

import { AccessDeniedError, ValidationError } from "../../../../../packages/database/src/errors";
import { storedFiles } from "../../../../../packages/database/src/schema";
import { setupDatabase } from "../../../../../packages/database/src/testing/database";
import { rejection } from "../../../../../packages/database/src/testing/rejection";
import { dmTurn } from "../../../../../packages/database/src/testing/turns";
import { agentWorkFixture } from "./test-support";
import { expect, test } from "bun:test";
import sharp from "sharp";

const f = setupDatabase();

async function tools() {
  const fixture = await agentWorkFixture(f);
  const turn = dmTurn(fixture.dm.id);
  const call = <K extends Parameters<typeof fixture.call>[0]>(
    tool: K,
    input: Parameters<typeof fixture.call>[1],
    kind: "interactive" | "unattended" = "interactive",
  ) => fixture.call(tool, input, kind === "interactive" ? turn : dmTurn(fixture.dm.id, kind));
  /** Uploads a file as `userId` and returns its stored row; `bytes` is what storage holds. */
  async function stored(
    filename: string,
    contentType: string,
    bytes: Uint8Array | null,
    userId = "alice",
  ) {
    const objectKey = crypto.randomUUID();
    if (bytes) fixture.storage.objects.set(objectKey, bytes);
    const [file] = await f.db
      .insert(storedFiles)
      .values({
        id: crypto.randomUUID(),
        organizationId: f.orgA,
        uploadedBy: userId,
        purpose: "file",
        filename,
        contentType,
        size: bytes?.length || 1,
        objectKey,
        sha256: "a".repeat(64),
      })
      .returning();
    return file!;
  }
  async function project() {
    return call("create_project", { requestId: crypto.randomUUID(), name: "Bugs" });
  }
  return { ...fixture, turn, call, stored, project };
}

const png = () =>
  sharp({ create: { width: 64, height: 32, channels: 3, background: "#c00" } })
    .png()
    .toBuffer();

test("a bug filed from a message with a screenshot keeps the image visible to the agent", async () => {
  const { alice, call, stored, project } = await tools();
  const channel = await alice.createConversation({ kind: "channel", name: "bugs" });
  const screenshot = await stored("icons.png", "image/png", await png());
  const report = await alice.sendMessage(
    channel.id,
    "Human and agent icons look the same",
    undefined,
    undefined,
    [screenshot.id],
  );
  const file = {
    type: "message_attachment",
    messageId: report.id,
    attachmentId: report.attachments[0]!.id,
  } as const;

  // Reading the source shows the image, with a locator the agent can open.
  const thread = await call("read_thread", { messageId: report.id });
  expect(thread.root.attachments).toEqual([
    { file, filename: "icons.png", contentType: "image/png", size: screenshot.size },
  ]);
  const conversation = await call("read_conversation", { conversationId: channel.id });
  expect(conversation.items[0]!.attachments.map((item) => item.file)).toEqual([file]);

  const read = await call("read_file", { file });
  if (read.content.kind !== "image") throw new Error(`Expected an image, got ${read.content.kind}`);
  // The preview is re-encoded, not the uploaded bytes.
  const preview = await sharp(Buffer.from(read.content.data, "base64")).metadata();
  expect(preview).toMatchObject({ format: "webp", width: 64, height: 32 });

  // The task keeps the source message, and with it the screenshot, without a copy.
  const { id: projectId } = await project();
  const task = await call("create_task", {
    requestId: crypto.randomUUID(),
    projectId,
    title: "Fix human and agent icons",
    sourceMessageId: report.id,
  });
  expect(task.attachments).toEqual([]);
  expect(task.sourceAttachments.map((item) => item.file)).toEqual([file]);
  expect((await call("get_task", { taskId: task.id })).sourceAttachments).toEqual(
    thread.root.attachments,
  );
});

test("read_file pages text, reports unsupported and missing files, and download_file returns the bytes", async () => {
  const { alice, call, stored } = await tools();
  const channel = await alice.createConversation({ kind: "channel", name: "logs" });
  const log = "é".repeat(fileTextPage) + "tail";
  const text = await stored("crash.log", "text/plain", new TextEncoder().encode(log));
  const pdf = await stored("spec.pdf", "application/pdf", new Uint8Array([37, 80, 68, 70]));
  const gone = await stored("gone.txt", "text/plain", null);
  const broken = await stored("broken.png", "image/png", new Uint8Array([1, 2, 3]));
  const message = await alice.sendMessage(channel.id, "Files", undefined, undefined, [
    text.id,
    pdf.id,
    gone.id,
    broken.id,
  ]);
  const [textFile, pdfFile, goneFile, brokenFile] = message.attachments.map((attachment) => ({
    type: "message_attachment",
    messageId: message.id,
    attachmentId: attachment.id,
  }));

  const first = await call("read_file", { file: textFile });
  expect(first.content).toEqual({
    kind: "text",
    text: "é".repeat(fileTextPage),
    offset: 0,
    nextOffset: fileTextPage,
  });
  expect((await call("read_file", { file: textFile, offset: fileTextPage })).content).toEqual({
    kind: "text",
    text: "tail",
    offset: fileTextPage,
    nextOffset: null,
  });
  for (const file of [pdfFile, goneFile, brokenFile])
    expect((await call("read_file", { file })).content.kind).toBe("unavailable");

  const download = await call("download_file", { file: pdfFile });
  expect(Buffer.from(download.data, "base64")).toEqual(Buffer.from([37, 80, 68, 70]));
  expect(await rejection(call("download_file", { file: goneFile }))).toBeInstanceOf(
    ValidationError,
  );
});

test("files of messages and tasks the owner cannot open stay closed and unlisted", async () => {
  const { alice, bob, call, stored, project } = await tools();
  const secret = await bob.createConversation({ kind: "channel", name: "private", private: true });
  const hidden = await stored("secret.png", "image/png", await png(), "bob");
  const message = await bob.sendMessage(secret.id, "Private", undefined, undefined, [hidden.id]);
  const file = {
    type: "message_attachment",
    messageId: message.id,
    attachmentId: message.attachments[0]!.id,
  };
  for (const tool of ["read_file", "download_file"] as const)
    expect(await rejection(call(tool, { file }))).toBeInstanceOf(AccessDeniedError);

  const open = await alice.createConversation({ kind: "channel", name: "open" });
  const visible = await stored("visible-notes.txt", "text/plain", new TextEncoder().encode("ok"));
  const posted = await alice.sendMessage(open.id, "Notes", undefined, undefined, [visible.id]);
  // An attachment ID from another message does not open through this one.
  expect(
    await rejection(
      call("read_file", {
        file: { ...file, messageId: posted.id },
      }),
    ),
  ).toBeInstanceOf(AccessDeniedError);

  const { id: projectId } = await project();
  const task = await call("create_task", { requestId: crypto.randomUUID(), projectId, title: "T" });
  const listed = await call("list_files", {});
  expect(listed.items.map((item) => item.filename)).toEqual(["visible-notes.txt"]);
  expect(
    (await call("list_files", { query: "notes", mediaType: "text/" })).items.map(
      (item) => item.filename,
    ),
  ).toEqual(["visible-notes.txt"]);
  expect((await call("list_files", { mediaType: "image/" })).items).toEqual([]);
  expect((await call("list_files", { attachedTo: "task" })).items).toEqual([]);

  // A task attachment lists under the task and opens through it.
  const attached = await call("attach_task_file", {
    requestId: crypto.randomUUID(),
    taskId: task.id,
    file: {
      type: "message_attachment",
      messageId: posted.id,
      attachmentId: posted.attachments[0]!.id,
    },
  });
  const [taskFile] = attached.attachments;
  expect(taskFile).toMatchObject({
    file: { type: "task_attachment", taskId: task.id },
    filename: "visible-notes.txt",
  });
  expect((await call("list_files", { attachedTo: "task" })).items.map((item) => item.file)).toEqual(
    [taskFile!.file],
  );
  expect((await call("read_file", { file: taskFile!.file })).content).toMatchObject({ text: "ok" });
});

test("attach_task_file shares a readable message file once, only in interactive turns", async () => {
  const { alice, bob, call, stored, project } = await tools();
  const { id: projectId } = await project();
  const task = await call("create_task", { requestId: crypto.randomUUID(), projectId, title: "T" });
  const channel = await alice.createConversation({ kind: "channel", name: "bugs" });
  const image = await stored("bug.png", "image/png", await png());
  const message = await alice.sendMessage(channel.id, "Bug", undefined, undefined, [image.id]);
  const input = {
    taskId: task.id,
    file: {
      type: "message_attachment",
      messageId: message.id,
      attachmentId: message.attachments[0]!.id,
    },
  };

  // A background turn cannot share a file, and it cannot wait for approval to do it.
  expect(
    await rejection(
      call("attach_task_file", { ...input, requestId: crypto.randomUUID() }, "unattended"),
    ),
  ).toBeInstanceOf(ValidationError);
  expect((await call("get_task", { taskId: task.id })).attachments).toEqual([]);

  const first = await call("attach_task_file", { ...input, requestId: crypto.randomUUID() });
  const again = await call("attach_task_file", { ...input, requestId: crypto.randomUUID() });
  expect(first.attachments).toHaveLength(1);
  expect(again.attachments).toEqual(first.attachments);

  // A file from a conversation the owner cannot open cannot be shared.
  const secret = await bob.createConversation({ kind: "channel", name: "private", private: true });
  const hidden = await stored("secret.png", "image/png", await png(), "bob");
  const privateMessage = await bob.sendMessage(secret.id, "x", undefined, undefined, [hidden.id]);
  expect(
    await rejection(
      call("attach_task_file", {
        requestId: crypto.randomUUID(),
        taskId: task.id,
        file: {
          type: "message_attachment",
          messageId: privateMessage.id,
          attachmentId: privateMessage.attachments[0]!.id,
        },
      }),
    ),
  ).toBeInstanceOf(AccessDeniedError);
  expect((await call("get_task", { taskId: task.id })).attachments).toHaveLength(1);
});
