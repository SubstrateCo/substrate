import type { Attachment } from "@substrate/contracts/files/attachments";
import type { CompletedUpload } from "@substrate/contracts/files/input";
import type { TasksWrite } from "@substrate/contracts/tasks/input";

import { appOrigin } from "./test-support/environment";
import { complete, createUpload, putBytes, rejected, result, root } from "./test-support/files";
import { test } from "./test-support/fixtures";
import { expect } from "@playwright/test";
import { randomUUID } from "node:crypto";

const origin = appOrigin;

type WorkspaceWrite<T = TasksWrite> = T extends TasksWrite ? Omit<T, "organizationId"> : never;
test("task attachments enforce workspace, parent, origin and download boundaries", async ({
  actors: { outsider: a, owner: b },
  request: anonymous,
}) => {
  const workspace = { id: b.organizationId };
  const foreign = { id: a.organizationId };
  const write = (data: WorkspaceWrite) =>
    b.request.post("/api/v1/tasks/mutations", {
      headers: { origin },
      data: { organizationId: workspace.id, ...data },
    });
  const project = await result<{ id: string }>(
    await write({ action: "createProject", name: "Files" }),
  );
  const task = await result<{ id: string }>(
    await write({ action: "createTask", projectEntityId: project.id, title: "With attachments" }),
  );
  const bytes = Buffer.from("Private task attachment");
  const upload = await createUpload(b, "file", "private-task.txt", "text/plain", bytes);
  await putBytes(anonymous, upload, bytes);
  const { fileId } = await result<CompletedUpload>(await complete(b, upload));
  const target = {
    organizationId: workspace.id,
    projectEntityId: project.id,
    taskEntityId: task.id,
  };
  const attach = { ...target, attachmentFileIds: [fileId] };
  expect(
    (
      await b.request.post(`${root}/attachments/tasks`, {
        headers: { origin: "https://untrusted.example.test" },
        data: attach,
      })
    ).status(),
  ).toBe(403);
  await result(
    await b.request.post(`${root}/attachments/tasks`, { headers: { origin }, data: attach }),
  );
  const [attachment] = await result<Attachment[]>(
    await b.request.get(`${root}/attachments/tasks`, { params: target }),
  );
  expect(attachment!.filename).toBe("private-task.txt");
  const params = { ...target, attachmentId: attachment!.id };
  const download = await b.request.get(`${root}/attachments/tasks/content`, {
    params,
    maxRedirects: 0,
  });
  expect(download.status()).toBe(200);
  expect(download.headers()["cache-control"]).toContain("no-store");
  expect(await download.body()).toEqual(bytes);
  expect(download.headers()["content-disposition"]).toContain("attachment;");
  expect(download.headers()["content-type"]).toBe("application/octet-stream");
  expect((await b.request.get(`${root}/${fileId}/content`, { maxRedirects: 0 })).status()).toBe(
    404,
  );
  expect((await b.request.delete(`${root}/${fileId}`, { headers: { origin } })).status()).toBe(409);
  expect(
    (
      await a.request.get(`${root}/attachments/tasks`, {
        params: { ...target, organizationId: foreign.id },
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await anonymous.get(`${root}/attachments/tasks/content`, { params, maxRedirects: 0 })
    ).status(),
  ).toBe(401);
  expect(
    (
      await b.request.get(`${root}/attachments/tasks/content`, {
        params: { ...params, taskEntityId: randomUUID() },
        maxRedirects: 0,
      })
    ).status(),
  ).toBe(404);
  await result(
    await b.request.delete(`${root}/attachments/tasks`, { headers: { origin }, data: params }),
  );
  expect(
    (
      await b.request.get(`${root}/attachments/tasks/content`, { params, maxRedirects: 0 })
    ).status(),
  ).toBe(404);
});

test("message attachments publish only completed uploads and require conversation access", async ({
  actors: { outsider: a, owner: b },
  request: anonymous,
}) => {
  const workspace = { id: b.organizationId };
  const foreign = { id: a.organizationId };
  const conversation = await result<{ id: string }>(
    await b.request.post("/api/v1/messaging/conversations", {
      headers: { origin },
      data: { organizationId: workspace.id, kind: "channel", name: "private-files", private: true },
    }),
  );
  const upload = await createUpload(
    b,
    "file",
    "private-message.txt",
    "text/plain",
    Buffer.from("Message content"),
  );
  const data = {
    organizationId: workspace.id,
    conversationId: conversation.id,
    body: "",
    attachmentFileIds: [upload.uploadId],
    requestId: randomUUID(),
  };
  const send = () => b.request.post("/api/v1/messaging/messages", { headers: { origin }, data });
  expect((await send()).status()).toBe(404);
  await putBytes(anonymous, upload, Buffer.from("Message content"));
  await result<CompletedUpload>(await complete(b, upload));
  const sent = await result<{ id: string; attachments: Attachment[] }>(await send());
  expect(sent.attachments).toHaveLength(1);
  const params = {
    organizationId: workspace.id,
    conversationId: conversation.id,
    messageId: sent.id,
    attachmentId: sent.attachments[0]!.id,
  };
  expect(
    (
      await b.request.get(`${root}/attachments/messages/content`, { params, maxRedirects: 0 })
    ).status(),
  ).toBe(200);
  expect(
    (await b.request.get(`${root}/${upload.uploadId}/content`, { maxRedirects: 0 })).status(),
  ).toBe(404);
  const denied = await a.request.get(`${root}/attachments/messages/content`, {
    params: { ...params, organizationId: foreign.id },
    maxRedirects: 0,
  });
  expect(denied.status()).toBe(404);
  await rejected(denied, ["private-message.txt", "Message content"]);
});
