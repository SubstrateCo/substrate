import { rejected, result } from "../test-support/api";
import { createCrm, writeCrm } from "../test-support/crm";
import { appOrigin } from "../test-support/environment";
import { test } from "../test-support/fixtures";
import { expect } from "@playwright/test";

test("CRM links require edit on the source and read on the target, filter backlinks, and preserve grants", async ({
  actors: { owner: sharedOwner, member: sharedMember, outsider },
  workspace,
  request: anonymous,
}) => {
  const [owner, member] = await workspace(sharedOwner, sharedMember);
  const source = await createCrm(owner, { action: "createAccount", name: "Link source" });
  const target = await createCrm(owner, { action: "createAccount", name: "Secret target" });
  const foreign = await createCrm(outsider, { action: "createAccount", name: "Foreign target" });
  const people = await result<{ entityId: string; userId: string }[]>(
    await owner.request.get("/api/v1/crm/people", {
      params: { organizationId: owner.organizationId },
    }),
  );
  const session: { user: { id: string } } = await (
    await member.request.get("/api/auth/get-session")
  ).json();
  const person = people.find((row) => row.userId === session.user.id);
  expect(person).toBeDefined();
  const data = {
    organizationId: owner.organizationId,
    entityId: source.entityId,
    otherEntityId: target.entityId,
  };
  const list = (actor: typeof owner, entityId = source.entityId) =>
    actor.request.get("/api/v1/crm/links", {
      params: { organizationId: actor.organizationId, entityId },
    });
  const write = (actor: typeof owner, origin = appOrigin) =>
    actor.request.post("/api/v1/crm/links", { headers: { origin }, data });
  expect((await anonymous.get("/api/v1/crm/links", { params: data })).status()).toBe(401);
  expect((await write(owner, "https://untrusted.example.test")).status()).toBe(403);
  await rejected(await write(member), ["Secret target"]);
  await result(
    await writeCrm(owner, {
      action: "share",
      entityId: source.entityId,
      actorEntityId: person!.entityId,
      level: "edit",
    }),
  );
  await rejected(await write(member), ["Secret target"]);
  await result(await write(owner));
  expect(await result(await list(member))).toEqual([]);
  await result(
    await writeCrm(owner, {
      action: "share",
      entityId: target.entityId,
      actorEntityId: person!.entityId,
      level: "view",
    }),
  );
  expect(await result(await list(member))).toMatchObject([
    { entityId: target.entityId, title: "Secret target" },
  ]);
  expect(await result(await list(member, target.entityId))).toMatchObject([
    { entityId: source.entityId },
  ]);
  await rejected(
    await member.request.delete("/api/v1/crm/links", {
      headers: { origin: appOrigin },
      data: { ...data, entityId: target.entityId, otherEntityId: source.entityId },
    }),
  );
  await rejected(
    await owner.request.post("/api/v1/crm/links", {
      headers: { origin: appOrigin },
      data: { ...data, otherEntityId: foreign.entityId },
    }),
    ["Foreign target"],
  );
  await result(
    await member.request.delete("/api/v1/crm/links", {
      headers: { origin: appOrigin },
      data,
    }),
  );
  expect(await result(await list(owner))).toEqual([]);
  await result(
    await writeCrm(owner, {
      action: "revoke",
      entityId: target.entityId,
      actorEntityId: person!.entityId,
    }),
  );
  await rejected(await list(member, target.entityId), ["Secret target"]);
});
