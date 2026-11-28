import { rejected, result, tasks } from "../test-support/api";
import { appOrigin } from "../test-support/environment";
import { test, type Actor } from "../test-support/fixtures";
import { expect } from "@playwright/test";

type Label = { id: string; type: string; title: string; projectId: string | null };

const labels = (
  actor: Actor,
  ids: string[],
  organizationId = actor.organizationId,
  origin = appOrigin,
) =>
  actor.request.post("/api/v1/context/record-labels", {
    headers: { origin },
    data: { organizationId, ids },
  });

test("record labels name only records the caller can open, in their own workspace", async ({
  actors: { owner: sharedOwner, member: sharedMember, outsider },
  workspace,
  request: anonymous,
}) => {
  const [owner, member] = await workspace(sharedOwner, sharedMember);
  const open = await tasks.create(owner, { action: "createProject", name: "Open work" });
  const closed = await tasks.create(owner, { action: "createProject", name: "Closed work" });
  const visible = await tasks.create(owner, {
    action: "createTask",
    projectEntityId: open,
    title: "Visible task",
  });
  const secret = await tasks.create(owner, {
    action: "createTask",
    projectEntityId: closed,
    title: "Undisclosed acquisition",
  });
  const detail = await result<{ actors: { entityId: string; name: string }[] }>(
    await tasks.project(owner, open),
  );
  const memberActor = detail.actors.find((actor) => actor.name === member.name)!.entityId;
  await result(
    await tasks.write(owner, {
      action: "share",
      projectEntityId: open,
      actorEntityId: memberActor,
      level: "view",
    }),
  );
  const ids = [open, visible, closed, secret, crypto.randomUUID()];

  const shown = await result<{ items: Label[] }>(await labels(member, ids));
  expect(shown.items).toEqual([
    { id: open, type: "project", title: "Open work", projectId: null, conversationId: null },
    { id: visible, type: "task", title: "Visible task", projectId: open, conversationId: null },
  ]);
  expect(JSON.stringify(shown)).not.toContain("Undisclosed acquisition");
  expect(JSON.stringify(shown)).not.toContain(closed);

  expect((await result<{ items: Label[] }>(await labels(outsider, ids))).items).toEqual([]);
  await rejected(await labels(outsider, ids, owner.organizationId), ["Closed work"]);

  expect(
    (
      await anonymous.post("/api/v1/context/record-labels", {
        headers: { origin: appOrigin },
        data: { organizationId: owner.organizationId, ids },
      })
    ).status(),
  ).toBe(401);
  expect((await labels(member, ids, undefined, "https://untrusted.example.test")).status()).toBe(
    403,
  );
  for (const invalid of [[], ["not-a-uuid"], Array.from({ length: 51 }, () => crypto.randomUUID())])
    expect((await labels(member, invalid)).status()).toBe(400);
});
