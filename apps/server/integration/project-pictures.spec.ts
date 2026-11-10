import type { ServiceResult } from "@startup-os/contracts/result";
import type { TasksWrite } from "@startup-os/contracts/tasks/input";

import { provisionVerifiedAccount } from "./test-support/auth";
import { appOrigin } from "./test-support/environment";
import { Mailpit } from "./test-support/mailpit";
import { provisionWorkspaceSession } from "./test-support/organizations";
import { expect, test, type APIRequestContext, type APIResponse } from "@playwright/test";
import { randomUUID } from "node:crypto";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
  "base64",
);

type WorkspaceWrite<T = TasksWrite> = T extends TasksWrite ? Omit<T, "organizationId"> : never;

async function result<T>(response: APIResponse): Promise<T> {
  expect(response.ok()).toBe(true);
  const body: ServiceResult<T> = await response.json();
  if (!body.success) throw new Error("Expected an authorized project operation.");
  return body.data;
}

test("project icon uploads and downloads enforce live project permissions, workspace and origin", async ({
  request,
  playwright,
}) => {
  test.setTimeout(30_000);
  const member = await playwright.request.newContext({ baseURL: appOrigin });
  const anonymous = await playwright.request.newContext({ baseURL: appOrigin });
  try {
    const suffix = randomUUID();
    const accounts = [
      { request, name: `Project owner ${suffix}`, email: `project-owner-${suffix}@example.test` },
      {
        request: member,
        name: `Project member ${suffix}`,
        email: `project-member-${suffix}@example.test`,
      },
    ];
    for (const account of accounts) {
      await provisionVerifiedAccount(account, new Mailpit(account.request), {
        name: account.name,
        email: account.email,
        password: `Pictures-${suffix}!`,
      });
    }
    const workspace = await provisionWorkspaceSession(
      request,
      "Project icons",
      `project-icons-${suffix}`,
    );
    const foreign = await provisionWorkspaceSession(member, "Other icons", `other-icons-${suffix}`);
    const write = (client: APIRequestContext, data: WorkspaceWrite) =>
      client.post("/api/v1/tasks/mutations", {
        headers: { origin: appOrigin },
        data: { organizationId: workspace.id, ...data },
      });
    const project = await result<{ id: string }>(
      await write(request, { action: "createProject", name: "Project icon permissions" }),
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
    expect((await upload(member, foreign.id)).status()).toBe(404);
    const { url } = await result<{ url: string }>(await upload(request));
    await result(
      await write(request, {
        action: "setProjectPicture",
        projectEntityId: project.id,
        image: url,
      }),
    );
    expect((await anonymous.get(url, { maxRedirects: 0 })).status()).toBeGreaterThanOrEqual(400);
    expect((await member.get(url, { maxRedirects: 0 })).status()).toBe(404);
    const invited = await request.post("/api/auth/organization/invite-member", {
      headers: { origin: appOrigin },
      data: { organizationId: workspace.id, email: accounts[1]!.email, role: "member" },
    });
    expect(invited.ok()).toBe(true);
    const invitation = await invited.json();
    expect(
      (
        await member.post("/api/auth/organization/accept-invitation", {
          headers: { origin: appOrigin },
          data: { invitationId: invitation.id },
        })
      ).ok(),
    ).toBe(true);
    expect(
      (
        await member.post("/api/auth/organization/set-active", {
          headers: { origin: appOrigin },
          data: { organizationId: workspace.id },
        })
      ).ok(),
    ).toBe(true);
    await result(
      await member.get("/api/v1/tasks/projects", { params: { organizationId: workspace.id } }),
    );
    expect((await upload(member)).status()).toBe(404);
    const detail = await result<{ actors: { entityId: string; name: string }[] }>(
      await request.get("/api/v1/tasks/project", {
        params: { organizationId: workspace.id, projectEntityId: project.id },
      }),
    );
    const actor = detail.actors.find((item) => item.name === accounts[1]!.name)!;
    await result(
      await write(request, {
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
        await write(member, {
          action: "setProjectPicture",
          projectEntityId: project.id,
          image: null,
        })
      ).status(),
    ).toBe(404);
    await result(
      await write(request, {
        action: "share",
        projectEntityId: project.id,
        actorEntityId: actor.entityId,
        level: "edit",
      }),
    );
    expect((await upload(member, workspace.id, "https://untrusted.example.test")).status()).toBe(
      403,
    );
    const replacement = await result<{ url: string }>(await upload(member));
    await result(
      await write(member, {
        action: "setProjectPicture",
        projectEntityId: project.id,
        image: replacement.url,
      }),
    );
    expect(replacement.url).not.toBe(url);
    await result(
      await write(request, {
        action: "revoke",
        projectEntityId: project.id,
        actorEntityId: actor.entityId,
      }),
    );
    expect((await member.get(replacement.url, { maxRedirects: 0 })).status()).toBe(404);
    expect((await upload(member)).status()).toBe(404);
    await result(
      await write(request, {
        action: "setProjectPicture",
        projectEntityId: project.id,
        image: null,
      }),
    );
    expect((await request.get(replacement.url, { maxRedirects: 0 })).status()).toBe(404);
  } finally {
    await Promise.all([member.dispose(), anonymous.dispose()]);
  }
});
