import { result, tasks } from "../test-support/api";
import { appOrigin } from "../test-support/environment";
import { png } from "../test-support/files";
import { test } from "../test-support/fixtures";
import { expect, type APIRequestContext } from "@playwright/test";

test("project icon uploads and downloads enforce live project permissions, workspace and origin", async ({
  actors: { owner, member: memberActor, outsider },
  request: anonymous,
}) => {
  const request = owner.request;
  const member = memberActor.request;
  const workspace = { id: owner.organizationId };
  const project = await result<{ id: string }>(
    await tasks.write(owner, { action: "createProject", name: "Project icon permissions" }),
  );
  const upload = (
    client: APIRequestContext,
    organizationId = workspace.id,
    uploadOrigin = appOrigin,
  ) =>
    client.post("/api/v1/files/pictures/project-icon", {
      headers: { origin: uploadOrigin },
      multipart: {
        organizationId,
        projectEntityId: project.id,
        file: { name: "icon.png", mimeType: "image/png", buffer: png },
      },
    });
  // Another organization cannot upload to or read the project.
  expect((await upload(outsider.request, outsider.organizationId)).status()).toBe(404);
  const { url } = await result<{ url: string }>(await upload(request));
  await result(
    await tasks.write(owner, {
      action: "setProjectPicture",
      projectEntityId: project.id,
      image: url,
    }),
  );
  expect((await anonymous.get(url, { maxRedirects: 0 })).status()).toBeGreaterThanOrEqual(400);
  expect((await outsider.request.get(url, { maxRedirects: 0 })).status()).toBe(404);
  // A workspace member without a project grant can neither read nor replace the icon.
  expect((await member.get(url, { maxRedirects: 0 })).status()).toBe(404);
  expect((await upload(member)).status()).toBe(404);
  const detail = await result<{ actors: { entityId: string; name: string }[] }>(
    await request.get("/api/v1/tasks/project", {
      params: { organizationId: workspace.id, projectEntityId: project.id },
    }),
  );
  const actor = detail.actors.find((item) => item.name === memberActor.name)!;
  await result(
    await tasks.write(owner, {
      action: "share",
      projectEntityId: project.id,
      actorEntityId: actor.entityId,
      level: "view",
    }),
  );
  const readable = await member.get(url);
  expect(readable.ok()).toBe(true);
  expect(readable.headers()["content-type"]).toMatch(/^image\//);
  expect((await upload(member)).status()).toBe(404);
  expect(
    (
      await tasks.write(memberActor, {
        action: "setProjectPicture",
        projectEntityId: project.id,
        image: null,
      })
    ).status(),
  ).toBe(404);
  await result(
    await tasks.write(owner, {
      action: "share",
      projectEntityId: project.id,
      actorEntityId: actor.entityId,
      level: "edit",
    }),
  );
  expect((await upload(member, workspace.id, "https://untrusted.example.test")).status()).toBe(403);
  const replacement = await result<{ url: string }>(await upload(member));
  await result(
    await tasks.write(memberActor, {
      action: "setProjectPicture",
      projectEntityId: project.id,
      image: replacement.url,
    }),
  );
  expect(replacement.url).not.toBe(url);
  await result(
    await tasks.write(owner, {
      action: "revoke",
      projectEntityId: project.id,
      actorEntityId: actor.entityId,
    }),
  );
  expect((await member.get(replacement.url, { maxRedirects: 0 })).status()).toBe(404);
  expect((await upload(member)).status()).toBe(404);
  await result(
    await tasks.write(owner, {
      action: "setProjectPicture",
      projectEntityId: project.id,
      image: null,
    }),
  );
  expect((await request.get(replacement.url, { maxRedirects: 0 })).status()).toBe(404);
});
