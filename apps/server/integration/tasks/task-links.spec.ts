import { rejected, result, tasks } from "../test-support/api";
import { appOrigin } from "../test-support/environment";
import { test, type Actor } from "../test-support/fixtures";
import { expect } from "@playwright/test";

type End = { entityId: string; title: string } | null;
type Detail = {
  actors: { entityId: string; name: string }[];
  links: { id: string; kind: string; source: End; target: End; blocking: boolean }[];
};

const { write, create: created, project } = tasks;

async function setup(owner: Actor, member: Actor) {
  const open = await created(owner, { action: "createProject", name: "Open work" });
  const closed = await created(owner, { action: "createProject", name: "Closed work" });
  const visible = await created(owner, {
    action: "createTask",
    projectEntityId: open,
    title: "Visible task",
  });
  const secret = await created(owner, {
    action: "createTask",
    projectEntityId: closed,
    title: "Undisclosed acquisition",
  });
  const detail = await result<Detail>(await project(owner, open));
  const memberActor = detail.actors.find((actor) => actor.name === member.name)!.entityId;
  await result(
    await write(owner, {
      action: "share",
      projectEntityId: open,
      actorEntityId: memberActor,
      level: "edit",
    }),
  );
  return { open, closed, visible, secret, memberActor };
}

test("task links enforce access, origin, and workspace, and redact a task the reader cannot open", async ({
  actors: { owner: sharedOwner, member: sharedMember, outsider },
  workspace,
}) => {
  const [owner, member] = await workspace(sharedOwner, sharedMember);
  const { open, closed, visible, secret } = await setup(owner, member);
  const link = {
    action: "addTaskLink" as const,
    projectEntityId: open,
    taskEntityId: visible,
    relation: "blocked_by" as const,
    otherTaskEntityId: secret,
  };
  expect((await write(owner, link, "https://untrusted.example.test")).status()).toBe(403);
  await rejected(await write(member, link), ["Undisclosed acquisition"]);
  await rejected(
    await write(outsider, { ...link, relation: "related_to", otherTaskEntityId: visible }),
  );
  await result(await write(owner, link));
  expect((await write(owner, link)).status()).toBe(400);

  const seen = await project(member, open);
  expect(await seen.text()).not.toContain("Undisclosed acquisition");
  const [redacted] = (await result<Detail>(seen)).links;
  expect(redacted).toMatchObject({
    kind: "blocks",
    source: null,
    target: { entityId: visible, title: "Visible task" },
    blocking: true,
  });
  expect((await result<Detail>(await project(owner, open))).links[0]!.source).toMatchObject({
    entityId: secret,
    title: "Undisclosed acquisition",
  });

  const remove = { action: "removeTaskLink" as const, linkId: redacted!.id };
  await rejected(await write(member, { ...remove, projectEntityId: closed, taskEntityId: secret }));
  await result(await write(member, { ...remove, projectEntityId: open, taskEntityId: visible }));
  expect((await result<Detail>(await project(owner, open))).links).toEqual([]);
});

