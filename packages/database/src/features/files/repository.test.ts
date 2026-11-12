import type { SessionIdentity } from "../../core/session/identity";
import { createStorageRepository } from "../../core/storage/repository";
import { storedFiles } from "../../core/storage/schema";
import { AccessDeniedError, ConflictError } from "../../errors";
import { createRepositories } from "../../repositories";
import { member, user } from "../../schema";
import { setupDatabase } from "../../testing/database";
import { createAcceptedMessagingService } from "../../testing/messaging";
import { rejection } from "../../testing/rejection";
import { messagingMessages } from "../messaging/schema";
import { attachmentReferences } from "./repository";
import { messageAttachments, taskAttachments } from "./schema";
import { beforeEach, expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();
const scope = () => ({ userId: "alice", organizationId: f.orgA });
beforeEach(async () => {
  await f.verifyEmails();
});
const files = () => ({
  async addTask(
    identity: SessionIdentity,
    input: { taskEntityId: string; projectEntityId: string; attachmentFileIds: string[] },
  ) {
    return (await createRepositories(f.db).forSession(identity)).files.addTask(input);
  },
  async listTask(
    identity: SessionIdentity,
    input: { taskEntityId: string; projectEntityId: string },
  ) {
    return (await createRepositories(f.db).forSession(identity)).files.listTask(input);
  },
  async removeTask(
    identity: SessionIdentity,
    input: { taskEntityId: string; projectEntityId: string; attachmentId: string },
  ) {
    return (await createRepositories(f.db).forSession(identity)).files.removeTask(input);
  },
  async taskContent(
    identity: SessionIdentity,
    input: { taskEntityId: string; projectEntityId: string; attachmentId: string },
  ) {
    return (await createRepositories(f.db).forSession(identity)).files.taskContent(input);
  },
  async messageContent(
    identity: SessionIdentity,
    input: { conversationId: string; messageId: string; attachmentId: string },
  ) {
    return (await createRepositories(f.db).forSession(identity)).files.messageContent(input);
  },
});
async function staged(userId = "alice", organizationId = f.orgA) {
  const [file] = await f.db
    .insert(storedFiles)
    .values({
      id: crypto.randomUUID(),
      organizationId,
      uploadedBy: userId,
      purpose: "file",
      filename: "launch.txt",
      contentType: "text/plain",
      size: 6,
      objectKey: crypto.randomUUID(),
      sha256: "a".repeat(64),
    })
    .returning();
  return file!;
}
async function task() {
  const project = await f.forActor(f.alice).projects.create({ name: "Launch" });
  const task = await f
    .forActor(f.alice)
    .tasks.create({ projectEntityId: project.entityId, title: "Ship" });
  return { projectEntityId: project.entityId, taskEntityId: task.entityId };
}

test("task attachments inherit access, reject uploader backdoors, and block blob deletion", async () => {
  const target = await task();
  const file = await staged();
  await files().addTask(scope(), { ...target, attachmentFileIds: [file.id] });
  await files().addTask(scope(), { ...target, attachmentFileIds: [file.id] });
  expect(await files().listTask(scope(), target)).toHaveLength(1);
  const [attachment] = await files().listTask(scope(), target);
  expect(attachment).toMatchObject({ fileId: file.id, filename: "launch.txt" });
  expect(
    await files().taskContent(scope(), { ...target, attachmentId: attachment!.id }),
  ).toMatchObject({ id: file.id });
  expect(
    await rejection(files().listTask({ userId: "bob", organizationId: f.orgA }, target)),
  ).toBeInstanceOf(AccessDeniedError);
  await f
    .forActor(f.alice)
    .permissions.grant({ entityId: target.projectEntityId, actorEntityId: f.bob, level: "view" });
  const viewer = { userId: "bob", organizationId: f.orgA };
  expect((await files().listTask(viewer, target))[0]!.fileId).toBe(file.id);
  expect(
    await rejection(files().removeTask(viewer, { ...target, attachmentId: attachment!.id })),
  ).toBeInstanceOf(AccessDeniedError);
  await f
    .forActor(f.alice)
    .permissions.revoke({ entityId: target.projectEntityId, actorEntityId: f.bob });
  expect(
    await rejection(files().taskContent(viewer, { ...target, attachmentId: attachment!.id })),
  ).toBeInstanceOf(AccessDeniedError);
  const storage = createStorageRepository(f.db, attachmentReferences);
  expect(await storage.getReadable(scope(), file.id)).toBeNull();
  expect(await rejection(storage.deleteFile(scope(), file.id))).toBeInstanceOf(ConflictError);
  await files().removeTask(scope(), { ...target, attachmentId: attachment!.id });
  expect(await files().listTask(scope(), target)).toEqual([]);
  expect(
    await rejection(files().taskContent(scope(), { ...target, attachmentId: attachment!.id })),
  ).toBeInstanceOf(AccessDeniedError);
});

test("invalid files roll back the full attachment batch and cannot cross organizations", async () => {
  const target = await task();
  const file = await staged();
  const foreign = await staged("outsider", f.orgB);
  expect(
    await rejection(
      files().addTask(scope(), { ...target, attachmentFileIds: [file.id, foreign.id] }),
    ),
  ).toBeInstanceOf(AccessDeniedError);
  expect(await files().listTask(scope(), target)).toEqual([]);
  const [unchanged] = await f.db.select().from(storedFiles).where(eq(storedFiles.id, file.id));
  expect(unchanged!.publishedAt).toBeNull();
  expect(
    await rejection(
      files().addTask(
        { userId: "bob", organizationId: f.orgA },
        { ...target, attachmentFileIds: [file.id] },
      ),
    ),
  ).toBeInstanceOf(AccessDeniedError);
});

test("attachment-only messages replay safely and private files do not become admin-readable", async () => {
  await f.db.update(user).set({ emailVerified: true });
  const chat = createAcceptedMessagingService(f.db, scope());
  const conversation = await chat.createConversation({
    kind: "channel",
    name: "private",
    private: true,
  });
  const file = await staged();
  const requestId = crypto.randomUUID();
  const sent = await chat.sendMessage(conversation.id, "", undefined, requestId, [file.id]);
  expect(sent.attachments).toHaveLength(1);
  expect((await chat.listMessages(conversation.id))[0]!.attachments[0]!.filename).toBe(
    "launch.txt",
  );
  expect((await chat.sendMessage(conversation.id, "", undefined, requestId, [file.id])).id).toBe(
    sent.id,
  );
  expect(
    await rejection(chat.sendMessage(conversation.id, "changed", undefined, requestId, [])),
  ).toBeInstanceOf(ConflictError);
  const target = {
    conversationId: conversation.id,
    messageId: sent.id,
    attachmentId: sent.attachments[0]!.id,
  };
  expect((await files().messageContent(scope(), target)).id).toBe(file.id);
  await f.db.update(member).set({ role: "admin" }).where(eq(member.id, "bob-a"));
  expect(
    await rejection(files().messageContent({ userId: "bob", organizationId: f.orgA }, target)),
  ).toBeInstanceOf(AccessDeniedError);
});

test("partner downloads use conversation access, not the file's organization", async () => {
  await f.db.update(user).set({ emailVerified: true });
  const chat = createAcceptedMessagingService(f.db, scope());
  const conversation = await chat.createConversation({
    kind: "channel",
    name: "partners",
    private: true,
    emails: ["outside@example.com"],
  });
  const file = await staged();
  const sent = await chat.sendMessage(conversation.id, "Shared", undefined, undefined, [file.id]);
  const target = {
    conversationId: conversation.id,
    messageId: sent.id,
    attachmentId: sent.attachments[0]!.id,
  };
  expect(
    (await files().messageContent({ userId: "outsider", organizationId: f.orgB }, target)).id,
  ).toBe(file.id);
  const partner = createAcceptedMessagingService(f.db, {
    userId: "outsider",
    organizationId: f.orgB,
  });
  await partner.leaveConversation(conversation.id);
  expect(
    await rejection(files().messageContent({ userId: "outsider", organizationId: f.orgB }, target)),
  ).toBeInstanceOf(AccessDeniedError);
});

test("cleanup retains published references after uploader deletion and collects detached files", async () => {
  const target = await task();
  const file = await staged();
  const abandoned = await staged();
  await files().addTask(scope(), { ...target, attachmentFileIds: [file.id] });
  await f.db.update(storedFiles).set({ createdAt: new Date(0), uploadedBy: null });
  const storage = createStorageRepository(f.db, attachmentReferences);
  await storage.pruneUnusedFiles(new Date());
  expect((await f.db.select().from(storedFiles)).map((row) => row.id)).toEqual([file.id]);
  expect((await storage.cleanupCandidates(new Date())).map((row) => row.objectKey)).toContain(
    abandoned.objectKey,
  );
  const [attachment] = await files().listTask(scope(), target);
  await files().removeTask(scope(), { ...target, attachmentId: attachment!.id });
  await storage.pruneUnusedFiles(new Date());
  expect(await f.db.select().from(storedFiles)).toEqual([]);
});

test("creating a task and its files is atomic, and a published file cannot be republished", async () => {
  const project = await f.forActor(f.alice).projects.create({ name: "Launch" });
  const file = await staged();
  const created = await f.forActor(f.alice).tasks.create({
    projectEntityId: project.entityId,
    title: "With file",
    attachmentFileIds: [file.id],
  });
  expect(
    await files().listTask(scope(), {
      projectEntityId: project.entityId,
      taskEntityId: created.entityId,
    }),
  ).toHaveLength(1);
  expect(
    await rejection(
      f.forActor(f.alice).tasks.create({
        projectEntityId: project.entityId,
        title: "Cannot reuse",
        attachmentFileIds: [file.id],
      }),
    ),
  ).toBeInstanceOf(AccessDeniedError);
  expect((await f.forActor(f.alice).tasks.list(project.entityId)).map((row) => row.title)).toEqual([
    "With file",
  ]);
});

test("cleanup skips an uncommitted publication write and cannot remove its committed attachment", async () => {
  const target = await task();
  const file = await staged();
  await f.db
    .update(storedFiles)
    .set({ createdAt: new Date(0) })
    .where(eq(storedFiles.id, file.id));
  const published = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const publishing = f.db.transaction(async (tx) => {
    const workspace = await createRepositories(tx).forSession(scope());
    await workspace.files.addTask({ ...target, attachmentFileIds: [file.id] });
    published.resolve();
    await release.promise;
  });
  await published.promise;
  const storage = createStorageRepository(f.db, attachmentReferences);
  try {
    await storage.pruneUnusedFiles(new Date());
    expect((await f.db.select().from(storedFiles)).map((row) => row.id)).toEqual([file.id]);
  } finally {
    release.resolve();
    await publishing;
  }
  await storage.pruneUnusedFiles(new Date());
  expect((await files().listTask(scope(), target))[0]!.fileId).toBe(file.id);
  expect((await f.db.select().from(storedFiles)).map((row) => row.id)).toEqual([file.id]);
});

test("concurrent publication and deletion have exactly one winner", async () => {
  const target = await task();
  const storage = createStorageRepository(f.db, attachmentReferences);
  for (let attempt = 0; attempt < 8; attempt++) {
    const file = await staged();
    const publish = () => files().addTask(scope(), { ...target, attachmentFileIds: [file.id] });
    const remove = () => storage.deleteFile(scope(), file.id);
    const operations = attempt % 2 === 0 ? [publish(), remove()] : [remove(), publish()];
    const outcomes = await Promise.allSettled(operations);
    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const attachments = (await files().listTask(scope(), target)).filter(
      (item) => item.fileId === file.id,
    );
    const remaining = await f.db.select().from(storedFiles).where(eq(storedFiles.id, file.id));
    const published = outcomes[attempt % 2 === 0 ? 0 : 1]!.status === "fulfilled";
    expect(attachments).toHaveLength(published ? 1 : 0);
    expect(remaining).toHaveLength(published ? 1 : 0);
    const failure = outcomes.find((result) => result.status === "rejected");
    expect(failure?.status === "rejected" ? failure.reason : undefined).toBeInstanceOf(
      published ? ConflictError : AccessDeniedError,
    );
  }
});

test("database constraints reject wrong task organizations and empty messages after final attachment removal", async () => {
  const target = await task();
  const foreign = await staged("outsider", f.orgB);
  await rejection(
    f.db
      .insert(taskAttachments)
      .values({
        organizationId: f.orgA,
        taskEntityId: target.taskEntityId,
        fileOrganizationId: f.orgB,
        fileId: foreign.id,
        addedByActorEntityId: f.outsider,
        position: 0,
      })
      .execute(),
  );
  await f.db.update(user).set({ emailVerified: true });
  const chat = createAcceptedMessagingService(f.db, scope());
  const conversation = await chat.createConversation({ kind: "channel", name: "files" });
  const file = await staged();
  const sent = await chat.sendMessage(conversation.id, "", undefined, undefined, [file.id]);
  await rejection(
    f.db.delete(messageAttachments).where(eq(messageAttachments.messageId, sent.id)).execute(),
  );
  expect((await chat.listMessages(conversation.id))[0]!.attachments).toHaveLength(1);
  await rejection(
    f.db
      .insert(messagingMessages)
      .values({
        conversationId: conversation.id,
        authorActorEntityId: f.alice,
        authorOrganizationId: f.orgA,
        body: " ",
      })
      .execute(),
  );
});

test("message tombstones detach file metadata, block old attachment URLs, and reject send retries", async () => {
  const chat = createAcceptedMessagingService(f.db, scope());
  const conversation = await chat.createConversation({ kind: "channel", name: "deleted-files" });
  const file = await staged();
  const requestId = crypto.randomUUID();
  const sent = await chat.sendMessage(conversation.id, "", undefined, requestId, [file.id]);
  const attachmentId = sent.attachments[0]!.id;
  await chat.deleteMessage(sent.id);
  expect((await chat.listMessages(conversation.id))[0]).toMatchObject({
    body: "",
    attachments: [],
    deletedAt: expect.any(Date),
  });
  expect(await f.db.select().from(messageAttachments)).toEqual([]);
  expect(
    await createStorageRepository(f.db, attachmentReferences).getReadable(scope(), file.id),
  ).toBeNull();
  expect(
    await rejection(
      files().messageContent(scope(), {
        conversationId: conversation.id,
        messageId: sent.id,
        attachmentId,
      }),
    ),
  ).toBeInstanceOf(AccessDeniedError);
  expect(
    await rejection(
      files().messageContent(
        { userId: "bob", organizationId: f.orgA },
        { conversationId: conversation.id, messageId: sent.id, attachmentId },
      ),
    ),
  ).toBeInstanceOf(AccessDeniedError);
  expect(
    await rejection(chat.sendMessage(conversation.id, "", undefined, requestId, [file.id])),
  ).toBeInstanceOf(ConflictError);
  expect((await chat.listMessages(conversation.id))[0]!.attachments).toEqual([]);
});
