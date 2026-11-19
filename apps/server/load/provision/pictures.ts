import type { PictureKind } from "@substrate/contracts/files/pictures";

import { pictureImages } from "../k6/lib/picture-bytes";
import { api, json, parallel, type Account } from "./client";
import type { APIRequestContext } from "@playwright/test";

/**
 * Pictures as people add them in the app: about 60% of users set an avatar, each organization
 * has a logo, and every second project has an icon. Each is the web's two steps: a multipart
 * upload, then saving the returned URL.
 */

const image = (index: number) =>
  Buffer.from(pictureImages[index % pictureImages.length]!, "base64");

async function upload(
  client: APIRequestContext,
  purpose: PictureKind,
  index: number,
  fields: Record<string, string> = {},
) {
  const response = await client.post(`/api/v1/files/pictures/${purpose}`, {
    multipart: {
      ...fields,
      file: { name: "picture.png", mimeType: "image/png", buffer: image(index) },
    },
  });
  const result = await json<{ success: boolean; data: { url: string } }>(response);
  return result.data.url;
}

/** Deterministic, so a resumed run picks the same users. */
const hasAvatar = (email: string) => Number(email.match(/\d+/)?.[0] ?? 0) % 5 < 3;

export async function pictures(members: Account[], orgIndex: number) {
  const owner = members[0]!;
  const organizationId = owner.organizationId;
  await parallel(
    members.filter((member) => hasAvatar(member.email)),
    async (member, index) => {
      const session = await json<{ user: { image: string | null } }>(
        await member.client.get("/api/auth/get-session"),
      );
      if (session.user.image) return;
      const url = await upload(member.client, "avatar", orgIndex + index);
      await json(await member.client.post("/api/auth/update-user", { data: { image: url } }));
    },
  );

  const detail = await json<{ logo: string | null }>(
    await owner.client.get(
      `/api/auth/organization/get-full-organization?organizationId=${organizationId}`,
    ),
  );
  if (!detail.logo) {
    const url = await upload(owner.client, "organization-logo", orgIndex, { organizationId });
    await json(
      await owner.client.post("/api/auth/organization/update", {
        data: { organizationId, data: { logo: url } },
      }),
    );
  }

  const projects = await api<{ entityId: string; image: string | null }[]>(
    owner.client,
    `/api/v1/tasks/projects?organizationId=${organizationId}`,
  );
  await parallel(
    projects.filter((project, index) => index % 2 === 0 && !project.image),
    async (project, index) => {
      const url = await upload(owner.client, "project-icon", orgIndex + index + 1, {
        organizationId,
        projectEntityId: project.entityId,
      });
      await api(owner.client, "/api/v1/tasks/mutations", {
        organizationId,
        action: "setProjectPicture",
        projectEntityId: project.entityId,
        image: url,
      });
    },
  );
}
