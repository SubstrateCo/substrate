import type { TasksWrite } from "@startup-os/contracts/tasks/input";

import { appOrigin } from "./test-support/environment";
import { rejected, result } from "./test-support/files";
import { test, type Actor } from "./test-support/fixtures";
import { expect } from "@playwright/test";

const origin = appOrigin;

type WorkspaceWrite<T = TasksWrite> = T extends TasksWrite ? Omit<T, "organizationId"> : never;
type End = { entityId: string; title: string } | null;
type Detail = {
  actors: { entityId: string; name: string }[];
  links: { id: string; kind: string; source: End; target: End; blocking: boolean }[];
};

const write = (actor: Actor, data: WorkspaceWrite, from = origin) =>
  actor.request.post("/api/v1/tasks/mutations", {
    headers: { origin: from },
    data: { organizationId: actor.organizationId, ...data },
  });
const created = async (actor: Actor, data: WorkspaceWrite) =>
  (await result<{ id: string }>(await write(actor, data))).id;
const project = (actor: Actor, projectEntityId: string) =>
  actor.request.get("/api/v1/tasks/project", {
    params: { organizationId: actor.organizationId, projectEntityId },
  });

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
  // The member can edit the visible task but cannot name a task they cannot open.
  await rejected(await write(member, link), ["Undisclosed acquisition"]);
  await rejected(
    await write(outsider, { ...link, relation: "relates_to", otherTaskEntityId: visible }),
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
  // A link is removed through a task it touches that the actor can edit.
  await rejected(await write(member, { ...remove, projectEntityId: closed, taskEntityId: secret }));
  await result(await write(member, { ...remove, projectEntityId: open, taskEntityId: visible }));
  expect((await result<Detail>(await project(owner, open))).links).toEqual([]);
});

test("comment references alert mentioned people and list backlinks only from readable tasks", async ({
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
  const comment = (projectEntityId: string, taskEntityId: string, body: string) =>
    ({ action: "comment", projectEntityId, taskEntityId, body }) as const;

  // The member cannot open the closed project, so a comment there cannot mention them.
  expect(
    (await write(owner, comment(closed, secret, `Ask @[person:${memberActor}]`))).status(),
  ).toBe(400);
  await rejected(await write(member, comment(open, visible, `See @[task:${secret}]`)), [
    "Undisclosed acquisition",
  ]);
  await result(await write(owner, comment(closed, secret, `Depends on @[task:${visible}]`)));
  await result(
    await write(
      owner,
      comment(
        open,
        second,
        `@[person:${memberActor}] see @[task:${visible}] and @[task:${secret}]`,
      ),
    ),
  );

  const comments = await member.request.get("/api/v1/tasks/comments", {
    params: { organizationId: member.organizationId, projectEntityId: open, taskEntityId: second },
  });
  expect(await comments.text()).not.toContain("Undisclosed acquisition");
  const [listed] =
    await result<{ references: { id: string; kind: string; label: string }[] }[]>(comments);
  expect(listed!.references).toEqual([
    { id: memberActor, kind: "person", label: member.name },
    { id: visible, kind: "task", label: "Visible task", projectEntityId: open },
  ]);

  const mentions = (actor: Actor, entityId: string, organizationId = actor.organizationId) =>
    actor.request.get("/api/v1/tasks/comment-mentions", { params: { organizationId, entityId } });
  const backlinks = await mentions(member, visible);
  expect(await backlinks.text()).not.toContain("Undisclosed acquisition");
  expect(
    (await result<{ taskEntityId: string }[]>(backlinks)).map((row) => row.taskEntityId),
  ).toEqual([second]);
  expect(
    (await result<{ taskEntityId: string }[]>(await mentions(owner, visible)))
      .map((row) => row.taskEntityId)
      .sort(),
  ).toEqual([second, secret].sort());
  await rejected(await mentions(member, secret), ["Undisclosed acquisition"]);
  await rejected(await mentions(outsider, visible));
  expect(
    (
      await anonymous.get("/api/v1/tasks/comment-mentions", {
        params: { organizationId: owner.organizationId, entityId: visible },
      })
    ).status(),
  ).toBe(401);

  const feed = await member.request.get("/api/v1/context/notifications/groups", {
    params: { organizationId: member.organizationId },
  });
  const { items } = await result<{ items: { kind: string; actorName: string | null }[] }>(feed);
  expect(items).toMatchObject([
    { kind: "mention", actorName: owner.name, entityId: second, title: "Second task" },
  ]);
});