test("task discussions use shared messages, references and task access", async ({
  actors: { owner: sharedOwner, member: sharedMember, outsider },
  workspace,
  request: anonymous,
}) => {
  const [owner, member] = await workspace(sharedOwner, sharedMember);
  const { open, closed, visible, secret, memberActor } = await setup(owner, member);
  const second = await created(owner, {
    action: "createTask",
    projectEntityId: open,
    title: "Second task",
  });
  const resolve = (
    actor: Actor,
    projectEntityId = open,
    taskEntityId = second,
    origin = appOrigin,
  ) =>
    actor.request.post("/api/v1/tasks/discussion", {
      headers: { origin },
      data: { organizationId: actor.organizationId, projectEntityId, taskEntityId },
    });
  const { conversationId } = await result<{ conversationId: string }>(await resolve(member));
  expect(await result(await resolve(owner))).toEqual({ conversationId });
  expect((await resolve(owner, open, second, "https://untrusted.example.test")).status()).toBe(403);
  await rejected(await resolve(member, closed, secret), ["Undisclosed acquisition"]);
  await rejected(await resolve(owner, closed, second));
  await rejected(await resolve(outsider));
  expect(
    (
      await anonymous.post("/api/v1/tasks/discussion", {
        headers: { origin: appOrigin },
        data: { organizationId: owner.organizationId, projectEntityId: open, taskEntityId: second },
      })
    ).status(),
  ).toBe(401);

  const send = (actor: Actor, body: string, target = conversationId) =>
    actor.request.post("/api/v1/messaging/messages", {
      headers: { origin: appOrigin },
      data: { organizationId: actor.organizationId, conversationId: target, body },
    });
  const messages = (actor: Actor) =>
    actor.request.get("/api/v1/messaging/messages", {
      params: { organizationId: actor.organizationId, conversationId },
    });
  await rejected(await send(member, `See @[task:${secret}]`), ["Undisclosed acquisition"]);
  const sent = await result<{ id: string }>(
    await send(owner, `@[person:${memberActor}] see @[task:${visible}] and @[task:${secret}]`),
  );
  expect(await result<{ id: string }[]>(await messages(member))).toMatchObject([{ id: sent.id }]);
  const page = await member.request.post("/api/v1/context/message-page", {
    headers: { origin: appOrigin },
    data: { organizationId: member.organizationId, messageIds: [sent.id] },
  });
  expect(await page.text()).not.toContain("Undisclosed acquisition");
  const [context] = await result<{ links: { entityId: string }[] }[]>(page);
  expect(context!.links).toEqual(
    expect.arrayContaining([expect.objectContaining({ entityId: visible })]),
  );
  expect(context!.links.some((link) => link.entityId === secret)).toBe(false);
  const related = await member.request.get("/api/v1/context/related", {
    params: { organizationId: member.organizationId, entityId: visible },
  });
  expect(await result<{ messageId: string }[]>(related)).toEqual(
    expect.arrayContaining([expect.objectContaining({ messageId: sent.id })]),
  );
  const feed = await member.request.get("/api/v1/context/notifications/groups", {
    params: { organizationId: member.organizationId },
  });
  const { items } = await result<{ items: { kind: string; actorName: string | null }[] }>(feed);
  expect(items).toEqual(
    expect.arrayContaining([expect.objectContaining({ kind: "mention", actorName: owner.name })]),
  );

  const derived = await result<{ entityId: string }>(
    await owner.request.post("/api/v1/context/source-tasks", {
      headers: { origin: appOrigin },
      data: {
        organizationId: owner.organizationId,
        requestId: crypto.randomUUID(),
        messageId: sent.id,
        projectEntityId: open,
        title: "Follow up from the discussion",
      },
    }),
  );
  const sourceContext = await result<{ links: { entityId: string; purpose: string }[] }[]>(
    await owner.request.post("/api/v1/context/message-page", {
      headers: { origin: appOrigin },
      data: { organizationId: owner.organizationId, messageIds: [sent.id] },
    }),
  );
  expect(sourceContext[0]!.links).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ entityId: derived.entityId, purpose: "source" }),
    ]),
  );

  await result(
    await write(owner, {
      action: "share",
      projectEntityId: open,
      actorEntityId: memberActor,
      level: "view",
    }),
  );
  expect(await result(await resolve(member))).toEqual({ conversationId });
  expect(await result<{ id: string }[]>(await messages(member))).toMatchObject([{ id: sent.id }]);
  await rejected(await send(member, "Read-only viewer"));
  const conversations = await result<{ id: string; canPost: boolean; task: unknown }[]>(
    await member.request.get("/api/v1/messaging/conversations", {
      params: { organizationId: member.organizationId, conversationId },
    }),
  );
  expect(conversations.find((conversation) => conversation.id === conversationId)).toMatchObject({
    canPost: false,
    task: { taskEntityId: second, projectEntityId: open, title: "Second task" },
  });
  await result(
    await write(owner, {
      action: "share",
      projectEntityId: open,
      actorEntityId: memberActor,
      level: "comment",
    }),
  );
  await result(await send(member, "Comment access can reply"));
  await rejected(
    await owner.request.post("/api/v1/messaging/members", {
      headers: { origin: appOrigin },
      data: { organizationId: owner.organizationId, conversationId, emails: [outsider.email] },
    }),
  );
  for (const action of ["join", "leave", "delete"]) {
    await rejected(
      await owner.request.post(`/api/v1/messaging/conversations/${action}`, {
        headers: { origin: appOrigin },
        data: { organizationId: owner.organizationId, conversationId },
      }),
    );
  }
  await result(
    await write(owner, { action: "revoke", projectEntityId: open, actorEntityId: memberActor }),
  );
  await rejected(await messages(member));
  await rejected(await resolve(member));
  await rejected(await send(member, "Revoked"));
});
